import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   CONDITIONNEMENTS

   Tout l'écran de commande d'achat raisonne en cartons. Tant que les
   conditionnements valent 1, « 19 cartons » veut dire 19 unités et le
   raisonnement tourne à vide.

   On ne devine pas ces valeurs. Le PGCD des quantités déjà commandées
   ne mesure que des habitudes d'achat — commander 10 puis 5 donne 5,
   ce qui ne dit rien du carton ; un produit acheté une seule fois donne
   sa propre quantité. Les seules valeurs proposées viennent du nom du
   produit quand il porte son conditionnement (« 75Gx20 »). Le reste est
   affiché comme contexte, pas comme suggestion.
   ═══════════════════════════════════════════════════════════════ */

const J = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

/** « BBQ Marinade 75Gx20 » → 20. Le seul indice fiable du lot. */
const MOTIFS = [/x\s?(\d{1,3})\b/i, /(\d{1,3})\s?-?\s?pack/i, /\bpack\s?(?:de|of)\s?(\d{1,3})/i];
function conditionnementDuNom(...textes: (string | null)[]): number | null {
  for (const t of textes) {
    if (!t) continue;
    for (const rx of MOTIFS) {
      const m = String(t).match(rx);
      const n = m ? Number(m[1]) : 0;
      if (n > 1 && n <= 200) return n;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const [{ data: produits }, { data: magasins }, { data: sources }, { data: achats }] = await Promise.all([
    supabaseAdmin.from('products')
      .select('id, name_fr, name_sv, sku, sort_order, image_url, pack_size, stock')
      .eq('is_active', true).eq('track_stock', true),
    supabaseAdmin.from('contacts').select('id, company').eq('type', 'supplier'),
    supabaseAdmin.from('product_suppliers').select('product_id, supplier_id, pack_size'),
    supabaseAdmin.from('purchase_orders').select('lines, status'),
  ]);

  const nomMagasin = Object.fromEntries((magasins || []).map(c => [c.id, c.company || '—']));

  /* Les quantités déjà commandées : un repère pour trancher, jamais une
     valeur pré-remplie. */
  const historique: Record<string, number[]> = {};
  for (const po of achats || []) {
    if (po.status === 'cancelled') continue;
    for (const l of J(po.lines)) {
      const q = Number(l.qty) || 0;
      if (l.product_id && q > 0) (historique[l.product_id] = historique[l.product_id] || []).push(q);
    }
  }

  const parProduit: Record<string, any[]> = {};
  for (const s of sources || []) (parProduit[s.product_id] = parProduit[s.product_id] || []).push(s);

  const lignes = (produits || []).map(p => ({
    id: p.id,
    name: p.name_fr,
    name_sv: p.name_sv && p.name_sv !== p.name_fr ? p.name_sv : null,
    ref: p.sku || (p.sort_order ? `SC-${String(p.sort_order).padStart(4, '0')}` : ''),
    image_url: p.image_url || null,
    pack: Math.max(1, Number(p.pack_size) || 1),
    propose: conditionnementDuNom(p.name_sv, p.name_fr),
    deja: (historique[p.id] || []).slice(-6),
    magasins: (parProduit[p.id] || []).map(s => ({
      id: s.supplier_id,
      nom: nomMagasin[s.supplier_id] || '—',
      pack: s.pack_size ? Number(s.pack_size) : null,
    })),
  })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return NextResponse.json({
    lignes,
    aRenseigner: lignes.filter(l => l.pack === 1).length,
  });
}

export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();
  const entrees: Array<{ id: string; pack: number; magasins?: Record<string, number> }> =
    Array.isArray(body.lignes) ? body.lignes : [];
  if (!entrees.length) return NextResponse.json({ error: 'Rien à enregistrer' }, { status: 400 });

  let produits = 0, parMagasin = 0;
  for (const e of entrees) {
    const pack = Math.max(1, Math.round(Number(e.pack) || 1));
    const { error } = await supabaseAdmin.from('products')
      .update({ pack_size: pack }).eq('id', e.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    produits++;

    /* Un magasin peut vendre le même article dans un autre
       conditionnement : la valeur du couple prime sur celle du produit. */
    for (const [supplierId, valeur] of Object.entries(e.magasins || {})) {
      const n = Math.round(Number(valeur) || 0);
      await supabaseAdmin.from('product_suppliers')
        .update({ pack_size: n > 1 ? n : null })
        .eq('product_id', e.id).eq('supplier_id', supplierId);
      parMagasin++;
    }
  }

  return NextResponse.json({ ok: true, produits, parMagasin });
}
