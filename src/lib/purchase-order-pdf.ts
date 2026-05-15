import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '@/lib/supabase';

export type PdfLang = 'sv' | 'en';

const LABELS: Record<PdfLang, Record<string, string>> = {
  sv: {
    title: 'INKÖPSORDER',
    to: 'TILL',
    orderNum: 'ORDERNR',
    date: 'DATUM',
    expectedDate: 'FÖRVÄNTAT DATUM',
    product: 'PRODUKT',
    qty: 'ANT',
    unitPrice: 'ENHETSPRIS',
    total: 'TOTALT',
    notes: 'ANTECKNINGAR',
  },
  en: {
    title: 'PURCHASE ORDER',
    to: 'TO',
    orderNum: 'ORDER NO.',
    date: 'DATE',
    expectedDate: 'EXPECTED DELIVERY',
    product: 'PRODUCT',
    qty: 'QTY',
    unitPrice: 'UNIT PRICE',
    total: 'TOTAL',
    notes: 'NOTES',
  },
};

export async function generatePurchaseOrderPdf(
  orderId: string,
  lang: PdfLang = 'en'
): Promise<{ buffer: Buffer; filename: string }> {
  const L = LABELS[lang];

  const { data: order } = await supabaseAdmin
    .from('purchase_orders')
    .select('*, contacts(*)')
    .eq('id', orderId)
    .single();
  if (!order) throw new Error('Commande introuvable');

  const lines: any[] = Array.isArray(order.lines)
    ? order.lines
    : typeof order.lines === 'string'
    ? (() => { try { return JSON.parse(order.lines); } catch { return []; } })()
    : [];

  const productIds = [...new Set(lines.map((l: any) => l.product_id).filter(Boolean))] as string[];
  const productMap: Record<string, any> = {};
  if (productIds.length) {
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name_sv, name_en, name_fr, image_url')
      .in('id', productIds);
    for (const p of products || []) productMap[p.id] = p;
  }

  // Pre-fetch and convert images to JPEG
  const imageBuffers: Record<string, Buffer> = {};
  await Promise.all(
    productIds.map(async (pid) => {
      const product = productMap[pid];
      if (!product?.image_url) return;
      try {
        const res = await fetch(product.image_url);
        if (!res.ok) return;
        const raw = Buffer.from(await res.arrayBuffer());
        const sharpMod = await import('sharp');
        const jpg = await sharpMod.default(raw)
          .resize(80, 80, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .jpeg({ quality: 80 })
          .toBuffer();
        imageBuffers[pid] = jpg;
      } catch { /* skip */ }
    })
  );

  const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: any) => chunks.push(Buffer.from(c)));
  const done = new Promise<void>((resolve) => doc.on('end', resolve));

  const supplier = order.contacts as any;
  const supplierName =
    supplier?.company ||
    `${supplier?.first_name || ''} ${supplier?.last_name || ''}`.trim() ||
    order.supplier_name ||
    '—';
  const supplierEmail = supplier?.email || '';

  const fmtNum = (n: number) =>
    (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

  // ── HEADER ────────────────────────────────────────────────────────────
  doc.rect(0, 0, 595.28, 82).fill('#3E5238');
  doc
    .fillColor('#a8c49a')
    .font('Helvetica')
    .fontSize(7.5)
    .text('SVENSKA DELIKATESSEN', 50, 24, { characterSpacing: 2.5 });
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(19)
    .text(L.title, 50, 44, { characterSpacing: 1.5 });
  doc
    .fillColor('rgba(255,255,255,0.6)')
    .font('Helvetica')
    .fontSize(8.5)
    .text(`${L.orderNum}  ${order.number || '—'}`, 350, 52, {
      align: 'right',
      width: 195,
    });

  // ── SUPPLIER + DATES ──────────────────────────────────────────────────
  let y = 104;
  doc
    .fillColor('#9CA3AF')
    .font('Helvetica-Bold')
    .fontSize(7)
    .text(L.to, 50, y, { characterSpacing: 1 });
  doc
    .fillColor('#1C2028')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(supplierName, 50, y + 10);
  if (supplierEmail) {
    doc
      .fillColor('#2563EB')
      .font('Helvetica')
      .fontSize(9)
      .text(supplierEmail, 50, y + 24);
  }

  doc
    .fillColor('#9CA3AF')
    .font('Helvetica-Bold')
    .fontSize(7)
    .text(L.date, 390, y, { characterSpacing: 1 });
  doc
    .fillColor('#1C2028')
    .font('Helvetica')
    .fontSize(9)
    .text(fmtDate(order.created_at), 390, y + 10, { width: 155, align: 'right' });

  if (order.expected_date) {
    doc
      .fillColor('#9CA3AF')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(L.expectedDate, 390, y + 28, { characterSpacing: 1 });
    doc
      .fillColor('#1C2028')
      .font('Helvetica')
      .fontSize(9)
      .text(fmtDate(order.expected_date), 390, y + 38, { width: 155, align: 'right' });
  }

  y += 62;
  doc.moveTo(50, y).lineTo(545.28, y).strokeColor('#D8CEBC').lineWidth(0.7).stroke();
  y += 14;

  // ── TABLE HEADER ──────────────────────────────────────────────────────
  const COL = { img: 50, name: 98, qty: 368, unitPrice: 412, total: 478 };
  doc.rect(50, y, 495.28, 21).fill('#1C2028');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
  doc.text(L.product, COL.name, y + 7, { characterSpacing: 0.8 });
  doc.text(L.qty,       COL.qty,       y + 7, { width: 38, align: 'right', characterSpacing: 0.8 });
  doc.text(L.unitPrice, COL.unitPrice, y + 7, { width: 58, align: 'right', characterSpacing: 0.8 });
  doc.text(L.total,     COL.total,     y + 7, { width: 62, align: 'right', characterSpacing: 0.8 });
  y += 21;

  // ── TABLE ROWS ────────────────────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const product = line.product_id ? productMap[line.product_id] : null;
    const name =
      line.name ||
      (product
        ? lang === 'sv'
          ? product.name_sv || product.name_fr
          : product.name_en || product.name_fr
        : '—');
    const imgBuf = line.product_id ? imageBuffers[line.product_id] : undefined;
    const ROW_H = 46;

    if (y + ROW_H > 768) {
      doc.addPage();
      y = 50;
    }

    doc
      .rect(50, y, 495.28, ROW_H)
      .fill(i % 2 === 0 ? '#FDFAF5' : '#ffffff');

    if (imgBuf) {
      try {
        doc.image(imgBuf, COL.img + 1, y + 5, { width: 36, height: 36 });
      } catch { /* skip */ }
    } else {
      doc.rect(COL.img + 1, y + 5, 36, 36).fillAndStroke('#F3F4F6', '#E5E7EB');
    }

    doc
      .fillColor('#1C2028')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(name, COL.name, y + 10, { width: 260, lineBreak: false });

    doc
      .fillColor('#374151')
      .font('Helvetica')
      .fontSize(9)
      .text(String(line.qty || 0), COL.qty, y + 18, { width: 38, align: 'right', lineBreak: false });

    doc.text(
      fmtNum(line.unit_cost_eur || line.unit_cost || 0),
      COL.unitPrice,
      y + 18,
      { width: 58, align: 'right', lineBreak: false }
    );

    doc
      .fillColor('#1C2028')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(fmtNum(line.total || 0), COL.total, y + 18, { width: 62, align: 'right', lineBreak: false });

    doc.moveTo(50, y + ROW_H).lineTo(545.28, y + ROW_H).strokeColor('#EEE8DC').lineWidth(0.5).stroke();
    y += ROW_H;
  }

  // ── TOTAL ─────────────────────────────────────────────────────────────
  y += 14;
  if (y + 40 > 768) { doc.addPage(); y = 50; }
  doc.rect(368, y, 177.28, 34).fill('#3E5238');
  doc
    .fillColor('#a8c49a')
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .text(L.total, 376, y + 7, { characterSpacing: 1 });
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(fmtNum(order.total), 376, y + 17, { width: 161, align: 'right' });

  // ── NOTES ─────────────────────────────────────────────────────────────
  if (order.notes) {
    y += 50;
    doc.rect(50, y, 495.28, 1).fill('#E5E7EB');
    y += 10;
    doc
      .fillColor('#9CA3AF')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(L.notes, 50, y, { characterSpacing: 1 });
    doc
      .fillColor('#374151')
      .font('Helvetica')
      .fontSize(9)
      .text(order.notes, 50, y + 12, { width: 495.28 });
  }

  // ── FOOTER ────────────────────────────────────────────────────────────
  const pageH = 841.89;
  doc
    .fillColor('#9CA3AF')
    .font('Helvetica')
    .fontSize(7)
    .text(
      'Svenska Delikatessen · www.swedishcravings.fr · hello@swedishcravings.fr',
      50,
      pageH - 30,
      { align: 'center', width: 495.28, characterSpacing: 0.5 }
    );

  doc.end();
  await done;

  return {
    buffer: Buffer.concat(chunks),
    filename: `purchase-order-${order.number || orderId}-${lang}.pdf`,
  };
}
