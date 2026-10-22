import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

// Route strictement admin : elle expose les codes promo (valeurs, compteurs)
// et les paniers abandonnés (emails clients), et permet de les créer/modifier.
// La validation d'un code côté boutique passe par /api/promo/validate.
const DENY = () => NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return DENY();
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab');

  if (tab === 'abandoned') {
    const { data, error } = await supabaseAdmin.from('abandoned_carts')
      .select('*').order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ carts: data || [] });
  }

  if (tab === 'promo') {
    // Les codes personnels (fidélité, code ami) ont leur onglet : un par client.
    const { data, error } = await supabaseAdmin.from('promo_codes')
      .select('*').is('kind', null).order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ codes: data || [] });
  }

  if (tab === 'fidelite') {
    const [codes, parrainages] = await Promise.all([
      supabaseAdmin.from('promo_codes')
        .select('id, code, kind, owner_email, used_count, is_active, created_at')
        .not('kind', 'is', null).order('created_at', { ascending: false }).limit(1000),
      supabaseAdmin.from('referrals')
        .select('id, referrer_email, referee_email, order_id, status, cancel_reason, created_at, validated_at')
        .order('created_at', { ascending: false }).limit(500),
    ]);
    if (codes.error || parrainages.error) {
      return NextResponse.json({ error: (codes.error || parrainages.error)!.message }, { status: 500 });
    }
    const ids = Array.from(new Set((parrainages.data || []).map(r => r.order_id)));
    const { data: cmd } = ids.length
      ? await supabaseAdmin.from('orders').select('id, order_number, total').in('id', ids)
      : { data: [] as any[] };
    const parId = Object.fromEntries((cmd || []).map(o => [o.id, o]));

    // Taux du jour de chaque code fidélité, calculé comme au checkout.
    const { finDuBonus, tauxFidelite, normEmail } = await import('@/lib/fidelite-regles');
    const dernierValide: Record<string, string> = {};
    for (const r of parrainages.data || []) {
      const e = normEmail(r.referrer_email);
      if (r.status === 'validated' && r.validated_at && !(dernierValide[e] > r.validated_at)) dernierValide[e] = r.validated_at;
    }
    return NextResponse.json({
      codes: (codes.data || []).map(c => {
        if (c.kind !== 'fidelite') return c;
        const fin = finDuBonus(dernierValide[normEmail(c.owner_email)], c.created_at);
        return { ...c, taux: tauxFidelite(fin), fin_bonus: fin ? fin.toISOString() : null };
      }),
      parrainages: (parrainages.data || []).map(r => ({
        ...r,
        order_number: parId[r.order_id]?.order_number || null,
        order_total: parId[r.order_id]?.total ?? null,
      })),
    });
  }

  // Campagnes
  const { data, error } = await supabaseAdmin.from('marketing_campaigns')
    .select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data || [] });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return DENY();
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get('tab');
  const body = await req.json();

  if (tab === 'promo') {
    const { data, error } = await supabaseAdmin.from('promo_codes').insert(body).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ code: data });
  }

  if (tab === 'abandoned') {
    const { data, error } = await supabaseAdmin.from('abandoned_carts').insert({
      ...body, cart_data: JSON.stringify(body.cart_data || [])
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ cart: data });
  }

  // Campagne
  const { data, error } = await supabaseAdmin.from('marketing_campaigns').insert({
    ...body, updated_at: new Date().toISOString()
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return DENY();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const tab = searchParams.get('tab');
  const body = await req.json();

  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

  /* Annuler un parrainage (fraude, erreur). Seule action permise : le
     −10 % du parrain se déduit des parrainages validés, il retombe seul. */
  if (tab === 'parrainage') {
    const { data, error } = await supabaseAdmin.from('referrals')
      .update({ status: 'cancelled', cancel_reason: 'annule_back_office' })
      .eq('id', id).neq('status', 'cancelled').select().maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ parrainage: data });
  }

  if (tab === 'promo') {
    const { data, error } = await supabaseAdmin.from('promo_codes').update(body).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ code: data });
  }

  const { data, error } = await supabaseAdmin.from('marketing_campaigns')
    .update({ ...body, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: data });
}

export async function DELETE(req: NextRequest) {
  if (!await requireAuth(req)) return DENY();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const tab = searchParams.get('tab');

  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

  if (tab === 'promo') {
    const { error } = await supabaseAdmin.from('promo_codes').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Tab inconnu' }, { status: 400 });
}
