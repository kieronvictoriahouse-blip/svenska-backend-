// ─── /api/invoices/route.ts ───────────────────────────────────────
// Coller dans : src/app/api/invoices/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { nextSequentialNumber, dateParis } from '@/lib/invoice-utils';

const PAGE = 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* Statuts qu'une facture saisie à la main peut prendre. « avoir » et
   « refunded » appartiennent au remboursement d'une commande. */
const STATUTS = ['draft', 'sent', 'paid', 'late'];

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  /* Par pages : Supabase plafonne une réponse à 1000 lignes, la liste
     (et les totaux de la Facturation) s'arrêtaient là sans le dire. */
  const invoices: any[] = [];
  for (let debut = 0; ; debut += PAGE) {
    let q = supabaseAdmin.from('invoices').select('*')
      .order('date', { ascending: false }).order('number', { ascending: false })
      .range(debut, debut + PAGE - 1);
    if (searchParams.get('status')) q = q.eq('status', searchParams.get('status')!);
    if (searchParams.get('order_id')) q = q.eq('order_id', searchParams.get('order_id')!);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invoices.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return NextResponse.json({ invoices });
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  /* Liste blanche : l'ancien `...body` laissait le navigateur imposer
     n'importe quelle colonne (statut « avoir », order_id, vendeur…). */
  const clientName = String(body.client_name || '').trim();
  if (!clientName) return NextResponse.json({ error: 'Nom du client requis' }, { status: 400 });
  const status = body.status || 'draft';
  if (!STATUTS.includes(status)) return NextResponse.json({ error: `Statut « ${status} » non autorisé` }, { status: 400 });

  let brutes: any[] = [];
  try { brutes = typeof body.lines === 'string' ? JSON.parse(body.lines) : (body.lines || []); } catch { brutes = []; }
  if (!Array.isArray(brutes) || !brutes.length) return NextResponse.json({ error: 'Au moins une ligne est requise' }, { status: 400 });
  const lines = [];
  for (const l of brutes) {
    const qty = Number(l?.qty), price = Number(l?.price), tva = Number(l?.tva || 0);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) {
      return NextResponse.json({ error: 'Ligne invalide (quantité ou prix)' }, { status: 400 });
    }
    /* Franchise en base (art. 293 B) : facturer de la TVA la rendrait
       exigible (art. 283-3 CGI) sans droit à déduction. On refuse
       plutôt que de corriger en silence. */
    if (tva !== 0) return NextResponse.json({ error: 'TVA non applicable (art. 293 B du CGI) : les lignes doivent être à 0 %.' }, { status: 422 });
    lines.push({ desc: String(l.desc || '').trim() || 'Article', qty, price: round2(price), tva: 0 });
  }
  // Totaux recalculés ici, jamais repris du navigateur : HT = TTC, TVA 0.
  const total = round2(lines.reduce((s, l) => s + round2(l.qty * l.price), 0));

  /* Date d'émission : la numérotation suit la chronologie (art. 242
     nonies A CGI). Une facture datée d'avant la dernière de la série,
     ou dans le futur, casserait la séquence. */
  const aujourdhui = dateParis();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? String(body.date) : aujourdhui;
  if (date > aujourdhui) return NextResponse.json({ error: 'Une facture ne peut pas être datée dans le futur.' }, { status: 422 });
  const year = date.slice(0, 4);
  const { data: derniere } = await supabaseAdmin.from('invoices').select('date, number')
    .like('number', `FAC-${year}-%`).order('date', { ascending: false }).limit(1);
  if (derniere?.[0]?.date && date < derniere[0].date) {
    return NextResponse.json({
      error: `La dernière facture de ${year} (${derniere[0].number}) est datée du ${derniere[0].date} : la nouvelle ne peut pas être antérieure.`,
    }, { status: 422 });
  }

  /* Identité du vendeur figée à l'émission, comme pour les factures de
     commande : sans elle, la pièce sortait sans SIREN et son Factur-X
     était impossible à produire. Lecture ratée = pas de facture. */
  const { data: cfg, error: cfgErr } = await supabaseAdmin
    .from('white_label_config').select('*').limit(1).maybeSingle();
  if (cfgErr) return NextResponse.json({ error: 'Configuration vendeur illisible — facture non créée.' }, { status: 503 });

  // Numéro séquentiel généré côté serveur — jamais celui fourni par le client
  // (Art. 242 nonies A CGI : séquence continue, unique, non falsifiable).
  const ligne = {
    date, status,
    client_name: clientName,
    client_email: String(body.client_email || '').trim(),
    client_address: String(body.client_address || '').trim(),
    note: String(body.note || ''),
    lines: JSON.stringify(lines),
    total_ht: total, total_tva: 0, total_ttc: total,
    legal_mention: 'TVA non applicable, art. 293 B du CGI',
    seller_name: cfg?.site_name || '',
    seller_siret: cfg?.siret || '',
    seller_address: cfg?.address || '',
    seller_email: cfg?.email || '',
    seller_phone: cfg?.phone || '',
    ...(status === 'paid' ? { paid_at: new Date().toISOString() } : {}),
  };

  let data: any = null, error: any = null;
  for (let essai = 0; essai < 3 && !data; essai++) {
    const numero = await nextSequentialNumber(`FAC-${year}-`);
    const res = await supabaseAdmin.from('invoices').insert({ ...ligne, number: numero }).select().single();
    if (res.data) { data = res.data; break; }
    error = res.error;
    if (!/duplicate|unique/i.test(String(res.error?.message))) break;
  }
  if (!data) return NextResponse.json({ error: error?.message || 'Création impossible' }, { status: 500 });

  const { scellerFacture } = await import('@/lib/facture-integrite');
  await scellerFacture(data.id).catch(() => {});
  return NextResponse.json({ invoice: data }, { status: 201 });
}
