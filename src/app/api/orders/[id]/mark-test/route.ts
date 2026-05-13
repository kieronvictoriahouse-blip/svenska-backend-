import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const orderId = params.id;

  // Marquer la commande comme test
  const { error: orderErr } = await supabaseAdmin
    .from('orders')
    .update({ is_test: true, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });

  // Supprimer l'entrée comptable associée
  await supabaseAdmin
    .from('accounting_entries')
    .delete()
    .eq('reference_type', 'order')
    .eq('reference_id', orderId);

  // Annuler la facture associée (garde le numéro pour la séquentialité)
  await supabaseAdmin
    .from('invoices')
    .update({ status: 'cancelled' })
    .eq('order_id', orderId);

  return NextResponse.json({ success: true });
}
