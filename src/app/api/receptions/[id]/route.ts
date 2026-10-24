import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { applyStockAndPmp, majCommandeAchat, lignesDe, recuDe } from '@/lib/reception-utils';
import { requireAuth } from '@/lib/auth';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { data: reception, error } = await supabaseAdmin
    .from('receptions').select('*').eq('id', params.id).single();
  if (error || !reception) return NextResponse.json({ error: 'Réception introuvable' }, { status: 404 });
  if (reception.status === 'cancelled') return NextResponse.json({ error: 'Déjà annulée' }, { status: 400 });

  /* L'annulation se réserve AVANT de toucher au stock : deux clics, ou
     deux onglets, lisaient tous deux « pas encore annulée » et retiraient
     chacun la marchandise. La mise à jour conditionnelle ne réussit
     qu'une fois. */
  const { data: pris } = await supabaseAdmin.from('receptions')
    .update({ status: 'cancelled' }).eq('id', params.id).neq('status', 'cancelled').select('id');
  if (!pris || !pris.length) return NextResponse.json({ error: 'Déjà annulée' }, { status: 400 });

  const lines = lignesDe(reception.lines);

  // Inverser le stock et le PMP pour chaque ligne
  for (const line of lines) {
    const qty = recuDe(line);
    if (!line.product_id || qty <= 0) continue;
    // Prix en euros : les anciennes lignes de ticket avaient des couronnes dans unit_cost.
    const cost = parseFloat(line.unit_cost_eur ?? line.unit_cost) || 0;

    const { data: product } = await supabaseAdmin.from('products')
      .select('stock, cost_price').eq('id', line.product_id).single();
    if (!product) continue;

    /* On retire du PMP ce que la réception y avait apporté, tant qu'il
       reste des unités pour porter la moyenne. Sinon on garde le dernier
       PMP connu : le mettre à 0 (ancien comportement, dès que le rayon
       tombait à zéro) faisait afficher 100 % de marge sur ce produit
       jusqu'à la réception suivante. */
    const stock = Number(product.stock) || 0;
    const pmp = Number(product.cost_price) || 0;
    const reste = stock - qty;
    let newPmp = pmp;
    if (reste > 0) {
      const v = (stock * pmp - qty * cost) / reste;
      if (v > 0) newPmp = v;
    }

    await supabaseAdmin.from('products').update({
      cost_price: Math.round(newPmp * 10000) / 10000,
    }).eq('id', line.product_id);

    /* Même chose qu'à la réception : la quantité passe par adjustStock.
       L'ancien code posait un mouvement avec une quantité négative ET un
       type 'out' — deux conventions contradictoires dans la même ligne,
       que le journal lisait de travers. */
    const { adjustStock } = await import('@/lib/stock');
    await adjustStock(line.product_id, -qty, {
      reason: `Annulation réception ${reception.number}`,
      reference: reception.number,
    });
  }

  /* Statut de la commande d'achat recalculé sur les réceptions qui
     restent : partielle, reçue, ou de nouveau confirmée s'il n'en reste
     aucune. */
  if (reception.purchase_order_id) await majCommandeAchat(reception.purchase_order_id);

  return NextResponse.json({ success: true, reversed: lines.length });
}

/**
 * Rejeu d'une réception : applique le stock des lignes qui ne sont
 * jamais entrées (échec en cours de route).
 *
 * Il réappliquait TOUTES les lignes, sans garde : deux appels, ou un
 * appel sur une réception déjà passée, doublaient le stock et
 * redécalaient le PMP. Une ligne n'est rejouée que si aucun mouvement
 * d'entrée ne la rattache déjà à cette réception.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { data: reception, error } = await supabaseAdmin
    .from('receptions').select('*').eq('id', params.id).single();
  if (error || !reception) return NextResponse.json({ error: 'Réception introuvable' }, { status: 404 });
  if (reception.status === 'cancelled') {
    return NextResponse.json({ error: 'Réception annulée : rien à rejouer' }, { status: 400 });
  }

  const numero = String(reception.number || '');
  const chiffres = numero.replace(/^REC-/, '');

  /* Trois traces possibles d'une entrée déjà faite :
     · la référence = numéro de réception (depuis cette correction) ;
     · la référence = numéro de commande du ticket (PO-AAAA-NNN) ;
     · les anciennes réceptions, sans référence : « Réception 0008 — … »
       ou « Rejeu réception REC-0008 — … » dans le motif. */
  const [parRef, parMotif, parRejeu] = await Promise.all([
    supabaseAdmin.from('stock_movements').select('product_id, delta')
      .in('reference', [numero, `PO-${chiffres}`]),
    supabaseAdmin.from('stock_movements').select('product_id, delta')
      .ilike('reason', `Réception ${chiffres} —%`),
    supabaseAdmin.from('stock_movements').select('product_id, delta')
      .ilike('reason', `Rejeu réception ${numero} —%`),
  ]);
  const dejaEntres = new Set(
    [...(parRef.data || []), ...(parMotif.data || []), ...(parRejeu.data || [])]
      .filter(m => (Number(m.delta) || 0) > 0)
      .map(m => m.product_id as string),
  );

  const lines = lignesDe(reception.lines);
  const reason = `Rejeu réception ${numero} — ${reception.supplier_name || ''}`;

  let rejouees = 0;
  const ignorees: string[] = [];
  const echecs: string[] = [];
  for (const line of lines) {
    if (!line.product_id || recuDe(line) <= 0) continue;
    if (dejaEntres.has(line.product_id)) { ignorees.push(line.name || line.product_id); continue; }
    try {
      await applyStockAndPmp(line, reason, numero);
      rejouees++;
    } catch (e: any) {
      echecs.push(`${line.name || line.product_id} (${e?.message || 'erreur'})`);
    }
  }

  return NextResponse.json({
    success: echecs.length === 0, replayed: rejouees, deja_entrees: ignorees,
    ...(echecs.length ? { echecs } : {}),
  });
}
