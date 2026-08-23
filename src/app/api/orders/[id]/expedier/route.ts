import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   EXPÉDITION D'UN COLIS — sortie de stock et solde de la commande

   Un seul appel fait les deux, et c'est le point de la manœuvre.

   Avant, l'écran de préparation enchaînait lui-même : une écriture de
   stock par produit, puis la mise à jour de la commande. Deux
   conséquences, toutes deux constatées en production :

   · Le stock partait AVANT que la commande soit soldée. Si la mise à
     jour échouait, l'opérateur voyait « échec », recommençait — et le
     stock sortait une deuxième fois. C'est ce qui est arrivé à SD-0107
     le 17/08 et à SD-0105 le 20/08 : deux passes à quelques minutes
     d'intervalle, 6 unités disparues pour rien.

   · La quantité déjà expédiée venait de l'état du navigateur. Un
     onglet resté ouvert, un rechargement au mauvais moment, et le
     calcul repartait de zéro.

   Ici, la référence est la BASE, jamais l'appelant. Le colis est
   plafonné à ce qui reste réellement dû, relu à l'instant. Rejouer le
   même appel ne retire donc rien de plus : le reste dû est déjà à zéro.
   L'idempotence ne repose pas sur la discipline de l'appelant.
   ═══════════════════════════════════════════════════════════════ */

const J = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const demande: Record<string, number> = body.colis || {};
  /* `body.tout` n'est plus lu : le statut se déduit de ce qui reste dû
     en base, jamais de l'intention de l'appelant. */

  const { data: order } = await supabaseAdmin
    .from('orders').select('*').eq('id', params.id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

  /* Ce qui est dû, par produit. Une même référence peut apparaître sur
     plusieurs lignes — un remplacement de rupture en ajoute une — et
     les quantités s'additionnent alors. Prendre la ligne au lieu du
     total ferait disparaître la seconde. */
  const du: Record<string, number> = {};
  for (const l of J(order.lines)) {
    if (!l.product_id) continue;
    du[l.product_id] = (du[l.product_id] || 0) + (Number(l.qty) || 0);
  }

  const deja: Record<string, number> = (order as any).shipped_qty || {};

  /* Le colis réellement expédiable : ce qui est demandé, plafonné par
     ce qui reste dû. C'est ici que l'idempotence se joue. */
  const colis: Record<string, number> = {};
  for (const [pid, n] of Object.entries(demande)) {
    const reste = (du[pid] || 0) - (Number(deja[pid]) || 0);
    const q = Math.min(Math.max(0, Math.trunc(Number(n) || 0)), Math.max(0, reste));
    if (q > 0) colis[pid] = q;
  }

  const ignores = Object.keys(demande).filter(pid => !colis[pid]);

  if (!Object.keys(colis).length) {
    /* Rien à envoyer : soit le colis est vide, soit tout est déjà parti.
       Le second cas est un rejeu — on le dit, on ne le refait pas. */
    return NextResponse.json({
      ok: true, rejeu: true, applied: [], ignores,
      message: 'Rien à expédier : ces quantités sont déjà parties.',
    });
  }

  /* ── Réclamer AVANT de déduire ────────────────────────────────────
     La commande s'écrit d'abord, conditionnée à `updated_at` : si un
     double-clic ou un second onglet est passé entre notre lecture et
     ici, l'écriture ne prend pas et on s'arrête SANS avoir touché au
     stock. L'ordre inverse — déduire puis solder — est exactement ce
     qui a sorti deux fois SD-0105 et SD-0107.

     Si la déduction échoue après la réclamation, la commande dit
     « parti » sans sortie de stock : le contrôle 5 de l'audit et le
     cron quotidien le signalent, et la réponse le dit en clair. C'est
     le sens d'échec choisi — un stock trop haut se voit et se corrige,
     une double sortie s'était fondue dans la masse pendant trois
     jours. */
  const cumul: Record<string, number> = { ...deja };
  for (const [pid, n] of Object.entries(colis)) cumul[pid] = (Number(cumul[pid]) || 0) + n;

  const resteApres = Object.keys(du).reduce(
    (s, pid) => s + Math.max(0, (du[pid] || 0) - (Number(cumul[pid]) || 0)), 0);
  const statut = resteApres > 0 ? 'partial' : 'shipped';

  const maj: any = {
    status: statut,
    shipped_qty: cumul,
    last_shipment: colis,
    picked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (statut === 'partial') maj.backorder_at = new Date().toISOString();
  if (statut === 'shipped') maj.picking = null;

  let ecriture = supabaseAdmin.from('orders').update(maj).eq('id', order.id);
  /* La garde optimiste. Un ancien enregistrement sans updated_at ne
     peut pas être gardé — on écrit alors sans condition, le plafond sur
     le reste dû protège déjà du rejeu, à la fenêtre de course près. */
  if (order.updated_at) ecriture = ecriture.eq('updated_at', order.updated_at);
  const { data: reclame, error: majErr } = await ecriture.select('id');
  if (majErr) return NextResponse.json({ error: majErr.message }, { status: 500 });
  if (!reclame || !reclame.length) {
    return NextResponse.json({
      ok: true, rejeu: true, applied: [], ignores: Object.keys(demande),
      message: 'Cette commande vient d’être expédiée par un autre poste — rien n’a été refait.',
    });
  }

  /* ── Sortie de stock ──────────────────────────────────────────────
     `order_id` est renseigné : c'est ce qui rattache la sortie à la
     commande et rend l'anomalie détectable après coup. Les sorties de
     picking n'en portaient pas, et le contrôle quotidien ne les voyait
     donc pas. */
  const { adjustStock } = await import('@/lib/stock');
  const { data: produits } = await supabaseAdmin
    .from('products').select('id, track_stock').in('id', Object.keys(colis));
  const suivi = new Set((produits || []).filter((p: any) => p.track_stock === true).map((p: any) => p.id));

  const applied: Array<{ product_id: string; qty: number }> = [];
  const echecs: Array<{ product_id: string; erreur: string }> = [];
  for (const [pid, n] of Object.entries(colis)) {
    if (!suivi.has(pid)) { applied.push({ product_id: pid, qty: n }); continue; }
    try {
      await adjustStock(pid, -n, {
        reason: 'picking',
        reference: order.order_number,
        order_id: order.id,
        note: `Expédition ${order.order_number}`,
      });
      applied.push({ product_id: pid, qty: n });
    } catch (e: any) {
      echecs.push({ product_id: pid, erreur: e?.message || 'erreur inconnue' });
    }
  }

  return NextResponse.json({
    ok: true, rejeu: false, statut, applied, ignores,
    reste: resteApres, shipped_qty: cumul, last_shipment: colis,
    ...(echecs.length ? { echecs } : {}),
  });
}
