import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { BOUTIQUE_DEFAUT, boutiqueDeRequete, configBoutique } from '@/lib/boutique';

// Colonnes acceptées — évite une 500 si la page envoie un champ inconnu
const ALLOWED = new Set([
  'site_name','site_slogan','site_description','logo_url','favicon_url',
  'color_primary','color_secondary','color_bg','color_text',
  'font_display','font_body','font_ui',
  'email','phone','address','siret','tva',
  /* Identité légale (migration 046) : saisie sur l'écran « Contact &
     légal », imprimée sur les factures — elle manquait ici, la route la
     jetait en répondant « Sauvegardé ». */
  'legal_name','rcs_city','shop_city',
  'front_url','instagram','facebook','pinterest','currency','tva_rate','free_shipping_threshold',
  'smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from',
  'stripe_public_key','stripe_secret_key',
  'announcement_fr','announcement_sv','announcement_en',
  'footer_desc_fr','footer_desc_sv','footer_desc_en',
  'footer_tagline_fr','footer_tagline_sv','footer_tagline_en',
  'ship_promo_active','ship_promo_threshold','ship_promo_threshold_intl',
  'ship_promo_from','ship_promo_until',
  'ship_promo_label_fr','ship_promo_label_sv','ship_promo_label_en',
]);

/* Champs servis sans authentification : ce que lisent la vitrine
   (sd-api-client.js, inject-wl.js, mentions légales) et l'écran de connexion.
   Liste blanche : une colonne ajoutée plus tard reste privée tant qu'elle
   n'est pas ajoutée ici. Jamais de smtp_* ni de stripe_secret_key — jusqu'au
   22/10/2026, ce GET public renvoyait la ligne entière, mot de passe SMTP
   compris. */
const PUBLIC_FIELDS = [
  'id',
  'site_name','site_slogan','site_description','logo_url','favicon_url',
  'color_primary','color_secondary','color_bg','color_text',
  'font_display','font_body','font_ui',
  'email','phone','address','siret','tva','legal_name','rcs_city','shop_city',
  'front_url','instagram','facebook','pinterest','currency','tva_rate','free_shipping_threshold',
  'stripe_public_key',
  'announcement_fr','announcement_sv','announcement_en',
  'footer_desc_fr','footer_desc_sv','footer_desc_en',
  'footer_tagline_fr','footer_tagline_sv','footer_tagline_en',
  'ship_promo_active','ship_promo_threshold','ship_promo_threshold_intl',
  'ship_promo_from','ship_promo_until',
  'ship_promo_label_fr','ship_promo_label_sv','ship_promo_label_en',
];

function publicOnly(row: Record<string, unknown>) {
  return Object.fromEntries(PUBLIC_FIELDS.filter(k => k in row).map(k => [k, row[k]]));
}

/* Secrets : jamais renvoyés, même à l'admin. Chaque écran du back-office
   lit /api/white-label (couleurs, nom) : le mot de passe SMTP et la clé
   Stripe secrète partaient dans le navigateur à chaque page. L'écran
   reçoit seulement « déjà renseigné » (`smtp_pass_set`…), laisse le champ
   vide, et un champ vide à l'enregistrement veut dire « inchangé ». */
const SECRETS = ['smtp_pass', 'stripe_secret_key'] as const;

function sansSecrets(row: Record<string, any> | null) {
  if (!row) return {};
  const out: Record<string, any> = { ...row };
  for (const k of SECRETS) { out[`${k}_set`] = !!row[k]; out[k] = ''; }
  return out;
}

/** Valeur vide, ou masque renvoyé tel quel (••••, ****) : on ne touche pas au secret en base. */
const secretInchange = (v: unknown) => v == null || /^[\s•*·]*$/.test(String(v));

export async function GET(req: NextRequest) {
  try {
    // Ligne complète pour les écrans d'admin (adminFetch) : même contrôle que le PUT.
    const admin = await requireAuth(req);
    // Marque de la vitrine qui demande (?boutique=) — Swedish Cravings sans rien.
    let data: Record<string, any> | null;
    try { data = await configBoutique(boutiqueDeRequete(req), '*'); }
    catch (error: any) {
      console.error('[white-label] GET:', error?.message);
      return NextResponse.json({ config: {} });
    }
    if (admin) {
      return NextResponse.json({ config: data ? sansSecrets(data) : {} }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json({ config: data ? publicOnly(data) : {} });
  } catch (e: any) {
    console.error('[white-label] GET exception:', e.message);
    return NextResponse.json({ config: {} });
  }
}

export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  try {
    const raw = await req.json();
    // Strip unknown columns before sending to Supabase
    const body: Record<string, any> = Object.fromEntries(Object.entries(raw || {}).filter(([k]) => ALLOWED.has(k)));
    // Champ secret laissé vide (ou masque) : le secret enregistré est conservé, jamais écrasé.
    for (const k of SECRETS) if (k in body && secretInchange(body[k])) delete body[k];
    /* Réglages de la boutique visée : sans ?boutique, Swedish Cravings,
       comme avant. Une nouvelle ligne naît rattachée à sa boutique ; pour
       Swedish Cravings, la base pose le défaut. */
    const b = boutiqueDeRequete(req);
    const existing = await configBoutique(b, 'id');
    let result;
    if (existing) {
      result = await supabaseAdmin.from('white_label_config')
        .update({ ...body, updated_at: new Date().toISOString() }).eq('id', existing.id).select().maybeSingle();
    } else {
      result = await supabaseAdmin.from('white_label_config')
        .insert({ ...body, ...(b !== BOUTIQUE_DEFAUT ? { boutique_code: b } : {}) }).select().maybeSingle();
    }
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    return NextResponse.json({ config: sansSecrets(result.data) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e: any) {
    console.error('[white-label] PUT exception:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type'); // products, contacts, suppliers, stock
  const body = await req.json();
  const rows = body.rows || [];
  const results = { imported: 0, errors: [] as string[] };

  /* Chaque ligne est comptée « importée » seulement si l'écriture a réussi :
     les erreurs Supabase ne lèvent pas d'exception, l'écran annonçait
     N lignes importées quoi qu'il arrive. */
  const verifier = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  for (const row of rows) {
    try {
      if (type === 'products') {
        const nom = String(row.nom || row.name_fr || row.name || '').trim();
        const prix = parseFloat(String(row.prix || row.price || '0').replace(',', '.'));
        // Même règle que la fiche : pas de produit sans nom ni à 0 € en ligne.
        if (!nom || !(prix > 0)) throw new Error('nom ou prix manquant');
        verifier(await supabaseAdmin.from('products').insert({
          name_fr: nom,
          name_sv: row.name_sv || nom,
          name_en: row.name_en || nom,
          price: prix,
          is_active: true,
          sort_order: results.imported + 1,
        }));
      } else if (type === 'contacts' || type === 'suppliers') {
        verifier(await supabaseAdmin.from('contacts').insert({
          type: type === 'suppliers' ? 'supplier' : 'client',
          company: row.societe || row.company,
          first_name: row.prenom || row.first_name,
          last_name: row.nom || row.last_name,
          email: row.email,
          phone: row.telephone || row.phone,
          address: row.adresse || row.address,
        }));
      } else if (type === 'stock') {
        const { data: product } = await supabaseAdmin.from('products')
          .select('id').eq('name_fr', row.produit || row.product).maybeSingle();
        // Produit introuvable (ou nom ambigu) : erreur visible, pas « importé ».
        if (!product) throw new Error('produit introuvable');
        verifier(await supabaseAdmin.from('products').update({ track_stock: true }).eq('id', product.id));
        /* La quantité passe par le journal comme tout le reste. Un
           import qui écrit le stock en silence, c'est un inventaire
           fantôme : six mois plus tard, personne ne sait pourquoi la
           valeur a changé ce jour-là. */
        const { poserStock } = await import('@/lib/stock');
        const m = await poserStock(product.id, Math.max(0, parseInt(row.stock || 0) || 0), {
          reason: 'import',
          note: 'Import CSV depuis les réglages',
        });
        if (!m) throw new Error('stock non enregistré');
      } else {
        throw new Error('type d’import inconnu');
      }
      results.imported++;
    } catch(e: any) {
      results.errors.push(row.nom || row.name || 'Inconnu');
    }
  }
  return NextResponse.json(results);
}
