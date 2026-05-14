import { supabaseAdmin } from './supabase';

export async function createInvoiceFromOrder(order: any): Promise<any> {
  const year = new Date().getFullYear();

  // Lire la config entreprise
  const { data: config } = await supabaseAdmin
    .from('white_label_config').select('*').limit(1).maybeSingle();

  // Numéro de facture séquentiel par année (Art. 242 nonies A CGI)
  const counterKey = `invoice_next_${year}`;
  const { data: setting } = await supabaseAdmin
    .from('company_settings').select('value').eq('key', counterKey).maybeSingle();
  const nextNum = parseInt(setting?.value || '1', 10);
  const invoiceNumber = `FAC-${year}-${String(nextNum).padStart(4, '0')}`;

  // Préparer les lignes de facture
  let rawLines: any[] = [];
  try {
    rawLines = typeof order.lines === 'string' ? JSON.parse(order.lines) : (order.lines || []);
  } catch { rawLines = []; }

  const lines = rawLines.map((l: any) => ({
    desc: l.name_fr || l.name || l.desc || l.label || 'Article',
    qty: parseInt(l.qty) || 1,
    price: parseFloat(l.price || l.unit_price || l.total_price || 0),
    tva: 0, // micro-entreprise franchise TVA — Art. 293 B CGI
    ...(l.image_url ? { image_url: l.image_url } : {}),
  }));

  // Frais de livraison comme ligne séparée
  if (order.shipping && parseFloat(order.shipping) > 0) {
    lines.push({ desc: 'Frais de livraison', qty: 1, price: parseFloat(order.shipping), tva: 0 });
  }

  const totalTtc = parseFloat(order.total) || 0;

  // Adresse client (gère string ou objet JSONB)
  let clientAddress = '';
  const addr = order.shipping_address || order.customer_address;
  if (addr) {
    if (typeof addr === 'string') {
      clientAddress = addr;
    } else {
      clientAddress = [
        addr.line1, addr.line2,
        addr.postal_code && addr.city ? `${addr.postal_code} ${addr.city}` : (addr.postal_code || addr.city),
        addr.country,
      ].filter(Boolean).join(', ');
    }
  }

  // Statut facture selon statut commande
  const paidStatuses = ['paid', 'confirmed', 'shipped', 'delivered'];
  const status = paidStatuses.includes(order.status) ? 'sent' : 'draft';

  const { data: invoice, error } = await supabaseAdmin.from('invoices').insert({
    number:          invoiceNumber,
    date:            new Date().toISOString().split('T')[0],
    status,
    client_name:     order.customer_name || '',
    client_address:  clientAddress,
    client_email:    order.customer_email || '',
    lines:           JSON.stringify(lines),
    total_ht:        totalTtc,   // micro-entreprise : HT = TTC
    total_tva:       0,
    total_ttc:       totalTtc,
    note:            order.notes || '',
    order_id:        order.id || null,
    legal_mention:   'TVA non applicable, art. 293 B du CGI',
    seller_name:     config?.site_name   || 'Svenska Delikatessen',
    seller_siret:    config?.siret       || '',
    seller_address:  config?.address     || '',
    seller_email:    config?.email       || '',
    seller_phone:    config?.phone       || '',
  }).select().single();

  if (error) {
    console.error('[invoice-utils] Erreur création facture:', error.message);
    return null;
  }

  // Incrémenter le compteur annuel
  const newVal = (nextNum + 1).toString();
  await supabaseAdmin.from('company_settings')
    .upsert({ key: counterKey, value: newVal }, { onConflict: 'key' });

  return invoice;
}
