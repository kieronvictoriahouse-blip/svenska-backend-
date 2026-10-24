import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef } from '@/lib/finance/pcg';
import { toutLire } from '@/lib/finance/tout-lire';

export const dynamic = 'force-dynamic';

const TAUX_COTIS = 0.123;      // BIC vente de marchandises
const SEUIL_MICRO = 188700;
const SEUIL_TVA = 91900;
const OBJECTIF = 30000;
const round = (n: number) => Math.round(n * 100) / 100;

const QUARTERS = [
  { q: 1, months: [0, 1, 2], label: '1ᵉʳ trimestre', deadline: (y: number) => new Date(y, 3, 30) },
  { q: 2, months: [3, 4, 5], label: '2ᵉ trimestre', deadline: (y: number) => new Date(y, 6, 31) },
  { q: 3, months: [6, 7, 8], label: '3ᵉ trimestre', deadline: (y: number) => new Date(y, 9, 31) },
  { q: 4, months: [9, 10, 11], label: '4ᵉ trimestre', deadline: (y: number) => new Date(y + 1, 0, 31) },
];

/* Le chiffre d'affaires déclaré : les recettes, sans l'apport de
   l'exploitant (is_personal) ni un remboursement reçu d'un tiers (758),
   qui ne sont pas des ventes. */
const estRecette = (e: any) => e.type === 'income' && !e.is_personal && categoryDef(e.category).key !== 'remb';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const now = new Date();
  let year = Number(req.nextUrl.searchParams.get('year')) || now.getFullYear();

  /* Trimestre par défaut : celui qu'on DOIT déclarer, c'est-à-dire le
     dernier trimestre terminé — son échéance est la prochaine. L'ancien
     défaut (le trimestre en cours) montrait le 24 octobre le T4 à peine
     commencé, échéance 31 janvier, alors que le T3 était dû le 31
     octobre. En janvier, c'est le T4 de l'année précédente. */
  let qParam = Number(req.nextUrl.searchParams.get('quarter'));
  if (!qParam) {
    if (year < now.getFullYear()) qParam = 4;
    else {
      const enCours = Math.floor(now.getMonth() / 3) + 1;
      if (enCours === 1) { qParam = 4; year -= 1; } else qParam = enCours - 1;
    }
  }
  const quarter = QUARTERS.find(x => x.q === qParam) || QUARTERS[2];

  const from = `${year}-${String(quarter.months[0] + 1).padStart(2, '0')}-01`;
  const toMonth = quarter.months[2] + 1;
  const lastDay = new Date(year, toMonth, 0).getDate();
  const to = `${year}-${String(toMonth).padStart(2, '0')}-${lastDay}`;

  /* Lecture complète de l'année (Supabase plafonne à 1000 lignes : le
     montant à déclarer était sous-évalué sans avertissement), le
     trimestre en est extrait. */
  let yEntries: any[];
  try {
    yEntries = await toutLire(() => supabaseAdmin.from('accounting_entries')
      .select('id, type, amount, is_personal, category, date')
      .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`)
      .order('date', { ascending: true }).order('id', { ascending: true }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  const qEntries = yEntries.filter(e => e.date >= from && e.date <= to);

  /* Justificatifs manquants : les dépenses rangées depuis le relevé
     bancaire (celles qu'on justifie par un ticket). L'ancienne requête
     lisait `data` d'une requête `head` — toujours null, donc toujours
     « 0 manquant » — et aurait compté les frais Stripe automatiques. */
  const { count: missing } = await supabaseAdmin.from('accounting_entries').select('id', { count: 'exact', head: true })
    .eq('type', 'expense').eq('source', 'bank').eq('is_personal', false).is('receipt_url', null).gte('date', from).lte('date', to);

  const amount = round(qEntries.filter(estRecette).reduce((s, e) => s + Number(e.amount), 0));
  const cotis = round(amount * TAUX_COTIS);
  const yearIncome = round(yEntries.filter(estRecette).reduce((s, e) => s + Number(e.amount), 0));

  // Projection fin d'année (extrapolation linéaire sur le temps écoulé).
  const dayOfYear = Math.floor((now.getTime() - new Date(year, 0, 0).getTime()) / 86400000);
  const projection = year === now.getFullYear() && dayOfYear > 0
    ? round(yearIncome / dayOfYear * 365) : yearIncome;

  const deadline = quarter.deadline(year);
  const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);

  // Pile de tri vidée ? (aucune ligne bancaire non rangée sur le trimestre)
  const { count: unsorted } = await supabaseAdmin.from('bank_transactions').select('id', { count: 'exact', head: true })
    .eq('reconciled', false).eq('ignored', false).gte('booking_date', from).lte('booking_date', to);

  const gauge = (label: string, value: number, max: number, note: string) => ({
    label, value, max, pct: Math.min(100, Math.round(value / max * 100)), note,
  });

  return NextResponse.json({
    year, quarter: quarter.q, quarterLabel: `${quarter.label} ${year}`,
    amount, cotis, tauxCotis: TAUX_COTIS,
    deadline: deadline.toISOString().slice(0, 10),
    deadlineLabel: deadline.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
    daysUntil,
    coverageLabel: `${new Date(year, quarter.months[0]).toLocaleDateString('fr-FR', { month: 'short' })} → ${new Date(year, quarter.months[2]).toLocaleDateString('fr-FR', { month: 'short' })}`,
    allSorted: (unsorted || 0) === 0,
    missingReceipts: missing || 0,
    gauges: [
      gauge('Plafond micro-entreprise', yearIncome, SEUIL_MICRO, yearIncome < SEUIL_MICRO * 0.7 ? 'Très loin du plafond — rien à craindre cette année.' : "Attention, tu approches du plafond micro."),
      gauge('Passage à la TVA', yearIncome, SEUIL_TVA, `Au rythme actuel, fin d'année vers ${projection.toLocaleString('fr-FR')} € : ${projection < SEUIL_TVA ? 'la franchise de TVA est conservée.' : 'la TVA deviendrait applicable.'}`),
      gauge('Objectif ' + year, yearIncome, OBJECTIF, yearIncome >= OBJECTIF ? 'Objectif atteint.' : `Il manque ${round(OBJECTIF - yearIncome).toLocaleString('fr-FR')} € pour atteindre l'objectif.`),
    ],
    deadlines: nextDeadlines(now),
  });
}

/* Les prochaines échéances à partir d'aujourd'hui. L'ancienne liste était
   figée (« 31 octobre · 3ᵉ trimestre » en tête toute l'année) : de
   janvier à septembre, les échéances du 30 avril et du 31 juillet
   n'apparaissaient jamais. */
function nextDeadlines(now: Date) {
  const y = now.getFullYear();
  const debutJour = new Date(y, now.getMonth(), now.getDate()).getTime();
  const longue = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const urssaf = [y - 1, y, y + 1].flatMap(yy => QUARTERS.map(q => ({
    when: longue(q.deadline(yy)), label: `Déclaration URSSAF · ${q.label} ${yy}`, date: q.deadline(yy), note: '',
  }))).filter(d => d.date.getTime() >= debutJour).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 2);

  const finExercice = new Date(y, 11, 31);
  // Revenus de l'année N : déclarés en mai N+1 (2042-C-PRO).
  const anneeRevenus = now.getMonth() < 5 ? y - 1 : y;
  const items = [
    ...urssaf,
    { when: longue(finExercice), label: "Clôture de l'exercice", date: finExercice, note: 'inventaire du stock à réaliser' },
    { when: `Mai ${anneeRevenus + 1}`, label: 'Déclaration de revenus ' + anneeRevenus, date: new Date(anneeRevenus + 1, 4, 15), note: 'formulaire 2042-C-PRO' },
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  return items.map((d, i) => {
    const days = Math.ceil((d.date.getTime() - now.getTime()) / 86400000);
    return { when: d.when, label: d.label, note: d.note || (days > 0 ? `dans ${days} jours` : 'échéance passée'), highlight: i === 0 && days > 0 };
  });
}
