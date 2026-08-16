import { supabaseAdmin } from '@/lib/supabase';
import {
  PX, D, SANS, SANS_B, SERIF_B, nouveauDocument, fondEtFilets, enTete, bandeau, pied,
} from '@/lib/pdf-doc';

/* ═══════════════════════════════════════════════════════════════
   BON DE COMMANDE FOURNISSEUR

   Même document que /admin/documents/bon-de-commande/<id>, dont la
   maquette vit dans components/documents/BonDeCommande.tsx. Les deux
   sorties doivent rester identiques : c'est ce PDF qui part chez le
   fournisseur.

   Le document reste multilingue — il s'adresse à des fournisseurs
   suédois — mais les libellés seuls changent : la mise en page, elle,
   est celle de la charte.
   ═══════════════════════════════════════════════════════════════ */

export type PdfLang = 'sv' | 'en' | 'fr';

const LABELS: Record<PdfLang, Record<string, string>> = {
  fr: {
    titre: 'Bon de commande', baseline: 'BRINGING SWEDEN TO YOUR TABLE',
    fournisseur: 'FOURNISSEUR', livraison: 'ADRESSE DE LIVRAISON',
    date: "DATE D'ÉMISSION", livraisonPrevue: 'LIVRAISON PRÉVUE',
    incoterm: 'INCOTERM', paiement: 'PAIEMENT',
    article: 'ARTICLE', ref: 'RÉF.', qte: 'QTÉ', pu: 'P.U. HT', totalLigne: 'TOTAL HT',
    marchandises: 'Total marchandises HT', transport: 'Transport', offert: 'Offert',
    totalHT: 'TOTAL HT', autoliq: 'Autoliquidation de la TVA — achat intracommunautaire',
    consignes: 'CONSIGNES', pourNous: 'POUR SWEDISH CRAVINGS',
    accord: 'BON POUR ACCORD · FOURNISSEUR', cachet: 'Date, cachet et signature',
    defautConsignes: "Palettes filmées, DLC minimum 6 mois à réception. Merci de joindre le bordereau et de nous transmettre le numéro de suivi dès l'expédition.",
    incotermDefaut: 'DAP · rendu magasin', paiementDefaut: '30 jours net',
  },
  en: {
    titre: 'Purchase order', baseline: 'BRINGING SWEDEN TO YOUR TABLE',
    fournisseur: 'SUPPLIER', livraison: 'DELIVERY ADDRESS',
    date: 'ISSUE DATE', livraisonPrevue: 'EXPECTED DELIVERY',
    incoterm: 'INCOTERM', paiement: 'PAYMENT',
    article: 'ITEM', ref: 'REF.', qte: 'QTY', pu: 'UNIT PRICE', totalLigne: 'TOTAL',
    marchandises: 'Goods total', transport: 'Freight', offert: 'Free',
    totalHT: 'TOTAL', autoliq: 'VAT reverse charge — intra-community acquisition',
    consignes: 'INSTRUCTIONS', pourNous: 'FOR SWEDISH CRAVINGS',
    accord: 'APPROVED · SUPPLIER', cachet: 'Date, stamp and signature',
    defautConsignes: 'Wrapped pallets, minimum 6 months shelf life on arrival. Please enclose the delivery note and send us the tracking number on dispatch.',
    incotermDefaut: 'DAP · delivered to store', paiementDefaut: 'Net 30 days',
  },
  sv: {
    titre: 'Inköpsorder', baseline: 'BRINGING SWEDEN TO YOUR TABLE',
    fournisseur: 'LEVERANTÖR', livraison: 'LEVERANSADRESS',
    date: 'ORDERDATUM', livraisonPrevue: 'FÖRVÄNTAD LEVERANS',
    incoterm: 'INCOTERM', paiement: 'BETALNING',
    article: 'ARTIKEL', ref: 'REF.', qte: 'ANT', pu: 'À-PRIS', totalLigne: 'SUMMA',
    marchandises: 'Varor totalt', transport: 'Frakt', offert: 'Fri',
    totalHT: 'TOTALT', autoliq: 'Omvänd skattskyldighet — gemenskapsinternt förvärv',
    consignes: 'ANVISNINGAR', pourNous: 'FÖR SWEDISH CRAVINGS',
    accord: 'GODKÄNT · LEVERANTÖR', cachet: 'Datum, stämpel och signatur',
    defautConsignes: 'Plastade pallar, minst 6 månaders hållbarhet vid ankomst. Bifoga följesedel och skicka spårningsnummer vid avsändning.',
    incotermDefaut: 'DAP · levererat till butik', paiementDefaut: '30 dagar netto',
  },
};

const SIREN = '105 003 537';
const EI = 'EI Victoria Vallet';
const SIEGE = '165 chemin du Vercors, 26800 Étoile-sur-Rhône';

const parse = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

export async function generatePurchaseOrderPdf(
  orderId: string, lang: PdfLang = 'en',
): Promise<{ buffer: Buffer; filename: string }> {
  const L = LABELS[lang] || LABELS.en;

  const { data: order } = await supabaseAdmin
    .from('purchase_orders').select('*, contacts(*)').eq('id', orderId).single();
  if (!order) throw new Error('Commande introuvable');

  const { data: cfg } = await supabaseAdmin
    .from('white_label_config').select('*').limit(1).maybeSingle();
  const wl: Record<string, any> = cfg || {};

  const lignes = parse(order.lines);

  /* Les references produit viennent de la table : un fournisseur doit
     pouvoir rapprocher la ligne de son propre catalogue. */
  const ids = Array.from(new Set(lignes.map((l: any) => l.product_id).filter(Boolean))) as string[];
  const produits: Record<string, any> = {};
  if (ids.length) {
    const { data } = await supabaseAdmin
      .from('products').select('id, sku, sort_order, name_sv, name_en, name_fr, image_url').in('id', ids);
    for (const p of data || []) produits[p.id] = p;
  }

  /* Vignettes : on reconnaît un paquet en rayon plus vite qu'on ne lit
     sa référence.
     On passe par le redimensionnement de Supabase plutôt que par le
     fichier d'origine, pour deux raisons. Le poids d'abord : en pleine
     résolution le bon pesait 11 Mo, injoignable en pièce jointe ; à
     96 px il tient sous 200 ko. Le format ensuite : pdfkit n'embarque
     que du JPEG et du PNG, or une partie du catalogue est en avif et en
     webp — la transformation les rend en JPEG.
     On vérifie quand même les octets d'en-tête, l'extension ment. Une
     image manquante ne doit jamais empêcher le bon de partir. */
  const VIGNETTE_PX = 96;
  const vignettes: Record<string, Buffer> = {};

  const telecharger = async (url: string) => {
    const r = await fetch(url, {
      headers: { Accept: 'image/jpeg,image/png' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    const jpeg = b[0] === 0xff && b[1] === 0xd8;
    const png = b.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
    return jpeg || png ? b : null;
  };

  await Promise.all(ids.map(async id => {
    const url = produits[id]?.image_url;
    if (!url) return;
    const redimensionne = url.replace('/object/public/', '/render/image/public/')
      + `?width=${VIGNETTE_PX}&height=${VIGNETTE_PX}&resize=cover&quality=75`;
    try {
      // Repli sur l'original : si la transformation est indisponible, un
      // JPEG lourd vaut mieux qu'un bon sans photos.
      const b = await telecharger(redimensionne) || await telecharger(url);
      if (b) vignettes[id] = b;
    } catch { /* le bon part sans la photo */ }
  }));

  const fournisseur: any = order.contacts || {};
  const nomFournisseur = fournisseur.company
    || `${fournisseur.first_name || ''} ${fournisseur.last_name || ''}`.trim()
    || order.supplier_name || '—';

  const locale = lang === 'sv' ? 'sv-SE' : lang === 'en' ? 'en-GB' : 'fr-FR';
  const eur = (n: any) =>
    (Number(n) || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const dateLongue = (d?: string | null) => {
    if (!d) return '—';
    const x = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d);
    return Number.isNaN(+x) ? '—' : x.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const { doc, F, ecrire, chunks, fini } = nouveauDocument();
  const W = doc.page.width;
  const M = PX(56);
  const CW = W - M * 2;

  fondEtFilets(doc, D.green, D.gold);
  let y = enTete(doc, ecrire, {
    titre: L.titre, numero: order.number || '', M, CW, y: PX(54), baseline: L.baseline,
  });

  /* ── Fournisseur (fond crème, à gauche) / livraison ─────────── */
  const colW = (CW - PX(22)) / 2;
  const lignesFournisseur = [
    fournisseur.address, fournisseur.email, fournisseur.phone,
  ].filter(Boolean).map(String);
  const hBloc = PX(26) + PX(17) + Math.max(1, lignesFournisseur.length) * PX(12 * 1.65) + PX(13);

  doc.rect(M, y, colW, hBloc).fill(D.cream);
  doc.rect(M, y, PX(2), hBloc).fill(D.green);
  ecrire(L.fournisseur, M + PX(16), y + PX(13),
    { size: PX(8.5), color: D.label2, font: SANS_B, spacing: PX(8.5) * 0.26 });
  ecrire(nomFournisseur, M + PX(16), y + PX(29), { font: SANS_B, size: PX(13), color: D.ink, width: colW - PX(28) });
  ecrire(lignesFournisseur.join('\n') || '—', M + PX(16), y + PX(46),
    { size: PX(12), color: D.body, width: colW - PX(28), lineGap: PX(12) * 0.65 });

  const rx = M + colW + PX(22);
  ecrire(L.livraison, rx, y, { size: PX(8.5), color: D.label, font: SANS_B, spacing: PX(8.5) * 0.26 });
  ecrire(wl.site_name || 'Swedish Cravings', rx, y + PX(16), { font: SANS_B, size: PX(13), color: D.ink });
  ecrire([EI, wl.address || SIEGE].join('\n'), rx, y + PX(33),
    { size: PX(12), color: D.body, width: colW, lineGap: PX(12) * 0.65 });

  y += hBloc + PX(20);

  y = bandeau(doc, ecrire, [
    { label: L.date, value: dateLongue(order.created_at) },
    { label: L.livraisonPrevue, value: dateLongue(order.expected_date) },
    { label: L.incoterm, value: L.incotermDefaut },
    { label: L.paiement, value: L.paiementDefaut },
  ], { M, CW, y });

  /* ── Lignes ─────────────────────────────────────────────────── */
  const cRef = M + CW - PX(100) - PX(92) - PX(60) - PX(88);
  const cQte = M + CW - PX(100) - PX(92) - PX(60);
  const cPu = M + CW - PX(100) - PX(92);
  const cTot = M + CW - PX(100);

  const th = (t: string, x: number, w?: number, align?: any) =>
    ecrire(t, x, y, { size: PX(8.5), color: D.green, font: SANS_B, width: w, align, spacing: PX(8.5) * 0.22 });
  th(L.article, M);
  th(L.ref, cRef, PX(88));
  th(L.qte, cQte, PX(60), 'center');
  th(L.pu, cPu, PX(92), 'right');
  th(L.totalLigne, cTot, PX(100), 'right');

  y += PX(9) + PX(8.5);
  doc.rect(M, y, CW, PX(1.5)).fill(D.green);
  y += PX(11);

  let marchandises = 0;
  const VIG = PX(34);
  for (const l of lignes) {
    const p = produits[l.product_id] || {};
    /* Le suédois prime, quelle que soit la langue des libellés : c'est
       le nom imprimé sur le paquet, celui que le magasin comprend et
       celui qu'on cherche en rayon. */
    const nom = p.name_sv || p.name_fr || l.name_sv || l.name || 'Artikel';
    const ref = p.sku || (p.sort_order ? `SC-${String(p.sort_order).padStart(4, '0')}` : '—');
    const qte = Number(l.qty) || 0;
    const pu = Number(l.unit_cost ?? l.price) || 0;
    const montant = qte * pu;
    marchandises += montant;

    const vignette = vignettes[l.product_id];
    const xNom = M + (vignette ? VIG + PX(10) : 0);
    const wNom = cRef - xNom - PX(12);

    doc.font(F[SANS]).fontSize(PX(13));
    const h = doc.heightOfString(String(nom), { width: wNom });
    const hLigne = Math.max(h, vignette ? VIG : PX(13));

    if (vignette) {
      try {
        doc.save();
        doc.roundedRect(M, y - PX(2), VIG, VIG, PX(3)).clip();
        doc.image(vignette, M, y - PX(2), { cover: [VIG, VIG], align: 'center', valign: 'center' });
        doc.restore();
      } catch { doc.restore(); }
    }

    // Le nom se centre sur la vignette quand elle est plus haute.
    const yNom = y + Math.max(0, (hLigne - h) / 2);
    ecrire(String(nom), xNom, yNom, { size: PX(13), color: D.ink, width: wNom });
    ecrire(ref, cRef, y, { size: PX(11.5), color: D.soft, width: PX(88) });
    ecrire(String(qte), cQte, y, { size: PX(13), color: D.ink, width: PX(60), align: 'center' });
    ecrire(eur(pu), cPu, y, { size: PX(13), color: D.ink, width: PX(92), align: 'right' });
    ecrire(eur(montant), cTot, y, { size: PX(13), color: D.ink, font: SANS_B, width: PX(100), align: 'right' });

    y += hLigne + PX(11);
    doc.rect(M, y, CW, 0.75).fill(D.ruleRow);
    y += PX(11);
  }

  /* ── Consignes à gauche, totaux à droite ────────────────────── */
  const totW = PX(290);
  const totX = M + CW - totW;
  const haut = y + PX(11);

  ecrire(L.consignes, M, haut, { size: PX(8.5), color: D.label, font: SANS_B, spacing: PX(8.5) * 0.24 });
  ecrire(order.notes || L.defautConsignes, M, haut + PX(16),
    { size: PX(10.5), color: D.soft2, width: PX(300), lineGap: PX(10.5) * 0.7 });

  const transport = Number(order.shipping) || 0;
  const total = Number(order.total) || (marchandises + transport);

  let ty = haut;
  const ligneTotal = (label: string, valeur: string, premier: boolean) => {
    if (!premier) doc.rect(totX, ty, totW, 0.75).fill(D.ruleRow);
    ecrire(label, totX, ty + PX(7), { size: PX(12.5), color: D.body });
    ecrire(valeur, totX, ty + PX(7), { size: PX(12.5), color: D.body, width: totW, align: 'right' });
    ty += PX(7) + PX(12.5) + PX(7);
  };
  ligneTotal(L.marchandises, eur(marchandises), true);
  ligneTotal(L.transport, transport > 0 ? eur(transport) : L.offert, false);

  ty += PX(9);
  const hTot = PX(48);
  doc.rect(totX, ty, totW, hTot).fill(D.green);
  ecrire(L.totalHT, totX + PX(16), ty + PX(19),
    { size: PX(10), color: D.cream, font: SANS_B, spacing: PX(10) * 0.24 });
  ecrire(eur(total), totX, ty + PX(13),
    { font: SERIF_B, size: PX(26), color: D.cream, width: totW - PX(16), align: 'right' });
  ty += hTot + PX(7);
  ecrire(L.autoliq, totX, ty, { size: PX(10.5), color: D.soft2, width: totW, align: 'right' });

  /* ── Deux cadres de signature ───────────────────────────────── */
  const cadreW = (CW - PX(24)) / 2;
  const cadreH = PX(104);
  /* Le pied est ancre en bas de page : avec beaucoup de lignes, les
     cadres finiraient dessous. On les remonte tant qu'il y a la place,
     et on les omet plutot que de les faire chevaucher — un cadre de
     signature coupe en deux est pire que pas de cadre. */
  const hautPied = doc.page.height - PX(34) - (PX(40) + PX(13) + 2 * PX(9.5 * 1.65) + PX(6));
  const ySign = Math.max(ty + PX(26), haut + PX(120));
  const placePourSignature = ySign + cadreH + PX(12) <= hautPied;

  if (placePourSignature)
  [[M, L.pourNous, wl.owner_name || 'Gérance'], [M + cadreW + PX(24), L.accord, L.cachet]]
    .forEach(([x, titre, sous]) => {
      doc.rect(x as number, ySign, cadreW, cadreH).lineWidth(0.75).stroke(D.rule);
      ecrire(titre as string, (x as number) + PX(15), ySign + PX(13),
        { size: PX(8.5), color: D.label, font: SANS_B, spacing: PX(8.5) * 0.24 });
      ecrire(sous as string, (x as number) + PX(15), ySign + PX(28), { size: PX(11), color: D.soft2 });
    });

  pied(doc, ecrire, {
    M, CW,
    legal: `${wl.site_name || 'Swedish Cravings'} · ${wl.address || SIEGE}\n`
      + `SIREN ${wl.siret || SIREN} · ${L.autoliq}`,
    contact: `${(wl.email || 'hej@swedishcravings.fr').replace(/^[^@]+/, 'achats')}\n`
      + String(wl.front_url || 'https://www.swedishcravings.fr').replace(/^https?:\/\//, ''),
  });

  doc.end();
  await fini;

  return {
    buffer: Buffer.concat(chunks),
    filename: `bon-de-commande-${order.number || orderId}-${lang}.pdf`,
  };
}
