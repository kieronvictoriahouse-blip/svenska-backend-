import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { repartir } from '@/lib/landed';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const receptionId = req.nextUrl.searchParams.get('reception_id');
  let query = supabaseAdmin.from('landed_costs').select('*').order('created_at', { ascending: false });
  if (receptionId) query = query.eq('reception_id', receptionId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ landed_costs: data || [] });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { reception_id, description, amount, allocation_method } = body;
  /* Sélection d'articles : toutes les lignes ne portent pas le port —
     un carton volumineux ne doit pas se faire subventionner par un
     sachet plat. Absente, on impute sur tout, comme avant. */
  const choisis: string[] | null = Array.isArray(body.product_ids) && body.product_ids.length
    ? body.product_ids : null;

  if (!reception_id || !amount || !description) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  // Récupérer les lignes de la réception
  const { data: reception } = await supabaseAdmin
    .from('receptions').select('*').eq('id', reception_id).single();
  if (!reception) return NextResponse.json({ error: 'Réception introuvable' }, { status: 404 });

  const lines: any[] = typeof reception.lines === 'string'
    ? JSON.parse(reception.lines) : reception.lines || [];

  const validLines = lines.filter(l => l.product_id && l.received_qty > 0);
  if (!validLines.length) return NextResponse.json({ error: 'Aucune ligne valide' }, { status: 400 });

  const retenues = validLines.filter(l => !choisis || choisis.includes(l.product_id));
  if (!retenues.length) {
    return NextResponse.json({ error: 'Aucun article sélectionné pour porter ce coût' }, { status: 400 });
  }

  /* Même répartition que l'écran de commande d'achat : deux calculs
     séparés donneraient deux PMP pour le même carton. */
  const parts = repartir(
    validLines.map((l: any) => ({
      key: l.product_id,
      qty: parseInt(l.received_qty) || 0,
      unit_cost: parseFloat(l.unit_cost) || 0,
      retenue: !choisis || choisis.includes(l.product_id),
    })),
    Number(amount) || 0,
    allocation_method === 'prorata' ? 'prorata' : 'equal',
  );

  const computedLines: any[] = [];

  for (const line of retenues) {
    const qty = parseInt(line.received_qty) || 0;
    const unitCost = parseFloat(line.unit_cost) || 0;
    const allocatedTotal = parts[line.product_id]?.total || 0;
    const allocatedPerUnit = parts[line.product_id]?.parUnite || 0;

    // Récupérer le PMP et stock actuels du produit
    const { data: product } = await supabaseAdmin.from('products')
      .select('stock, cost_price').eq('id', line.product_id).single();
    if (!product) continue;

    const currentStock = product.stock || 0;
    const currentPmp = product.cost_price || 0;

    // Si des unités ont été vendues avant l'imputation du coût logistique, on plafonne qty
    // au stock actuel pour éviter de concentrer tout le coût sur peu d'unités restantes.
    const effectiveQty = Math.min(qty, currentStock);
    const newPmp = currentStock > 0
      ? (currentStock * currentPmp + effectiveQty * allocatedPerUnit) / currentStock
      : currentPmp + allocatedPerUnit;

    await supabaseAdmin.from('products').update({
      cost_price: Math.round(newPmp * 10000) / 10000,
    }).eq('id', line.product_id);

    computedLines.push({
      product_id: line.product_id,
      name: line.name,
      qty,
      unit_cost: unitCost,
      allocated_total: Math.round(allocatedTotal * 100) / 100,
      allocated_per_unit: Math.round(allocatedPerUnit * 10000) / 10000,
      pmp_before: Math.round(currentPmp * 10000) / 10000,
      pmp_after: Math.round(newPmp * 10000) / 10000,
    });
  }

  // Enregistrer le coût logistique
  const { data, error } = await supabaseAdmin.from('landed_costs').insert({
    reception_id,
    description,
    amount,
    allocation_method,
    status: 'validated',
    lines: JSON.stringify(computedLines),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Créer une écriture comptable pour ce coût logistique
  const dateStr = new Date().toISOString().split('T')[0];
  await supabaseAdmin.from('accounting_entries').insert({
    date: dateStr,
    type: 'expense',
    category: 'frais_logistique',
    description: `${description} — Réception #${reception_id.slice(0, 8)}`,
    amount: amount,
    reference_type: 'landed_cost',
    reference_id: data.id,
    reference_number: reception?.number || null,
  });

  return NextResponse.json({ landed_cost: data, lines: computedLines });
}
