import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/snipcart/[sort_order]?variant=50g
// Endpoint de validation produit pour Snipcart
// Snipcart fetche cette URL pour vérifier prix et données produit
export async function GET(
  req: NextRequest,
  { params }: { params: { sort_order: string } }
) {
  const raw = params.sort_order;
  const sortOrder = parseInt(raw);

  let query = supabaseAdmin.from('products').select('*, product_variants(*)').eq('is_active', true);
  query = isNaN(sortOrder) ? query.eq('id', raw) : query.eq('sort_order', sortOrder);

  const { data: product, error } = await query.single();

  if (error || !product) {
    return new NextResponse('Product not found', { status: 404 });
  }

  const variantParam = req.nextUrl.searchParams.get('variant');
  const baseUrl = `${req.nextUrl.origin}/api/snipcart/${sortOrder}`;

  type Item = { id: string; price: number; label: string };
  let items: Item[] = [];

  const rawVariants: Array<{ label: string; price: number }> = product.product_variants || [];

  if (rawVariants.length > 0) {
    if (variantParam) {
      const v = rawVariants.find((x) => x.label === variantParam);
      if (v) {
        items.push({ id: `${sortOrder}_${v.label}`, price: v.price, label: v.label });
      } else {
        items.push({ id: `${sortOrder}`, price: product.price, label: '' });
      }
    } else {
      items = rawVariants.map((v) => ({
        id: `${sortOrder}_${v.label}`,
        price: v.price,
        label: v.label,
      }));
    }
  } else {
    items.push({ id: `${sortOrder}`, price: product.price, label: '' });
  }

  const desc = (product.desc_fr || '').replace(/"/g, '&quot;').substring(0, 250);
  const image = (product.image_url || '').replace(/"/g, '&quot;');

  const buttons = items
    .map(
      (item) => `  <button
    class="snipcart-add-item"
    data-item-id="${item.id}"
    data-item-price="${item.price.toFixed(2)}"
    data-item-name="${product.name_fr}${item.label ? ' — ' + item.label : ''}"
    data-item-url="${baseUrl}${item.label ? '?variant=' + encodeURIComponent(item.label) : ''}"
    data-item-image="${image}"
    data-item-description="${desc}"
    data-item-weight="${product.weight || ''}"
  ></button>`
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>${product.name_fr} — Svenska Delikatessen</title></head>
<body style="display:none">
${buttons}
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=3600',
    },
  });
}
