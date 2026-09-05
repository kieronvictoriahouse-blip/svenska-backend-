import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef } from '@/lib/finance/pcg';

export const dynamic = 'force-dynamic';

const TAUX_COTIS = 0.123;
const round = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear();

  const [{ data: entries }, { data: accounts }, { data: invoices }, { data: products }, { data: pos }] = await Promise.all([
    supabaseAdmin.from('accounting_entries').select('type, amount, category, is_personal').gte('date', `${year}-01-01`).lte('date', `${year}-12-31`),
    supabaseAdmin.from('bank_accounts').select('balance'),
    supabaseAdmin.from('invoices').select('total_ttc, status, due_date, client_name').in('status', ['sent', 'late']),
    supabaseAdmin.from('products').select('*'),
    supabaseAdmin.from('purchase_orders').select('total, status'),
  ]);

  // ── Regroupement par catégorie canonique ──
  const byCat: Record<string, number> = {};
  for (const e of entries || []) {
    if (e.is_personal) continue;
    const key = categoryDef(e.category).key;
    byCat[key] = (byCat[key] || 0) + Number(e.amount) * (e.type === 'income' ? 1 : -1);
  }
  const g = (k: string) => round(byCat[k] || 0);

  const ventes = g('vente') + g('pro');
  const port = g('port');
  const totalIn = round(ventes + port + g('remb'));
  const achats = g('march');
  const emb = g('emb');
  const transport = g('transport');
  const logiciel = g('logiciel');
  const depl = g('depl');
  const fraisBanque = round(g('banque') + g('stripe'));
  const mat = g('mat');
  const amort = g('amort');
  const cotis = -round(totalIn * TAUX_COTIS);   // provision de cotisations
  const beneficeAvant = round(totalIn + achats + emb + transport + logiciel + depl + fraisBanque + mat + amort);
  const resultatNet = round(beneficeAvant + cotis);

  const pl = [
    ['Ventes de marchandises', ventes, false],
    ['Frais de port encaissés', port, false],
    ['Total de ce qui est rentré', totalIn, true],
    ['Achats de marchandises', achats, false],
    ['Emballages & cartons', emb, false],
    ['Transport & livraison', transport, false],
    ['Site, logiciels & abonnements', logiciel, false],
    ['Déplacements professionnels', depl, false],
    ['Frais bancaires', fraisBanque, false],
    ['Matériel & petit équipement', mat, false],
    ...(amort ? [["Usure du matériel (amortissement)", amort, false] as [string, number, boolean]] : []),
    ['Bénéfice avant cotisations', beneficeAvant, true],
    ['Cotisations sociales', cotis, false],
    ['Ce que la boutique a réellement gagné', resultatNet, true],
  ] as [string, number, boolean][];

  // ── Bilan ──
  const banque = round((accounts || []).reduce((s, a) => s + (Number(a.balance) || 0), 0));
  const creances = round((invoices || []).reduce((s, i) => s + (Number(i.total_ttc) || 0), 0));
  const stock = round((products || []).reduce((s, p: any) => {
    const cost = Number(p.cost_price ?? p.cost ?? p.purchase_price ?? 0);
    const qty = Number(p.stock ?? p.stock_qty ?? p.quantity ?? p.qty ?? 0);
    return s + cost * qty;
  }, 0));
  const dettesFourn = round((pos || []).filter((p: any) => !['received', 'cancelled', 'paid', 'closed'].includes(p.status)).reduce((s: number, p: any) => s + (Number(p.total) || 0), 0));
  const apport = round((entries || []).filter(e => e.is_personal).reduce((s, e) => s + Number(e.amount) * (e.type === 'income' ? 1 : -1), 0));
  const cotisAPayer = round(totalIn * TAUX_COTIS);

  const actif = [
    ['Stock de marchandises', 'valorisé au coût d\'achat', stock],
    ['Argent que les clients doivent', `${(invoices || []).length} facture(s) ouverte(s)`, creances],
    ['Compte bancaire', 'solde du/des compte(s)', banque],
  ].filter(r => r[2] as number) as [string, string, number][];
  const totalActif = round(actif.reduce((s, r) => s + (r[2] as number), 0));

  const passifBase = [
    ['Ton apport de départ', "compte de l'exploitant", Math.max(0, apport)],
    ['Bénéfice de l\'année', 'après cotisations', resultatNet],
    ['Argent dû aux fournisseurs', 'commandes d\'achat en cours', dettesFourn],
    ['Cotisations à payer', 'provision URSSAF', cotisAPayer],
  ].filter(r => r[2] as number) as [string, string, number][];
  const totalPassif = round(passifBase.reduce((s, r) => s + (r[2] as number), 0));
  // Plug d'équilibre (report à nouveau) : l'actif = le passif par construction.
  const ecart = round(totalActif - totalPassif);
  const passif = ecart !== 0
    ? [...passifBase, ['Report des exercices antérieurs', 'ajustement d\'équilibre', ecart] as [string, string, number]]
    : passifBase;

  // ── Balance âgée des créances ──
  const now = Date.now();
  const buckets = [
    ['Pas encore dû', '#3E5238', (d: number) => d < 0],
    ['Moins de 30 jours', '#8A5B08', (d: number) => d >= 0 && d < 30],
    ['31 à 60 jours', '#A6501F', (d: number) => d >= 30 && d < 60],
    ['Plus de 60 jours', '#B03A2E', (d: number) => d >= 60],
  ] as [string, string, (d: number) => boolean][];
  const aged = buckets.map(([label, color, test]) => {
    const v = round((invoices || []).filter((i: any) => {
      const due = i.due_date ? new Date(i.due_date).getTime() : now;
      return test(Math.floor((now - due) / 86400000));
    }).reduce((s, i: any) => s + (Number(i.total_ttc) || 0), 0));
    return { label, color, value: v };
  });
  const agedMax = Math.max(1, ...aged.map(a => a.value));

  return NextResponse.json({
    year,
    pl: pl.map(([label, value, strong]) => ({ label, value, strong })),
    actif: { rows: actif.map(([label, note, value]) => ({ label, note, value })), total: totalActif },
    passif: { rows: passif.map(([label, note, value]) => ({ label, note, value })), total: round(totalPassif + ecart) },
    aged: aged.map(a => ({ ...a, pct: Math.round(a.value / agedMax * 100) })),
    creancesTotal: creances,
    immo: [], // table d'immobilisations à venir (amortissement au 31/12)
  });
}
