import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { grouper, categoriser, type Mouvement } from '@/lib/mouvements';

export const dynamic = 'force-dynamic';

/* Journal de stock, regroupé en séances.
   `produit` restreint à un article : c'est la vue « d'où vient ce
   chiffre » qu'on ouvre depuis la liste des stocks. */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const produit = searchParams.get('produit');
  const categorie = searchParams.get('categorie');
  const limite = Math.min(2000, Number(searchParams.get('limite')) || 800);

  let q = supabaseAdmin.from('stock_movements')
    .select('id, product_id, delta, qty_before, qty_after, reason, reference, note, created_at')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (produit) q = q.eq('product_id', produit);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let mouvements = (data || []) as Mouvement[];
  /* Le filtre par catégorie se fait ici et non en base : les motifs sont
     des textes libres, aucune requête SQL ne saurait les classer. */
  if (categorie) mouvements = mouvements.filter(m => categoriser(m.reason) === categorie);

  const ids = Array.from(new Set(mouvements.map(m => m.product_id).filter(Boolean)));
  const { data: prods } = await supabaseAdmin
    .from('products').select('id, name_fr, name_sv, name_en, image_url, stock')
    .in('id', ids.length ? ids : ['-']);

  const noms = Object.fromEntries((prods || []).map(p => [p.id, p.name_fr]));

  return NextResponse.json({
    seances: grouper(mouvements, noms),
    produits: prods || [],
    total: mouvements.length,
  });
}
