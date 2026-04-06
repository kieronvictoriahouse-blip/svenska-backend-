import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import * as Papa from 'papaparse';

export async function GET() {
  const { data } = await supabaseAdmin.from('white_label_config').select('*').limit(1).single();
  return NextResponse.json({ config: data || {} });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { data: existing } = await supabaseAdmin.from('white_label_config').select('id').limit(1).single();
  let result;
  if (existing) {
    result = await supabaseAdmin.from('white_label_config')
      .update({ ...body, updated_at: new Date().toISOString() }).eq('id', existing.id).select().single();
  } else {
    result = await supabaseAdmin.from('white_label_config').insert(body).select().single();
  }
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ config: result.data });
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
