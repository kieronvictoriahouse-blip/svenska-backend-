import { supabaseAdmin } from './supabase';
import PDFDocument from 'pdfkit';

/**
 * Numéro de pièce séquentiel et continu (Art. 242 nonies A CGI).
 * Dérivé du plus grand numéro existant en base pour ce préfixe — ne dépend
 * d'aucun compteur externe susceptible de dériver, donc pas de doublon ni de
 * trou. `prefix` inclut l'année, ex. "FAC-2026-" ou "AV-2026-".
 */
export async function nextSequentialNumber(prefix: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('invoices')
    .select('number')
    .like('number', `${prefix}%`)
    .order('number', { ascending: false })
    .limit(1);
  const last = data?.[0]?.number
    ? parseInt(String(data[0].number).slice(prefix.length), 10)
    : 0;
  const next = (Number.isNaN(last) ? 0 : last) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

export async function generateInvoicePdf(invoice: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const lines = typeof invoice.lines === 'string' ? JSON.parse(invoice.lines) : (invoice.lines || []);
    const colorPrimary = '#1C2028';
    const colorGray = '#6A7280';
    const colorLight = '#D8CEBC';
    const pageW = doc.page.width - 100;

    // Header
    doc.rect(0, 0, doc.page.width, 90).fill(colorPrimary);
    doc.fillColor('#fff').fontSize(18).font('Helvetica-Bold')
      .text(invoice.seller_name || 'FACTURE', 50, 30);
    doc.fillColor('rgba(255,255,255,0.6)').fontSize(9).font('Helvetica')
      .text('FACTURE', 50, 54);
    doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold')
      .text(invoice.number, doc.page.width - 180, 30, { width: 130, align: 'right' });
    doc.fillColor('rgba(255,255,255,0.7)').fontSize(9).font('Helvetica')
      .text(new Date(invoice.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }), doc.page.width - 180, 50, { width: 130, align: 'right' });

    // Seller / Client blocks
    doc.moveDown(3);
    const y1 = 120;
    doc.fillColor(colorGray).fontSize(8).font('Helvetica-Bold')
      .text('VENDEUR', 50, y1).text('CLIENT', 300, y1);
    doc.fillColor(colorPrimary).fontSize(10).font('Helvetica-Bold')
      .text(invoice.seller_name || '', 50, y1 + 14)
      .text(invoice.client_name || '', 300, y1 + 14);
    doc.fillColor(colorGray).fontSize(9).font('Helvetica');
    if (invoice.seller_address) doc.text(invoice.seller_address, 50, y1 + 28, { width: 220 });
    if (invoice.seller_email)   doc.text(invoice.seller_email,   50, doc.y + 2);
    if (invoice.seller_siret)   doc.text('SIRET : ' + invoice.seller_siret, 50, doc.y + 2);
    doc.fillColor(colorGray).fontSize(9).font('Helvetica');
    if (invoice.client_address) doc.text(invoice.client_address, 300, y1 + 28, { width: 220 });
    if (invoice.client_email)   doc.text(invoice.client_email,   300, doc.y + 2);

    // Lines table
    const tableY = Math.max(doc.y, y1 + 90) + 20;
    doc.rect(50, tableY, pageW, 20).fill('#F6F1E9');
    doc.fillColor(colorGray).fontSize(8).font('Helvetica-Bold')
      .text('DÉSIGNATION', 56, tableY + 6)
      .text('QTÉ', 350, tableY + 6, { width: 40, align: 'right' })
      .text('P.U.', 400, tableY + 6, { width: 55, align: 'right' })
      .text('TOTAL', 460, tableY + 6, { width: 65, align: 'right' });

    let rowY = tableY + 24;
    for (const l of lines) {
      const lineTotal = ((l.qty || 1) * (l.price || 0)).toFixed(2);
      doc.fillColor(colorPrimary).fontSize(9).font('Helvetica')
        .text(l.desc || l.name || '', 56, rowY, { width: 285 })
        .text(String(l.qty || 1), 350, rowY, { width: 40, align: 'right' })
        .text((l.price || 0).toFixed(2) + ' €', 400, rowY, { width: 55, align: 'right' })
        .text(lineTotal + ' €', 460, rowY, { width: 65, align: 'right' });
      rowY += 18;
      doc.moveTo(50, rowY - 2).lineTo(50 + pageW, rowY - 2).strokeColor(colorLight).lineWidth(0.5).stroke();
    }

    // Totals
    const totalY = rowY + 12;
    doc.moveTo(350, totalY).lineTo(50 + pageW, totalY).strokeColor(colorLight).lineWidth(1).stroke();
    doc.fillColor(colorGray).fontSize(9).font('Helvetica')
      .text('Sous-total HT', 350, totalY + 6, { width: 105, align: 'right' })
      .text((invoice.total_ht || 0).toFixed(2) + ' €', 460, totalY + 6, { width: 65, align: 'right' });
    doc.text('TVA (0%)', 350, totalY + 22, { width: 105, align: 'right' })
      .text('0,00 €', 460, totalY + 22, { width: 65, align: 'right' });
    doc.rect(350, totalY + 38, pageW - 300, 22).fill(colorPrimary);
    doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold')
      .text('TOTAL TTC', 356, totalY + 43, { width: 99, align: 'right' })
      .text((invoice.total_ttc || 0).toFixed(2) + ' €', 460, totalY + 43, { width: 65, align: 'right' });

    // Legal mention
    const legalY = totalY + 80;
    doc.fillColor(colorGray).fontSize(8).font('Helvetica')
      .text(invoice.legal_mention || 'TVA non applicable, art. 293 B du CGI', 50, legalY);

    doc.end();
  });
}

export async function createInvoiceFromOrder(order: any): Promise<any> {
  const year = new Date().getFullYear();

  // Lire la config entreprise
  const { data: config } = await supabaseAdmin
    .from('white_label_config').select('*').limit(1).maybeSingle();

  // Numéro de facture séquentiel par année (Art. 242 nonies A CGI)
  const invoiceNumber = await nextSequentialNumber(`FAC-${year}-`);

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

  return invoice;
}
