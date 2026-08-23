import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   FACTURE / AVOIR EN PDF

   Rend le même document que /admin/documents/facture/<id>, dont la
   maquette vit dans components/documents/Facture.tsx. Les deux
   sorties doivent rester identiques : c'est ce PDF qui part en pièce
   jointe des emails et que téléchargent les boutons « Facture PDF ».

   Conversion : la maquette est en px CSS sur une page A4 à 96 dpi,
   le PDF est en points. 1 px = 0,75 pt — d'où PX() partout, qui
   permet de recopier les valeurs de la maquette telles quelles.

   Les vraies polices de la maquette — Cormorant Garamond et Jost —
   sont embarquées depuis src/assets/fonts. Elles sont déclarées dans
   outputFileTracingIncludes (next.config.js) : sans ça le bundle
   serverless ne les emporte pas et la facture sort en Helvetica.
   ═══════════════════════════════════════════════════════════════ */

type InvoiceLine = { desc: string; qty: number; price: number; tva: number };

/** px CSS → points PDF. */
const PX = (px: number) => px * 0.75;

/** Palette de doc-kit.tsx — toute modification doit être faite des deux côtés. */
const D = {
  paper: '#FDFBF5', cream: '#F4EEE1', green: '#44573D', gold: '#B49256',
  ink: '#1F231C', body: '#5F5A4E', soft: '#7A7364', soft2: '#948B79',
  label: '#A0977F', label2: '#8A8067', rule: '#E3DCCB', ruleRow: '#EFE9DC',
  body2: '#4A4639',
} as const;

/* Noms logiques utilisés dans le rendu. Ils pointent sur les vraies
   polices si les fichiers sont là, sinon sur les polices de base de
   pdfkit — une facture doit sortir même sans elles. */
const SANS = 'sans';
const SANS_M = 'sans-medium';
const SANS_B = 'sans-semibold';
const SERIF = 'serif';
const SERIF_B = 'serif-semibold';
const SERIF_I = 'serif-italic';

const FONT_FILES: Record<string, [string, string]> = {
  [SANS]:    ['Jost-Regular.ttf', 'Helvetica'],
  [SANS_M]:  ['Jost-Medium.ttf', 'Helvetica'],
  [SANS_B]:  ['Jost-SemiBold.ttf', 'Helvetica-Bold'],
  [SERIF]:   ['CormorantGaramond-Regular.ttf', 'Times-Roman'],
  [SERIF_B]: ['CormorantGaramond-SemiBold.ttf', 'Times-Bold'],
  [SERIF_I]: ['CormorantGaramond-Italic.ttf', 'Times-Italic'],
};

/** Enregistre les polices ; retourne la table des noms réellement utilisables. */
function registerFonts(doc: PDFKit.PDFDocument): Record<string, string> {
  const dir = path.join(process.cwd(), 'src', 'assets', 'fonts');
  const resolved: Record<string, string> = {};
  for (const [name, [file, fallback]] of Object.entries(FONT_FILES)) {
    try {
      const p = path.join(dir, file);
      if (fs.existsSync(p)) { doc.registerFont(name, p); resolved[name] = name; continue; }
    } catch { /* police illisible : on retombe sur la base */ }
    resolved[name] = fallback;
  }
  return resolved;
}

// Mentions légales centralisées (art. 242 nonies A CGI)
/* L'identité légale vient de white_label_config (migration 046), jamais
   d'une constante : une constante ferait facturer chaque instance au
   nom du premier marchand. Champ vide = ligne omise — un document
   incomplet se voit, un document au mauvais nom se signe. */

function fmtSiren(s: string) {
  const n = (s || '').replace(/\s/g, '');
  if (n.length === 9) return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  if (n.length === 14) return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9, 13)} ${n.slice(13)}`;
  return s;
}

const PAYMENT_LABELS: Record<string, string> = {
  card: 'Carte bancaire', stripe: 'Carte bancaire',
  transfer: 'Virement bancaire', paypal: 'PayPal', other: 'Autre moyen',
};

const eur = (n: number) =>
  (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const dateLong = (d?: string | null) => {
  if (!d) return '—';
  const x = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d);
  return Number.isNaN(+x) ? '—' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

const SHIPPING_WORDS = ['frais de livraison', 'frais de port', 'livraison'];
const isShippingLine = (l: any) =>
  SHIPPING_WORDS.some(s => String(l?.desc || l?.name || '').toLowerCase().includes(s));

const splitAddress = (v: any): string[] => {
  if (!v) return [];
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [v.line1, v.line2, [v.postal_code, v.city].filter(Boolean).join(' '), v.country]
    .filter(Boolean).map(String);
};

export async function generateInvoicePdf(invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
  // Recherche par id de facture, puis repli par order_id (comme /api/invoices/[id]).
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

  const { data: cfg } = await supabaseAdmin
    .from('white_label_config').select('*').limit(1).maybeSingle();
  const wl: Record<string, any> = cfg || {};

  /* La table invoices ne porte pas toujours order_number : sans ce repli,
     la case « Commande » du bandeau reste vide, comme sur l'ancien PDF. */
  let orderNumber: string = inv.order_number || '';
  let orderPaid = false;
  if (inv.order_id) {
    const { data: ord } = await supabaseAdmin
      .from('orders').select('order_number, status').eq('id', inv.order_id).maybeSingle();
    orderNumber = orderNumber || ord?.order_number || '';
    orderPaid = ['paid', 'confirmed', 'shipped', 'delivered'].includes(ord?.status || '');
  }

  /* Le paiement se fait à la commande : dès que la commande est payée, la
     facture l'est aussi. On ne se fie donc pas au seul statut de la facture,
     qui peut être resté à « émise » sur les factures d'avant ce correctif. */
  const isPaid = inv.status === 'paid' || orderPaid;

  const rawLines: InvoiceLine[] = Array.isArray(inv.lines)
    ? inv.lines
    : typeof inv.lines === 'string'
      ? (() => { try { return JSON.parse(inv.lines); } catch { return []; } })()
      : [];

  const isAvoir = inv.status === 'avoir';
  const tone = isAvoir ? D.gold : D.green;
  const toneUnder = isAvoir ? D.green : D.gold;
  const docTitle = isAvoir ? 'Avoir' : 'Facture';

  const productLines = rawLines.filter(l => !isShippingLine(l));
  const shipLine = rawLines.find(isShippingLine);
  const shipping = shipLine ? (Number(shipLine.qty) || 1) * (Number(shipLine.price) || 0) : undefined;
  const subtotal = productLines.reduce((s, l) => s + (Number(l.qty) || 1) * (Number(l.price) || 0), 0);
  const total = Math.abs(Number(inv.total_ttc) || 0);

  /* ── Document ──────────────────────────────────────────────────
     PDF/A-3 avec le XML CII embarqué sous le nom réservé
     `factur-x.xml` : le fichier produit est un FACTUR-X, le format
     pivot de la facturation électronique française (EN 16931). Le
     même PDF sert l'humain (mise en page) et la machine (le XML) —
     c'est tout le principe du format.
     PDF/A-3 impose des polices embarquées : les nôtres le sont déjà
     (Jost, Cormorant), c'est ce qui rend l'option possible. */
  const doc = new PDFDocument({
    size: 'A4', margin: 0, autoFirstPage: true,
    subset: 'PDF/A-3a' as any, pdfVersion: '1.7', tagged: true,
    displayTitle: true,
    info: {
      Title: `${inv.status === 'avoir' ? 'Avoir' : 'Facture'} ${inv.number}`,
      Author: inv.seller_name || '',
    },
  } as any);

  try {
    const { construireFacturX } = await import('@/lib/facturx');
    const fx = construireFacturX(inv);
    (doc as any).file(Buffer.from(fx.xml, 'utf8'), {
      name: 'factur-x.xml',
      type: 'text/xml',
      description: 'Factur-X / EN 16931 — donnees structurees de la facture',
      /* Data : le XML est une representation alternative du document,
         la relation attendue par les lecteurs Factur-X. */
      relationship: 'Data',
      creationDate: new Date(inv.date || Date.now()),
      modifiedDate: new Date(inv.date || Date.now()),
    });
  } catch (e) { console.error('[invoice-pdf] factur-x non embarque :', e); }

  const chunks: Buffer[] = [];
  doc.on('data', (c: any) => chunks.push(Buffer.from(c)));
  const done = new Promise<void>(resolve => doc.on('end', resolve));

  const W = doc.page.width;            // 595,28 pt
  const H = doc.page.height;           // 841,89 pt
  const M = PX(56);                    // marges latérales de la maquette
  const CW = W - M * 2;                // largeur de contenu

  // Fond papier + filets de tête
  doc.rect(0, 0, W, H).fill(D.paper);
  doc.rect(0, 0, W, PX(7)).fill(tone);
  doc.rect(0, PX(7), W, PX(2)).fill(toneUnder);

  const F = registerFonts(doc);

  /* Filigrane « PAYÉE » — posé avant le contenu pour passer dessous,
     à 6 % d'opacité comme dans la maquette. */
  if (isPaid && !isAvoir) {
    doc.save();
    doc.opacity(0.06).fillColor(D.green)
      .font(F[SERIF_B]).fontSize(PX(130));
    doc.rotate(-16, { origin: [W / 2, H * 0.46] });
    doc.text('PAYÉE', 0, H * 0.46 - PX(130) * 0.5, {
      width: W, align: 'center', characterSpacing: PX(130) * 0.14, lineBreak: false,
    });
    doc.restore();
    doc.opacity(1);
  }

  const text = (
    s: string, x: number, y: number,
    o: { size?: number; font?: string; color?: string; width?: number; align?: any; spacing?: number; lineGap?: number } = {},
  ) => {
    doc.font(F[o.font || SANS] || F[SANS]).fontSize(o.size ?? PX(12)).fillColor(o.color || D.ink);
    doc.text(s, x, y, {
      width: o.width, align: o.align, characterSpacing: o.spacing || 0,
      lineGap: o.lineGap ?? 0, lineBreak: o.width != null,
    });
    return doc.y;
  };

  let y = PX(54);

  /* ── En-tête ───────────────────────────────────────────── */
  // Le monogramme n'est pas garanti présent dans le bundle serverless :
  // son absence ne doit pas faire échouer la facture.
  let logoW = 0;
  try {
    const p = path.join(process.cwd(), 'public', 'documents', 'sc-monogramme.png');
    if (fs.existsSync(p)) { doc.image(p, M, y, { width: PX(46), height: PX(69) }); logoW = PX(46) + PX(15); }
  } catch { /* sans logo, le bloc texte se cale simplement à gauche */ }

  text((wl.site_name || '').toUpperCase(), M + logoW, y + PX(14), { font: SERIF_B, size: PX(24), color: D.green, spacing: PX(24) * 0.2 });
  text((wl.site_slogan || '').toUpperCase(), M + logoW, y + PX(46), { size: PX(8), color: D.label, spacing: PX(8) * 0.32 });

  text(docTitle.toUpperCase(), M, y, { font: SERIF, size: PX(38), color: D.ink, width: CW, align: 'right' });
  text(String(inv.number || '').toUpperCase(), M, y + PX(40), {
    font: SANS_B, size: PX(10.5), color: D.gold, width: CW, align: 'right', spacing: PX(10.5) * 0.24,
  });

  y += PX(69) + PX(20);
  doc.rect(M, y, CW, 0.75).fill(D.rule);
  y += PX(22);

  /* ── Émetteur / Facturé à ──────────────────────────────── */
  const colW = (CW - PX(22)) / 2;
  const sellerName = inv.seller_name || wl.site_name || '';
  const sellerLines = [
    wl.legal_name || '',
    ...splitAddress(inv.seller_address || wl.address || ''),
    `SIREN : ${fmtSiren(inv.seller_siret || wl.siret || '')}`,
    wl.rcs_city ? `RCS ${wl.rcs_city}` : '',
    inv.seller_email || wl.email || '',
  ].filter(Boolean);

  const clientName = inv.client_name || inv.customer_name || '—';
  const clientLines = [
    ...splitAddress(inv.client_address || inv.customer_address),
    inv.client_email || inv.customer_email || '',
  ].filter(Boolean);

  const partyTop = y;
  // Colonne gauche, sans fond.
  text('ÉMETTEUR', M, y, { size: PX(8.5), color: D.label, font: SANS_B, spacing: PX(8.5) * 0.26 });
  text(sellerName, M, y + PX(16), { font: SANS_B, size: PX(13), color: D.ink });
  text(sellerLines.join('\n'), M, y + PX(33), { size: PX(12), color: D.body, width: colW, lineGap: PX(12) * 0.65 });
  const leftBottom = doc.y;

  // Colonne droite, sur fond crème avec filet de couleur.
  const rx = M + colW + PX(22);
  const clientBlockH = PX(26) + PX(17) + clientLines.length * PX(12 * 1.65) + PX(13);
  doc.rect(rx, partyTop, colW, clientBlockH).fill(D.cream);
  doc.rect(rx, partyTop, PX(2), clientBlockH).fill(tone);
  text(isAvoir ? 'AVOIR À' : 'FACTURÉ À', rx + PX(16), partyTop + PX(13), {
    size: PX(8.5), color: D.label2, font: SANS_B, spacing: PX(8.5) * 0.26,
  });
  text(clientName, rx + PX(16), partyTop + PX(29), { font: SANS_B, size: PX(13), color: D.ink, width: colW - PX(28) });
  text(clientLines.join('\n'), rx + PX(16), partyTop + PX(46), {
    size: PX(12), color: D.body, width: colW - PX(28), lineGap: PX(12) * 0.65,
  });

  y = Math.max(leftBottom, partyTop + clientBlockH) + PX(20);

  /* ── Bandeau d'informations ────────────────────────────── */
  const meta = [
    { label: "DATE D'ÉMISSION", value: dateLong(inv.date) },
    // La 4e case porte déjà « RÈGLEMENT » (le moyen) : ici c'est l'état.
    { label: isPaid && !isAvoir ? 'STATUT' : 'ÉCHÉANCE', value: isAvoir ? '—' : isPaid ? 'Payée' : 'À réception' },
    { label: 'COMMANDE', value: orderNumber ? `N° ${orderNumber}` : '—' },
    { label: 'RÈGLEMENT', value: PAYMENT_LABELS[inv.payment_method] || 'Carte bancaire' },
  ];
  const bandH = PX(46);
  doc.rect(M, y, CW, bandH).lineWidth(0.75).stroke(D.rule);
  const cellW = CW / meta.length;
  meta.forEach((it, i) => {
    const cx = M + i * cellW;
    if (i > 0) doc.rect(cx, y, 0.75, bandH).fill(D.rule);
    text(it.label, cx + PX(13), y + PX(10), { size: PX(8), color: D.label, font: SANS_B, spacing: PX(8) * 0.2 });
    text(it.value, cx + PX(13), y + PX(23), { font: SANS_M, size: PX(12.5), color: D.ink, width: cellW - PX(20) });
  });
  y += bandH + PX(24);

  /* ── Lignes ────────────────────────────────────────────── */
  const cQty = M + CW - PX(96) - PX(88) - PX(52);
  const cUnit = M + CW - PX(96) - PX(88);
  const cAmount = M + CW - PX(96);

  text('DÉSIGNATION', M, y, { size: PX(8.5), color: tone, font: SANS_B, spacing: PX(8.5) * 0.22 });
  text('QTÉ', cQty, y, { size: PX(8.5), color: tone, font: SANS_B, width: PX(52), align: 'center', spacing: PX(8.5) * 0.22 });
  text('P.U.', cUnit, y, { size: PX(8.5), color: tone, font: SANS_B, width: PX(88), align: 'right', spacing: PX(8.5) * 0.22 });
  text('MONTANT', cAmount, y, { size: PX(8.5), color: tone, font: SANS_B, width: PX(96), align: 'right', spacing: PX(8.5) * 0.22 });
  y += PX(9) + PX(8.5);
  doc.rect(M, y, CW, PX(1.5)).fill(tone);
  y += PX(11);

  const sign = isAvoir ? '− ' : '';
  for (const l of productLines) {
    const qty = Number(l.qty) || 1;
    const unit = Number(l.price) || 0;
    doc.font(F[SANS]).fontSize(PX(13));
    const labelH = doc.heightOfString(String(l.desc || 'Article'), { width: cQty - M - PX(12) });
    text(String(l.desc || 'Article'), M, y, { size: PX(13), color: D.ink, width: cQty - M - PX(12) });
    text(String(qty), cQty, y, { size: PX(13), color: D.ink, width: PX(52), align: 'center' });
    text(eur(unit), cUnit, y, { size: PX(13), color: D.ink, width: PX(88), align: 'right' });
    text(sign + eur(qty * unit), cAmount, y, { size: PX(13), color: D.ink, font: SANS_B, width: PX(96), align: 'right' });
    y += Math.max(labelH, PX(13)) + PX(11);
    doc.rect(M, y, CW, 0.75).fill(D.ruleRow);
    y += PX(11);
  }

  /* ── Mentions à gauche, totaux à droite ────────────────── */
  const totalsW = PX(290);
  const totalsX = M + CW - totalsW;
  const blockTop = y + PX(11);

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Sous-total', value: sign + eur(subtotal) },
    ...(shipping != null ? [{ label: shipLine?.desc || 'Livraison', value: shipping > 0 ? sign + eur(shipping) : 'Offerte' }] : []),
    { label: 'TVA', value: 'Non applicable' },
  ];

  let ty = blockTop;
  rows.forEach((r, i) => {
    if (i > 0) { doc.rect(totalsX, ty, totalsW, 0.75).fill(D.ruleRow); }
    text(r.label, totalsX, ty + PX(7), { size: PX(12.5), color: D.body });
    text(r.value, totalsX, ty + PX(7), { size: PX(12.5), color: D.body, width: totalsW, align: 'right' });
    ty += PX(7) + PX(12.5) + PX(7);
  });

  ty += PX(9);
  const totalH = PX(48);
  doc.rect(totalsX, ty, totalsW, totalH).fill(tone);
  text(isAvoir ? 'TOTAL DE L’AVOIR' : isPaid ? 'TOTAL PAYÉ' : 'TOTAL À RÉGLER', totalsX + PX(16), ty + PX(19), {
    size: PX(10), color: isAvoir ? D.paper : D.cream, font: SANS_B, spacing: PX(10) * 0.24,
  });
  text(sign + eur(total), totalsX, ty + PX(13), {
    font: SERIF_B, size: PX(26), color: isAvoir ? D.paper : D.cream, width: totalsW - PX(16), align: 'right',
  });
  ty += totalH + PX(7);
  text('TVA non applicable, art. 293 B du CGI', totalsX, ty, {
    size: PX(10.5), color: D.soft2, width: totalsW, align: 'right',
  });

  if (!isAvoir && !isPaid) {
    text(
      "Pénalités de retard : 3 fois le taux d'intérêt légal. Indemnité forfaitaire pour frais " +
      "de recouvrement : 40 €. Pas d'escompte pour paiement anticipé.",
      M, blockTop, { size: PX(10.5), color: D.soft2, width: PX(300), lineGap: PX(10.5) * 0.7 },
    );
  }

  /* ── Pied de page ──────────────────────────────────────── */
  /* Hauteur réservée au pied : filet + formule + règle + deux lignes de
     mentions. Calculée, pas devinée — avec les vraies polices une ligne
     de plus déborde sous le bord de la feuille. */
  const footH = PX(40) + PX(13) + 2 * PX(9.5 * 1.65) + PX(6);
  const footTop = H - PX(34) - footH;
  const cx = W / 2;
  doc.rect(cx - PX(72), footTop, PX(56), 0.75).fill(D.rule);
  doc.rect(cx + PX(16), footTop, PX(56), 0.75).fill(D.rule);
  doc.save().translate(cx, footTop).rotate(45).rect(-PX(2.5), -PX(2.5), PX(5), PX(5)).fill(D.gold).restore();

  text('Tack så mycket — merci de votre confiance.', M, footTop + PX(14), {
    font: SERIF_I, size: PX(14), color: D.green, width: CW, align: 'center',
  });

  const ruleY = footTop + PX(40);
  doc.rect(M, ruleY, CW, 0.75).fill(D.rule);
  // Mêmes deux lignes que la maquette (legalLine1 / legalLine2).
  text(
    [sellerName, wl.legal_name, inv.seller_address || wl.address].filter(Boolean).join(' · ') + '\n' +
    [`SIREN ${fmtSiren(inv.seller_siret || wl.siret || '')}`, wl.rcs_city ? `RCS ${wl.rcs_city}` : '',
     'TVA non applicable, art. 293 B du CGI'].filter(Boolean).join(' · '),
    M, ruleY + PX(13), { size: PX(9.5), color: D.soft2, width: CW * 0.64, lineGap: PX(9.5) * 0.65 },
  );
  text(
    `${inv.seller_email || wl.email || ''}${wl.phone ? '  ·  ' + wl.phone : ''}\n` +
    String(wl.front_url || '').replace(/^https?:\/\//, ''),
    M + CW * 0.64, ruleY + PX(13),
    { size: PX(9.5), color: D.soft2, width: CW * 0.36, align: 'right', lineGap: PX(9.5) * 0.65 },
  );

  doc.end();
  await done;

  return {
    buffer: Buffer.concat(chunks),
    filename: `${isAvoir ? 'avoir' : 'facture'}-${inv.number}.pdf`,
  };
}
