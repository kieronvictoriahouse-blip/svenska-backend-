import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Colonnes acceptées — évite une 500 si la page envoie un champ inconnu
const ALLOWED = new Set([
  'site_name','site_slogan','site_description','logo_url','favicon_url',
  'color_primary','color_secondary','color_bg','color_text',
  'font_display','font_body','font_ui',
  'email','phone','address','siret','tva',
  'front_url','instagram','facebook','pinterest','currency','tva_rate','free_shipping_threshold',
  'smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from',
  'stripe_public_key','stripe_secret_key',
  'announcement_fr','announcement_sv','announcement_en',
  'footer_desc_fr','footer_desc_sv','footer_desc_en',
  'footer_tagline_fr','footer_tagline_sv','footer_tagline_en',
]);


export async function GET() {
  try {
    const { data, error } = await supabaseAdmin.from('white_label_config').select('*').limit(1).maybeSingle();
    if (error) {
      console.error('[white-label] GET:', error.message);
      return NextResponse.json({ config: {} });
    }
    return NextResponse.json({ config: data || {} });
  } catch (e: any) {
    console.error('[white-label] GET exception:', e.message);
    return NextResponse.json({ config: {} });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const raw = await req.json();
    // Strip unknown columns before sending to Supabase
    const body = Object.fromEntries(Object.entries(raw).filter(([k]) => ALLOWED.has(k)));
    const { data: existing } = await supabaseAdmin.from('white_label_config').select('id').limit(1).maybeSingle();
    let result;
    if (existing) {
      result = await supabaseAdmin.from('white_label_config')
        .update({ ...body, updated_at: new Date().toISOString() }).eq('id', existing.id).select().maybeSingle();
    } else {
      result = await supabaseAdmin.from('white_label_config').insert(body).select().maybeSingle();
    }
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    return NextResponse.json({ config: result.data });
  } catch (e: any) {
    console.error('[white-label] PUT exception:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type'); // products, contacts, suppliers, stock
  const body = await req.json();
  const rows = body.rows || [];
  const results = { imported: 0, errors: [] as string[] };

  for (const row of rows) {
    try {
      if (type === 'products') {
        await supabaseAdmin.from('products').insert({
          name_fr: row.nom || row.name_fr || row.name,
          name_sv: row.name_sv || row.nom,
          name_en: row.name_en || row.nom,
          price: parseFloat(row.prix || row.price || 0),
          weight: row.poids || row.weight,
          is_active: true,
          sort_order: results.imported + 1,
        });
      } else if (type === 'contacts' || type === 'suppliers') {
        await supabaseAdmin.from('contacts').insert({
          type: type === 'suppliers' ? 'supplier' : 'client',
          company: row.societe || row.company,
          first_name: row.prenom || row.first_name,
          last_name: row.nom || row.last_name,
          email: row.email,
          phone: row.telephone || row.phone,
          address: row.adresse || row.address,
        });
      } else if (type === 'stock') {
        const { data: product } = await supabaseAdmin.from('products')
          .select('id').eq('name_fr', row.produit || row.product).single();
        if (product) {
          await supabaseAdmin.from('products').update({
            stock: parseInt(row.stock || 0),
            track_stock: true,
          }).eq('id', product.id);
        }
      }
      results.imported++;
    } catch(e: any) {
      results.errors.push(row.nom || row.name || 'Inconnu');
    }
  }
  return NextResponse.json(results);
}
