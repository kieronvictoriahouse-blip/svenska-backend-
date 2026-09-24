import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { lundiDe } from '@/lib/relance-panier';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   RELANCE DES PANIERS — BACK-OFFICE

   GET    → paniers abandonnés des 60 derniers jours, chiffres, offres
            des semaines à venir, codes promo et produits disponibles
            pour composer une offre.
   POST   → enregistre l'offre d'une semaine (ou « rien »).
   DELETE → retire l'offre d'une semaine.
   ═══════════════════════════════════════════════════════════════ */

const parseLines = (v: any): any[] => {
  try { const l = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(l) ? l : []; }
  catch { return []; }
};

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const depuis = new Date(Date.now() - 60 * 86400_000).toISOString();
  const lundi = lundiDe();
  const [paniers, offres, codes, produits] = await Promise.all([
    supabaseAdmin.from('orders')
      .select('id, order_number, created_at, status, customer_email, total, lines, recovery_token, recovery_1_sent_at, recovery_2_sent_at, recovery_skip_reason, recovered_at, recovered_order_id')
      .in('status', ['pending', 'abandoned'])
      .gte('created_at', depuis)
      .order('created_at', { ascending: false })
      .limit(300),
    supabaseAdmin.from('cart_recovery_offers').select('*')
      .gte('week_start', lundi).order('week_start', { ascending: true }).limit(20),
    supabaseAdmin.from('promo_codes')
      .select('id, code, type, value, min_order, is_active, valid_until, single_use_per_customer')
      .in('type', ['percent', 'fixed', 'free_shipping'])
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('products')
      .select('id, name_fr, stock, track_stock, is_active, price')
      .eq('is_active', true).order('name_fr'),
  ]);

  // Montant des commandes payées qui ont « récupéré » un panier relancé.
  const recupIds = Array.from(new Set((paniers.data || []).map(p => p.recovered_order_id).filter(Boolean)));
  const { data: recup } = recupIds.length
    ? await supabaseAdmin.from('orders').select('id, order_number, total').in('id', recupIds)
    : { data: [] as any[] };
  const R = Object.fromEntries((recup || []).map(o => [o.id, o]));

  const rows = (paniers.data || []).map(p => {
    const lignes = parseLines(p.lines).filter(l => (Number(l.price) || 0) > 0);
    return {
      id: p.id, numero: p.order_number, cree: p.created_at, statut: p.status,
      email: p.customer_email, total: Number(p.total) || 0,
      articles: lignes.map(l => `${l.qty} × ${l.name}`).join(', '),
      relancable: !!p.recovery_token,
      r1: p.recovery_1_sent_at, r2: p.recovery_2_sent_at,
      raison: p.recovery_skip_reason, recupere: p.recovered_at,
      commande_recuperee: p.recovered_order_id ? R[p.recovered_order_id] || null : null,
    };
  });

  const avecEmail = rows.filter(r => r.email);
  const relances = rows.filter(r => r.r1);
  const recuperes = rows.filter(r => r.recupere);
  const stats = {
    paniers: rows.length,
    valeur: rows.reduce((s, r) => s + r.total, 0),
    avec_email: avecEmail.length,
    relances: relances.length,
    recuperes: recuperes.length,
    ca_recupere: recuperes.reduce((s, r) => s + (Number(r.commande_recuperee?.total) || 0), 0),
  };

  return NextResponse.json({
    lundi, stats, paniers: rows,
    offres: offres.data || [],
    codes: codes.data || [],
    produits: produits.data || [],
    offres_error: offres.error?.message || null,
  });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  const week = String(b.week_start || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return NextResponse.json({ error: 'Semaine invalide' }, { status: 400 });
  const semaine = lundiDe(new Date(week + 'T12:00:00Z'));   // toujours ramené au lundi
  const kind = b.kind === 'code' || b.kind === 'cadeau' ? b.kind : 'none';
  const apply = ['r1', 'r2', 'both'].includes(b.apply_to) ? b.apply_to : 'r2';

  const ligne: Record<string, any> = {
    week_start: semaine,
    promo_code_id: kind === 'code' ? (b.promo_code_id || null) : null,
    gift_product_id: kind === 'cadeau' ? (b.gift_product_id || null) : null,
    apply_to: apply,
    message_fr: (b.message_fr || '').trim() || null,
    message_en: (b.message_en || '').trim() || null,
    message_sv: (b.message_sv || '').trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (kind === 'code' && !ligne.promo_code_id) return NextResponse.json({ error: 'Choisis un code promo' }, { status: 400 });
  if (kind === 'cadeau' && !ligne.gift_product_id) return NextResponse.json({ error: 'Choisis le produit offert' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('cart_recovery_offers').upsert(ligne, { onConflict: 'week_start' }).select().single();
  if (error) {
    /* Colonne gift_product_id absente = ajout SQL pas encore passé. */
    const msg = /gift_product_id/.test(error.message)
      ? 'La base n’a pas encore la colonne « produit offert » : lancer la commande SQL fournie.'
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ ok: true, offre: data });
}

export async function DELETE(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const week = String(req.nextUrl.searchParams.get('week_start') || '').slice(0, 10);
  if (!week) return NextResponse.json({ error: 'Semaine manquante' }, { status: 400 });
  const { error } = await supabaseAdmin.from('cart_recovery_offers').delete().eq('week_start', week);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
