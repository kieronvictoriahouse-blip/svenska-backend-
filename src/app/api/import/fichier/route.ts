import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* ═══════════════════════════════════════════════════════════════
   IMPORT DE CATALOGUE PAR FICHIER (CSV / tableur)

   Une boutique neuve démarre vide : c'est la première chose qu'un
   marchand fait. L'écran /admin/import/fichier lit le fichier, montre
   un aperçu, puis envoie les lignes ici par lots de 20.

   Règles :
     · nom et prix obligatoires ;
     · DOUBLON = même EAN, sinon même référence, sinon même nom → la
       ligne est ignorée (rejouer un import ne crée jamais de double) ;
     · catégorie inconnue → créée (par nom), retrouvée par nom ou slug ;
     · image → rapatriée ET allégée (rehostImage → optimiserImage) ;
     · stock → posé comme un INVENTAIRE initial via poserStock, donc
       journalisé (règle du stock : aucune écriture directe).
   ═══════════════════════════════════════════════════════════════ */

type Ligne = {
  ligne: number;
  nom: string; nom_sv?: string; nom_en?: string;
  prix: number; prix_achat?: number | null;
  poids?: string; ean?: string; reference?: string;
  categorie?: string; stock?: number | null;
  image?: string; description?: string;
};
type Resultat = { ligne: number; nom: string; statut: 'cree' | 'ignore' | 'erreur'; raison?: string; id?: string };

const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const norm = (s?: string | null) => String(s || '').trim().toLowerCase();

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { lignes } = await req.json().catch(() => ({ lignes: [] }));
  if (!Array.isArray(lignes) || !lignes.length) return NextResponse.json({ error: 'Aucune ligne' }, { status: 400 });
  if (lignes.length > 50) return NextResponse.json({ error: 'Lot trop gros (50 lignes maximum par envoi)' }, { status: 400 });

  /* Référentiel chargé une fois par lot. */
  const [{ data: produits }, { data: cats }] = await Promise.all([
    supabaseAdmin.from('products').select('id, name_fr, ean, sku'),
    supabaseAdmin.from('categories').select('id, name_fr, slug'),
  ]);
  const parEan = new Map((produits || []).filter(p => p.ean).map(p => [norm(p.ean), p.id]));
  const parRef = new Map((produits || []).filter(p => p.sku).map(p => [norm(p.sku), p.id]));
  const parNom = new Map((produits || []).map(p => [norm(p.name_fr), p.id]));
  const categories = [...(cats || [])];

  const { rehostImage } = await import('@/lib/rehost-image');
  const { poserStock } = await import('@/lib/stock');
  const resultats: Resultat[] = [];

  for (const l of lignes as Ligne[]) {
    const nom = String(l.nom || '').trim();
    const r: Resultat = { ligne: l.ligne, nom, statut: 'erreur' };
    try {
      if (!nom) { r.raison = 'nom manquant'; resultats.push(r); continue; }
      if (!(Number(l.prix) > 0)) { r.raison = 'prix manquant ou nul'; resultats.push(r); continue; }

      const doublon = (l.ean && parEan.get(norm(l.ean))) || (l.reference && parRef.get(norm(l.reference))) || parNom.get(norm(nom));
      if (doublon) { resultats.push({ ...r, statut: 'ignore', raison: 'déjà au catalogue', id: doublon }); continue; }

      /* Catégorie : retrouvée par nom ou slug, sinon créée. */
      let categoryId: string | null = null;
      if (l.categorie && l.categorie.trim()) {
        const c = l.categorie.trim();
        let cat = categories.find(x => norm(x.name_fr) === norm(c) || x.slug === slugify(c));
        if (!cat) {
          const { data: cree, error } = await supabaseAdmin.from('categories')
            .insert({ name_fr: c, name_sv: c, name_en: c, slug: slugify(c) })
            .select('id, name_fr, slug').single();
          if (error) throw new Error('catégorie : ' + error.message);
          cat = cree; categories.push(cree);
        }
        categoryId = cat!.id;
      }

      const image = l.image && /^https?:\/\//i.test(l.image) ? ((await rehostImage(l.image)) || null) : null;
      const suivi = l.stock !== null && l.stock !== undefined && !Number.isNaN(Number(l.stock));

      const { data: p, error } = await supabaseAdmin.from('products').insert({
        name_fr: nom,
        name_sv: (l.nom_sv || '').trim() || nom,
        name_en: (l.nom_en || '').trim() || nom,
        desc_fr: (l.description || '').trim() || null,
        price: Number(l.prix),
        cost_price: Number(l.prix_achat) > 0 ? Number(l.prix_achat) : null,
        weight: (l.poids || '').trim() || null,
        ean: (l.ean || '').trim() || null,
        sku: (l.reference || '').trim() || null,
        category_id: categoryId,
        image_url: image,
        is_active: true,
        track_stock: suivi,
        stock: suivi ? 0 : null,
      }).select('id').single();
      if (error) throw new Error(error.message);

      if (suivi && Number(l.stock) !== 0) {
        await poserStock(p.id, Number(l.stock), { reason: 'inventory', note: 'Stock initial — import de catalogue' });
      }
      parNom.set(norm(nom), p.id);
      if (l.ean) parEan.set(norm(l.ean), p.id);
      if (l.reference) parRef.set(norm(l.reference), p.id);
      resultats.push({ ...r, statut: 'cree', id: p.id, raison: l.image && !image ? 'image introuvable' : undefined });
    } catch (e: any) {
      resultats.push({ ...r, raison: e?.message || 'erreur inconnue' });
    }
  }

  return NextResponse.json({ resultats });
}
