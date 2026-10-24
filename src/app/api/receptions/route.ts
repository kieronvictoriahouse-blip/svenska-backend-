import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { applyStockAndPmp, majCommandeAchat, lignesDe, recuDe } from '@/lib/reception-utils';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const poId = searchParams.get('purchase_order_id');
  let query = supabaseAdmin.from('receptions').select('*, contacts(company, first_name, last_name), purchase_orders(number)').order('created_at', { ascending: false });
  if (poId) query = query.eq('purchase_order_id', poId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ receptions: data || [] });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();

  /* Empêcher la double réception d'une même commande d'achat.
     La garde refusait toute seconde réception, y compris celle du
     reliquat d'une livraison partielle : le carton manquant, arrivé la
     semaine suivante, ne pouvait plus entrer. Elle ne refuse plus que ce
     qui est déjà entièrement reçu. */
  if (body.purchase_order_id) {
    const [{ data: po }, { data: existantes }] = await Promise.all([
      supabaseAdmin.from('purchase_orders').select('id, status, lines')
        .eq('id', body.purchase_order_id).maybeSingle(),
      supabaseAdmin.from('receptions').select('id, number, lines')
        .eq('purchase_order_id', body.purchase_order_id).neq('status', 'cancelled'),
    ]);
    if (!po) return NextResponse.json({ error: 'Commande d’achat introuvable' }, { status: 404 });
    if (po.status === 'cancelled') {
      return NextResponse.json({ error: 'Cette commande d’achat est annulée.' }, { status: 409 });
    }
    if (existantes?.length) {
      const recu: Record<string, number> = {};
      for (const r of existantes) for (const l of lignesDe(r.lines)) {
        if (l.product_id) recu[l.product_id] = (recu[l.product_id] || 0) + recuDe(l);
      }
      const commande: Record<string, number> = {};
      for (const l of lignesDe(po.lines)) {
        if (l.product_id) commande[l.product_id] = (commande[l.product_id] || 0) + (Number(l.qty) || 0);
      }
      const reliquat = Object.entries(commande)
        .reduce((s, [id, q]) => s + Math.max(0, q - (recu[id] || 0)), 0);
      if (reliquat <= 0) {
        return NextResponse.json(
          { error: `Cette commande a déjà été entièrement réceptionnée (${existantes.map(r => r.number).join(', ')}). Annulez la réception existante avant d'en créer une nouvelle.` },
          { status: 409 }
        );
      }
    }
  }

  /* Numérotation par le maximum existant, comme les commandes d'achat :
     compter les lignes redonnait un numéro déjà pris dès que deux
     réceptions se créaient en même temps. Les réceptions issues d'un
     ticket (REC-AAAA-NNN) ont leur propre série et ne comptent pas. */
  const { data: derniere } = await supabaseAdmin.from('receptions')
    .select('number').like('number', 'REC-____').order('number', { ascending: false }).limit(1);
  const num = String((Number(String(derniere?.[0]?.number || '').replace(/\D/g, '')) || 0) + 1).padStart(4, '0');
  const numero = `REC-${num}`;

  const lines = Array.isArray(body.lines) ? body.lines : [];

  // Créer la réception
  const { data: reception, error } = await supabaseAdmin.from('receptions').insert({
    number: numero,
    purchase_order_id: body.purchase_order_id || null,
    supplier_id: body.supplier_id || null,
    supplier_name: body.supplier_name,
    status: 'done',
    received_at: new Date().toISOString(),
    notes: body.notes,
    lines: JSON.stringify(lines),
    invoice_id: body.invoice_id || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message, details: (error as any).details, hint: (error as any).hint, code: (error as any).code }, { status: 500 });

  /* Mettre à jour le stock + PMP pour chaque ligne reçue. Un échec sur
     une ligne ne doit pas laisser croire que tout est entré : il est
     remonté, et le rejeu (POST /api/receptions/[id]) complète sans
     recompter ce qui est déjà passé. */
  const echecs: string[] = [];
  for (const line of lines) {
    if (!line.product_id || recuDe(line) <= 0) continue;
    try {
      await applyStockAndPmp(line, `Réception ${num} — ${body.supplier_name || ''}`, numero);
    } catch (e: any) {
      echecs.push(`${line.name || line.product_id} (${e?.message || 'erreur'})`);
      console.error('[receptions] stock non appliqué', line.product_id, e?.message);
    }
  }

  // Statut de la commande d'achat : reçue si tout est là, partielle sinon.
  const statut = body.purchase_order_id ? await majCommandeAchat(body.purchase_order_id) : null;

  return NextResponse.json({
    reception,
    statut_commande: statut,
    ...(echecs.length ? { warning: `Stock non mis à jour pour : ${echecs.join(', ')}.` } : {}),
  });
}
