import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/* ═══════════════════════════════════════════════════════════════
   RÉCAPITULATIF DE COMMANDE — ROUTE PUBLIQUE

   Appelée par la page de remerciement du site, sans session : le
   client vient de payer, il n'est pas connecté au back-office.

   `/api/orders/[id]` renvoyait la commande entière — nom, adresse
   postale, email, téléphone, identifiant de session Stripe — à qui
   connaissait l'identifiant. Un UUID n'est pas devinable, mais il
   circule : lien partagé, historique, capture d'écran.

   Cette route ne renvoie que ce que la page affiche réellement. Tout
   ajout ici doit se demander : « est-ce que ça doit être lisible par
   quiconque a l'URL ? »
   ═══════════════════════════════════════════════════════════════ */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, status, delivery_mode, lines, subtotal, shipping, discount, total, created_at')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  if (!data) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404, headers: CORS });

  return NextResponse.json({ order: data }, { headers: { ...CORS, 'Cache-Control': 'no-store' } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
