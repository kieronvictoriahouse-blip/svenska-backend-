import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { exclude } = await req.json();
  const isExcluded = exclude !== false;

  const { error } = await supabaseAdmin
    .from('orders')
    .update({ exclude_from_stats: isExcluded })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aligne la compta sur le dashboard : une commande hors-stats ne doit pas
  // compter dans le CA. On retire ses écritures (recette + frais Stripe).
  // La réintégration (exclude=false) laisse la prochaine synchro les recréer.
  if (isExcluded) {
    await supabaseAdmin
      .from('accounting_entries')
      .delete()
      .eq('reference_type', 'order')
      .eq('reference_id', params.id);
  }

  return NextResponse.json({ success: true });
}
