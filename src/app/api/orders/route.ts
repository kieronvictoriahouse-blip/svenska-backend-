import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createInvoiceFromOrder } from '@/lib/invoice-utils';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  /* La recherche part dans un filtre PostgREST `or(...)` : une virgule ou
     une parenthèse saisie (« Dupont, Marie ») cassait le filtre — erreur
     500, liste vide. On les retire, ainsi que le « # » qu'on tape devant
     un numéro (« #240 » doit trouver SD-0240). ilike : la casse des
     emails ne compte pas. */
  const search = (searchParams.get('search') || '')
    .replace(/[,()"\\]/g, ' ').trim().replace(/^#\s*/, '').trim();

  /* PostgREST plafonne une réponse (1 000 lignes par défaut sur
     Supabase). Les brouillons de panier s'accumulent : passé ce cap, les
     commandes les plus anciennes disparaissaient de la liste et des
     compteurs sans rien dire. On lit par pages. */
  const PAGE = 1000;
  const orders: any[] = [];
  for (let debut = 0; debut < 50 * PAGE; debut += PAGE) {
    let query = supabaseAdmin.from('orders').select('*')
      .order('created_at', { ascending: false }).order('id', { ascending: true })
      .range(debut, debut + PAGE - 1);
    if (status) query = status.includes(',') ? query.in('status', status.split(',')) : query.eq('status', status);
    if (search) query = query.or(`customer_name.ilike.%${search}%,customer_email.ilike.%${search}%,order_number.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    orders.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { count: orderCount } = await supabaseAdmin.from('orders').select('id', { count: 'exact', head: true });
  const num = String((orderCount || 0) + 1).padStart(4, '0');
  const { data, error } = await supabaseAdmin.from('orders').insert({
    ...body,
    order_number: `SD-${num}`,
    lines: JSON.stringify(body.lines || []),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* Pas de déduction de stock ici, et c'est délibéré. Une commande
     saisie à la main RÉSERVE sa marchandise comme n'importe quelle
     autre : elle reste en rayon jusqu'à ce que le carton parte, et
     c'est l'écran de préparation qui la sortira. Déduire ici la
     ferait sortir deux fois. */

  // Créer la facture automatiquement
  const invoice = await createInvoiceFromOrder({ ...data, lines: body.lines });

  return NextResponse.json({ order: data, invoice_number: invoice?.number || null });
}
