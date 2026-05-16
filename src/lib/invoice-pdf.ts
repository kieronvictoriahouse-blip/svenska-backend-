import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '@/lib/supabase';

type InvoiceLine = { desc: string; qty: number; price: number; tva: number };

const STATUS_FR: Record<string, string> = {
  draft: 'BROUILLON', sent: 'ÉMISE', paid: 'PAYÉE',
  late: 'EN RETARD', avoir: 'AVOIR', refunded: 'REMBOURSÉE',
};

export async function generateInvoicePdf(invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
  // Lookup by invoice id first, then fallback by order_id (comme /api/invoices/[id])
  let inv: any = null;
  const byId = await supabaseAdmin.from('invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (byId.data) {
    inv = byId.data;
  } else {
    const byOrder = await supabaseAdmin
      .from('invoices').select('*').eq('order_id', invoiceId).neq('status', 'avoir')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    inv = byOrder.data || null;
  }
  if (!inv) throw new Error('Facture introuvable');

  const lines: InvoiceLine[] = Array.isArray(inv.lines)
    ? inv.lines
    : typeof inv.lines === 'string'
    ? (() => { try { return JSON.parse(inv.lines); } catch { return []; } })()
    : [];

  const doc = new PDFDocument({ size: 'A4', margin: 50, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: any) => chunks.push(Buffer.from(c)));
  const done = new Promise<void>((resolve) => doc.on('end', resolve));

  const fmtNum = (n: number) =>
    (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const fmtDate = (d?: string) =>
    d ? new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';

  const isAvoir = inv.status === 'avoir';
  const docTitle = isAvoir ? 'AVOIR' : 'FACTURE';
  const statusLabel = STATUS_FR[inv.status] || inv.status?.toUpperCase() || '';

  // ── HEADER ────────────────────────────────────────────────────────────
  // Left: company name
  doc
    .fillColor('#1C2028')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(inv.seller_name || 'Svenska Delikatessen', 50, 50);

  if (inv.seller_address) {
    doc
      .fillColor('#6B7280')
      .font('Helvetica')
      .fontSize(9)
      .text(inv.seller_address, 50, 74, { width: 220, lineBreak: true });
  }

  // Right: FACTURE title + number + date
  doc
    .fillColor('#3E5238')
    .font('Helvetica-Bold')
    .fontSize(24)
    .text(docTitle, 350, 50, { align: 'right', width: 195 });

  doc
    .fillColor('#1C2028')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(inv.number || '—', 350, 82, { align: 'right', width: 195 });

  doc
    .fillColor('#6B7280')
    .font('Helvetica')
    .fontSize(9)
    .text(`Date : ${fmtDate(inv.date)}`, 350, 98, { align: 'right', width: 195 });

  // Status badge
  const badgeColor = inv.status === 'paid' ? '#10B981' : inv.status === 'sent' ? '#3B82F6' : inv.status === 'avoir' ? '#8B5CF6' : '#94A3B8';
  doc.rect(450, 112, 95, 16).fill(badgeColor);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text(statusLabel, 453, 116, { width: 89, align: 'center', characterSpacing: 0.8 });

  let y = 160;
  doc.moveTo(50, y).lineTo(545.28, y).strokeColor('#E5E7EB').lineWidth(0.7).stroke();
  y += 16;

  // ── SELLER / CLIENT BOXES ─────────────────────────────────────────────
  // Seller box (left)
  doc.rect(50, y, 230, 90).fill('#F9FAFB');
  doc.fillColor('#9CA3AF').font('Helvetica-Bold').fontSize(7).text('ÉMETTEUR', 62, y + 10, { characterSpacing: 1 });
  doc.fillColor('#1C2028').font('Helvetica-Bold').fontSize(10).text(inv.seller_name || 'Svenska Delikatessen', 62, y + 22);
  let sellerY = y + 36;
  if (inv.seller_siret) {
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(`SIRET : ${inv.seller_siret}`, 62, sellerY);
    sellerY += 12;
  }
  if (inv.seller_email) {
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(inv.seller_email, 62, sellerY);
    sellerY += 12;
  }
  if (inv.seller_phone) {
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(inv.seller_phone, 62, sellerY);
  }

  // Client box (right)
  doc.rect(315, y, 230, 90).fill('#F9FAFB');
  doc.fillColor('#9CA3AF').font('Helvetica-Bold').fontSize(7).text('CLIENT', 327, y + 10, { characterSpacing: 1 });
  doc.fillColor('#1C2028').font('Helvetica-Bold').fontSize(10).text(inv.client_name || '—', 327, y + 22);
  let clientY = y + 36;
  if (inv.client_address) {
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(inv.client_address, 327, clientY, { width: 206, lineBreak: false });
    clientY += 12;
  }
  if (inv.client_email) {
    doc.fillColor('#6B7280').font('Helvetica').fontSize(8).text(inv.client_email, 327, clientY);
  }

  y += 106;

  // ── TABLE HEADER ──────────────────────────────────────────────────────
  const COL = { desc: 50, qty: 318, pu: 358, tva: 418, total: 476 };
  doc.rect(50, y, 495.28, 20).fill('#1C2028');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
  doc.text('DÉSIGNATION',     COL.desc, y + 6, { characterSpacing: 0.7 });
  doc.text('QTÉ',             COL.qty,  y + 6, { width: 34, align: 'right', characterSpacing: 0.7 });
  doc.text('P.U. HT',         COL.pu,   y + 6, { width: 54, align: 'right', characterSpacing: 0.7 });
  doc.text('TVA',             COL.tva,  y + 6, { width: 42, align: 'center', characterSpacing: 0.7 });
  doc.text('TOTAL HT',        COL.total,y + 6, { width: 64, align: 'right', characterSpacing: 0.7 });
  y += 20;

  // ── TABLE ROWS ────────────────────────────────────────────────────────
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const lineTotal = (l.qty || 0) * (l.price || 0);
    const ROW_H = 30;

    if (y + ROW_H > 750) { doc.addPage(); y = 50; }

    doc.rect(50, y, 495.28, ROW_H).fill(i % 2 === 0 ? '#FFFFFF' : '#F9FAFB');

    doc.fillColor('#1C2028').font('Helvetica').fontSize(9)
      .text(l.desc || '—', COL.desc, y + (ROW_H - 9) / 2, { width: 260, lineBreak: false });
    doc.text(String(l.qty ?? 0), COL.qty, y + (ROW_H - 9) / 2, { width: 34, align: 'right', lineBreak: false });
    doc.text(fmtNum(l.price || 0), COL.pu, y + (ROW_H - 9) / 2, { width: 54, align: 'right', lineBreak: false });
    doc.fillColor('#6B7280').text(
      l.tva != null ? `${l.tva}%` : '—',
      COL.tva, y + (ROW_H - 9) / 2, { width: 42, align: 'center', lineBreak: false }
    );
    doc.fillColor('#1C2028').font('Helvetica-Bold').text(fmtNum(lineTotal), COL.total, y + (ROW_H - 9) / 2, { width: 64, align: 'right', lineBreak: false });

    doc.moveTo(50, y + ROW_H).lineTo(545.28, y + ROW_H).strokeColor('#F0F0F0').lineWidth(0.4).stroke();
    y += ROW_H;
  }

  // ── TOTALS ────────────────────────────────────────────────────────────
  y += 10;
  if (y + 80 > 750) { doc.addPage(); y = 50; }

  const totalsX = 350;
  const totalsW = 195.28;

  const isMicro = !inv.total_tva || inv.total_tva === 0;
  const totalHt = inv.total_ht || lines.reduce((s: number, l: InvoiceLine) => s + (l.qty * l.price), 0);
  const totalTva = inv.total_tva || 0;
  const totalTtc = inv.total_ttc || (totalHt + totalTva);

  if (!isMicro) {
    // Total HT
    doc.fillColor('#6B7280').font('Helvetica').fontSize(9)
      .text('Total HT', totalsX, y, { width: totalsW - 10, align: 'left' });
    doc.fillColor('#1C2028').font('Helvetica').fontSize(9)
      .text(fmtNum(totalHt), totalsX, y, { width: totalsW, align: 'right' });
    y += 18;
    // TVA
    doc.fillColor('#6B7280').font('Helvetica').fontSize(9)
      .text('TVA', totalsX, y, { width: totalsW - 10, align: 'left' });
    doc.fillColor('#1C2028').font('Helvetica').fontSize(9)
      .text(fmtNum(totalTva), totalsX, y, { width: totalsW, align: 'right' });
    y += 8;
    doc.moveTo(totalsX, y).lineTo(545.28, y).strokeColor('#D1D5DB').lineWidth(0.5).stroke();
    y += 8;
  }

  // Total TTC / Total
  doc.rect(totalsX, y, totalsW, 28).fill('#3E5238');
  const totalLabel = isMicro ? 'TOTAL' : 'TOTAL TTC';
  doc.fillColor('#a8c49a').font('Helvetica-Bold').fontSize(7.5).text(totalLabel, totalsX + 8, y + 7, { characterSpacing: 1 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13)
    .text(fmtNum(isMicro ? totalHt : totalTtc), totalsX + 8, y + 11, { width: totalsW - 16, align: 'right' });

  // Mention micro-entreprise
  if (isMicro) {
    y += 36;
    doc.fillColor('#9CA3AF').font('Helvetica').fontSize(7.5)
      .text('TVA non applicable — art. 293 B du CGI (micro-entreprise)', 50, y, { width: 495.28 });
  }

  // ── LEGAL / NOTES ─────────────────────────────────────────────────────
  y += 48;
  if (inv.note || inv.legal_mention) {
    doc.moveTo(50, y).lineTo(545.28, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    y += 10;
    if (inv.note) {
      doc.fillColor('#9CA3AF').font('Helvetica-Bold').fontSize(7).text('NOTE', 50, y, { characterSpacing: 1 });
      doc.fillColor('#374151').font('Helvetica').fontSize(9).text(inv.note, 50, y + 12, { width: 495.28 });
      y += 28 + Math.max(0, Math.ceil(inv.note.length / 90) * 10);
    }
    if (inv.legal_mention) {
      doc.fillColor('#9CA3AF').font('Helvetica-Bold').fontSize(7).text('MENTIONS LÉGALES', 50, y, { characterSpacing: 1 });
      doc.fillColor('#9CA3AF').font('Helvetica').fontSize(7.5).text(inv.legal_mention, 50, y + 12, { width: 495.28 });
    }
  }

  // ── FOOTER ────────────────────────────────────────────────────────────
  doc.fillColor('#C4C4C4').font('Helvetica').fontSize(7)
    .text(`${inv.seller_name || 'Svenska Delikatessen'} · ${inv.number}`, 50, 820, { align: 'center', width: 495.28 });

  doc.end();
  await done;

  return {
    buffer: Buffer.concat(chunks),
    filename: `facture-${(inv.number || invoiceId).replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf`,
  };
}
