import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

/* Mise à jour et suppression d'une catégorie.
   Nécessaire à l'écran Catégories du handoff : réordonnancement par
   glisser-déposer, bascule de visibilité, renommage. */

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();

  const ALLOWED = ['slug', 'emoji', 'name_fr', 'name_sv', 'name_en', 'sort_order', 'is_active'];
  const payload = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED.includes(k)));
  if (!Object.keys(payload).length) return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('categories').update(payload).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  // Refus si des produits y sont rattachés : une suppression silencieuse
  // les rendrait orphelins et invisibles en boutique.
  const { count } = await supabaseAdmin
    .from('products').select('id', { count: 'exact', head: true }).eq('category_id', params.id);
  if (count && count > 0) {
    return NextResponse.json(
      { error: `${count} produit(s) utilisent encore cette catégorie.`, code: 'CATEGORY_IN_USE', count },
      { status: 409 },
    );
  }

  const { error } = await supabaseAdmin.from('categories').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
