'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { adminFetch } from '@/lib/auth-client';
import { useIsMobile } from '@/lib/use-mobile';
import { DOC_PRINT_CSS, DocLine, Party } from '@/components/documents/doc-kit';
import Facture, { FactureData } from '@/components/documents/Facture';
import Avoir, { AvoirData } from '@/components/documents/Avoir';
import BonDeCommande from '@/components/documents/BonDeCommande';
import BonDeLivraison from '@/components/documents/BonDeLivraison';
import Devis from '@/components/documents/Devis';
import BonDeRetour from '@/components/documents/BonDeRetour';
import { traduire, useAdminLang } from '@/lib/admin-i18n';
import { TDO } from '@/app/admin/factures/[id]/i18n';

/* ── Téléphone ────────────────────────────────────────────────
   La feuille A4 (794 px) est réduite à la largeur de l'écran par un
   zoom CSS réservé à l'écran : l'impression garde les millimètres
   réels. On peut repasser en taille réelle (défilement horizontal) ou
   pincer pour zoomer. Les actions (partager le PDF, imprimer) sont
   collées en bas, sous le pouce. */
const DOC_MOBILE_CSS = `
  /* Page « nue » : la classe .ms du shell n'est pas chargée ici. */
  .doc-toolbar .ms, .doc-mbar .ms { font-family: 'Material Symbols Rounded'; font-weight: normal; font-style: normal; line-height: 1;
    letter-spacing: normal; text-transform: none; white-space: nowrap; direction: ltr; -webkit-font-feature-settings: 'liga'; font-feature-settings: 'liga'; }
  @media screen and (max-width: 899px) {
    .doc-toolbar { gap: 4px; padding: 4px 6px; padding-top: calc(4px + env(safe-area-inset-top)); min-height: 52px; }
    .doc-toolbar .doc-tb-icon { width: 44px; height: 44px; padding: 0; justify-content: center; border: none; font-size: 22px; }
    .doc-toolbar .doc-tb-title { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14px; opacity: .85 !important; }
    .doc-m { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
    .doc-fit .doc-page { zoom: var(--doc-zoom, 1); margin: 10px auto; }
    .doc-m:not(.doc-fit) .doc-page { flex-shrink: 0; }
    .doc-mbar { position: sticky; bottom: 0; z-index: 5; margin-top: auto; display: flex; gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); background: #1F231C; }
    .doc-mbar button { flex: 1; min-height: 46px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border-radius: 9px; font: inherit; font-size: 15px; cursor: pointer; border: 1px solid rgba(244,238,225,.3); background: none; color: #F4EEE1; }
    .doc-mbar button.primary { background: #F4EEE1; color: #1F231C; border-color: #F4EEE1; font-weight: 600; }
    .doc-mbar button:disabled { opacity: .55; }
  }
  @media print { .doc-mbar { display: none !important; } }
`;

/* Route d'impression : /admin/documents/<type>/<id>
   types : facture · avoir · bon-de-commande · bon-de-livraison · devis · bon-de-retour
   Rendu A4 pixel-perfect depuis les données réelles.
   Ctrl+P → « Enregistrer en PDF » sort exactement ce qui est à l'écran. */

const SHIPPING_LABELS = ['frais de livraison', 'frais de port', 'livraison'];
const isShippingLine = (l: any) =>
  SHIPPING_LABELS.some(s => String(l?.desc || l?.name || '').toLowerCase().includes(s));

/** Source de données selon le type de document. */
const SOURCE: Record<string, 'invoice' | 'order' | 'purchase'> = {
  'facture': 'invoice',
  'avoir': 'invoice',
  'bon-de-livraison': 'order',
  'bon-de-retour': 'order',
  'devis': 'order',
  'bon-de-commande': 'purchase',
};

const TITLES: Record<string, string> = {
  'facture': 'Facture', 'avoir': 'Avoir', 'bon-de-commande': 'Bon de commande',
  'bon-de-livraison': 'Bon de livraison', 'devis': 'Devis', 'bon-de-retour': 'Bon de retour',
};

/** « 24 g », « 250 ml », « 1,2 kg » → grammes. Le ml est compte comme 1 g. */
const grammes = (w: any): number => {
  const m = String(w || '').replace(',', '.').match(/([\d.]+)\s*(kg|g|l|ml|cl)?/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!n) return 0;
  switch ((m[2] || 'g').toLowerCase()) {
    case 'kg': case 'l': return n * 1000;
    case 'cl': return n * 10;
    default:   return n;
  }
};

const fmtPoids = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2).replace('.', ',')} kg` : `${Math.round(g)} g`);

const splitAddress = (v: any): string[] => {
  if (!v) return [];
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean);
  return [v.line1, v.line2, [v.postal_code, v.city].filter(Boolean).join(' '), v.country]
    .filter(Boolean).map(String);
};

export default function DocumentPrintPage() {
  const langue = useAdminLang();
  const params = useParams<{ type: string; id: string }>();
  const qs = useSearchParams();
  const type = String(params?.type || '');
  const id = String(params?.id || '');
  const source = SOURCE[type];

  const [doc, setDoc] = useState<any>(null);
  const [cfg, setCfg] = useState<any>({});
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [error, setError] = useState('');

  const mobile = useIsMobile();
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const calc = () => setZoom(Math.min(1, (window.innerWidth - 16) / (210 * 96 / 25.4)));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  /* Partage du PDF serveur (facture, avoir). Le fichier est gardé : si le
     navigateur refuse le partage parce que le téléchargement a pris
     trop de temps après le toucher, le toucher suivant partage aussitôt. */
  const pdfRef = useRef<File | null>(null);
  const [sharing, setSharing] = useState<'' | 'busy' | 'ready'>('');
  const canShareFiles = typeof navigator !== 'undefined' && typeof (navigator as any).canShare === 'function';

  useEffect(() => {
    if (!source) { setError(`Type de document inconnu : « ${type} »`); return; }
    (async () => {
      try {
        const url = source === 'invoice' ? `/api/invoices/${id}`
                  : source === 'purchase' ? `/api/purchase-orders/${id}`
                  : `/api/orders/${id}`;
        const [res, wl] = await Promise.all([
          adminFetch(url).then(r => r.json()),
          adminFetch('/api/white-label').then(r => r.json()).catch(() => ({})),
        ]);
        if (res?.error) { setError(res.error); return; }
        setDoc(res.invoice || res.order);
        setCfg(wl?.config || {});
        /* Le catalogue sert au bon de livraison (le poids du colis n'est
           stocké nulle part, on le reconstitue) et au bon de commande
           (nom suédois et photo : c'est le document avec lequel on va en
           magasin, où personne ne lit le français). */
        if (type === 'bon-de-livraison' || type === 'bon-de-commande') {
          adminFetch('/api/products?limit=1000').then(r => r.json())
            .then(d => setCatalogue(d.products || [])).catch(() => {});
        }
      } catch (e: any) {
        setError(e?.message || 'Chargement impossible');
      }
    })();
  }, [id, type, source]);

  if (error) return <div style={{ padding: 40, fontFamily: 'Jost, sans-serif' }}>⚠️ {error}</div>;
  if (!doc) return <div style={{ padding: 40, fontFamily: 'Jost, sans-serif' }}>{'…'}</div>;

  /* ── Identité de l'émetteur ─────────────────────────── */
  const sellerName = doc.seller_name || cfg.site_name || '';
  const sellerSiret = doc.seller_siret || cfg.siret || '';
  const sellerAddr = doc.seller_address || cfg.address || '';
  const seller: Party = {
    name: sellerName,
    lines: [...splitAddress(sellerAddr), sellerSiret ? `SIRET ${sellerSiret}` : ''].filter(Boolean),
  };

  const legalLine1 = `${sellerName}${sellerAddr ? ' · ' + sellerAddr : ''}`;
  const legalLine2 = [
    sellerSiret ? `SIRET ${sellerSiret}` : '',
    type === 'bon-de-retour'
      ? 'Droit de rétractation 14 jours (art. L221-18)'
      : type === 'bon-de-commande'
        ? (cfg.tva ? `TVA intracommunautaire ${cfg.tva}` : 'Autoliquidation de la TVA')
        : (doc.legal_mention || 'TVA non applicable, art. 293 B du CGI'),
  ].filter(Boolean).join(' · ');

  const mailbox = type === 'bon-de-commande' ? 'achats' : type === 'bon-de-retour' ? 'retours' : null;
  const baseMail = doc.seller_email || cfg.email || '';
  const mail = mailbox ? baseMail.replace(/^[^@]+/, mailbox) : baseMail;
  const contactLine1 = [mail, doc.seller_phone || cfg.phone].filter(Boolean).join(' · ');
  const contactLine2 = String(cfg.front_url || '').replace(/^https?:\/\//, '');
  const legals = { legalLine1, legalLine2, contactLine1, contactLine2 };

  /* ── Lignes ─────────────────────────────────────────── */
  let raw: any[] = [];
  try { raw = typeof doc.lines === 'string' ? JSON.parse(doc.lines) : (doc.lines || []); } catch { raw = []; }
  const productLines = raw.filter(l => !isShippingLine(l));
  const shippingLine = raw.find(isShippingLine);
  const shipping = shippingLine
    ? (Number(shippingLine.qty) || 1) * (Number(shippingLine.price) || 0)
    : (source === 'order' ? Number(doc.shipping) || 0 : undefined);

  const parProduit: Record<string, any> = Object.fromEntries(
    (catalogue || []).map((p: any) => [p.id, p]));

  const lines: DocLine[] = productLines.map(l => {
    const qty = Number(l.qty) || 1;
    /* Une ligne d'achat porte `unit_cost`, pas `price` : sans ce repli,
       le bon de commande s'imprimait avec des prix à zéro. */
    const unit = Number(l.price ?? l.unit_price ?? l.unit_cost_eur ?? l.unit_cost) || 0;
    const p = parProduit[l.product_id] || {};

    /* Sur le bon de commande, le suédois prime : c'est le nom écrit sur
       le paquet, celui que le magasin comprend et celui qu'on cherche en
       rayon. La photo évite de confondre deux sachets voisins. */
    const enSuedois = type === 'bon-de-commande';
    const label = enSuedois
      ? (p.name_sv || l.name_sv || p.name_fr || l.desc || l.name || 'Artikel')
      : (l.desc || l.name_fr || l.name || 'Article');

    return {
      label,
      desc: l.subdesc || undefined,
      // Vignette redimensionnée : la photo pleine résolution pèse des
      // centaines de kilo-octets pour être affichée en 34 px.
      image: enSuedois && p.image_url
        ? p.image_url.replace('/object/public/', '/render/image/public/')
          + '?width=96&height=96&resize=cover&quality=75'
        : undefined,
      ref: l.ref || l.sku || p.sku || undefined,
      qty, unit, amount: qty * unit,
    };
  });
  const subtotal = lines.reduce((s, l) => s + (l.amount || 0), 0);

  const backHref = source === 'purchase' ? '/admin/achats' : source === 'invoice' ? '/admin/gestion' : '/admin/commandes';
  /* Ouvert depuis l'écran précédent dans le même onglet (téléphone) :
     « Retour » y revient, avec la commande encore ouverte. Dans un
     nouvel onglet (ordinateur), le lien garde sa destination. */
  const goBack = (e: React.MouseEvent) => {
    if (window.history.length > 1) { e.preventDefault(); window.history.back(); }
  };
  const docTitle = `${TITLES[type]} ${doc.number || doc.order_number}`;
  const pdfDispo = source === 'invoice' && !!doc.id;

  async function partager() {
    if (!pdfDispo) return;
    const nav = navigator as any;
    try {
      if (!pdfRef.current) {
        setSharing('busy');
        const res = await adminFetch(`/api/invoices/${doc.id}/pdf`);
        if (!res.ok) throw new Error(traduire(TDO.pdfKo, langue));
        const blob = await res.blob();
        pdfRef.current = new File([blob], `${type}-${doc.number || id}.pdf`, { type: 'application/pdf' });
      }
      const file = pdfRef.current;
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: docTitle });
          setSharing('');
        } catch (e: any) {
          // Délai d'activation dépassé : le prochain toucher partage directement.
          setSharing(e?.name === 'NotAllowedError' ? 'ready' : '');
        }
      } else {
        const href = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = href; a.download = file.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 10000);
        setSharing('');
      }
    } catch (e: any) {
      setSharing('');
      alert(e?.message || traduire(TDO.pdfKo, langue));
    }
  }

  const toolbar = mobile ? (
    <div className="doc-toolbar">
      <a className="doc-tb-icon" href={backHref} onClick={goBack} aria-label={traduire(TDO.retour, langue)}>←</a>
      <span className="doc-tb-title">{docTitle}</span>
      <button className="doc-tb-icon" onClick={() => setFit(v => !v)}
              aria-label={fit ? traduire(TDO.tailleReelle, langue) : traduire(TDO.ajuster, langue)}
              title={fit ? traduire(TDO.tailleReelle, langue) : traduire(TDO.ajuster, langue)}>
        <span className="ms" style={{ fontFamily: "'Material Symbols Rounded'", fontSize: 22 }}>{fit ? 'zoom_in' : 'fit_screen'}</span>
      </button>
    </div>
  ) : (
    <div className="doc-toolbar">
      <button onClick={() => window.print()}>{traduire(TDO.imprimer, langue)}</button>
      <a href={backHref} onClick={goBack}>← {traduire(TDO.retour, langue)}</a>
      <span style={{ flex: 1 }} />
      <span style={{ opacity: .6 }}>{docTitle}</span>
    </div>
  );
  const wrap = (node: React.ReactNode) => mobile ? (
    <div className={`doc-m${fit ? ' doc-fit' : ''}`} style={{ ['--doc-zoom' as any]: zoom }}>
      <style dangerouslySetInnerHTML={{ __html: DOC_PRINT_CSS + DOC_MOBILE_CSS }} />
      {toolbar}
      {node}
      <div className="doc-mbar">
        {pdfDispo && canShareFiles && (
          <button onClick={partager} disabled={sharing === 'busy'}>
            <span className="ms" style={{ fontFamily: "'Material Symbols Rounded'", fontSize: 20 }}>ios_share</span>
            {sharing === 'busy' ? traduire(TDO.preparation, langue) : sharing === 'ready' ? traduire(TDO.partagerPret, langue) : traduire(TDO.partager, langue)}
          </button>
        )}
        <button className="primary" onClick={() => window.print()}>
          <span className="ms" style={{ fontFamily: "'Material Symbols Rounded'", fontSize: 20 }}>print</span>
          {traduire(TDO.imprimer, langue)}
        </button>
      </div>
    </div>
  ) : (
    <><style dangerouslySetInnerHTML={{ __html: DOC_PRINT_CSS + DOC_MOBILE_CSS }} />{toolbar}{node}</>
  );

  const client: Party = {
    name: doc.client_name || doc.customer_name || '—',
    lines: [
      ...splitAddress(doc.client_address || doc.shipping_address || doc.customer_address),
      doc.client_email || doc.customer_email || '',
    ].filter(Boolean),
  };

  /* ══════════ FACTURE ══════════ */
  if (type === 'facture') {
    /* Remise d'un code promo : les factures récentes la portent en ligne
       (« Remise (code X) »), les anciennes non — sous-total + port ne
       retombait alors pas sur le total payé. L'écart, s'il existe, est la
       remise ; il vaut 0 quand la ligne est déjà là. */
    const total = Number(doc.total_ttc) || 0;
    const ecartRemise = Math.round((subtotal + (shipping || 0) - total) * 100) / 100;
    const d: FactureData = {
      number: doc.number, date: doc.date, dueLabel: 'À réception',
      orderNumber: doc.order_number || undefined, paymentLabel: 'Carte bancaire',
      seller, client, lines, subtotal, shipping,
      shippingLabel: shippingLine?.desc || undefined,
      ...(ecartRemise > 0.004 ? { discount: ecartRemise, discountLabel: doc.promo_code ? `Remise · ${doc.promo_code}` : 'Remise' } : {}),
      total,
      paid: doc.status === 'paid', bank: null, ...legals,
    };
    return wrap(<Facture d={d} />);
  }

  /* ══════════ AVOIR ══════════ */
  if (type === 'avoir') {
    const note = String(doc.note || '');
    const detail = note.replace(/^Avoir(?: partiel)? sur [^—]+—?\s*/, '').trim();
    const d: AvoirData = {
      number: doc.number, date: doc.date,
      originalInvoice: note.match(/(FAC-\d{4}-\d+)/)?.[1],
      reason: detail || 'Geste commercial',
      reasonDetail: detail || undefined,
      seller, client,
      lines: lines.map(l => ({ ...l, amountText: '− ' + (l.amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €' })),
      total: Math.abs(Number(doc.total_ttc) || 0),
      refundedOn: doc.date, ...legals,
    };
    return wrap(<Avoir d={d} />);
  }

  /* ══════════ BON DE COMMANDE ══════════ */
  if (type === 'bon-de-commande') {
    const supplier: Party = {
      name: doc.supplier_name || doc.contacts?.name || 'Fournisseur',
      lines: [
        ...splitAddress(doc.contacts?.address),
        doc.contacts?.email || '', doc.contacts?.phone || '',
      ].filter(Boolean),
    };
    return wrap(<BonDeCommande d={{
      number: doc.number, date: doc.created_at, expectedAt: doc.expected_date,
      supplier,
      deliverTo: { name: sellerName, lines: splitAddress(sellerAddr) },
      lines, goodsTotal: Number(doc.subtotal) || subtotal,
      freight: Number(doc.shipping) || 0,
      total: Number(doc.total) || subtotal,
      instructions: doc.notes || undefined,
      signerName: cfg.owner_name || undefined,
      ...legals,
    }} />);
  }

  /* ══════════ BON DE LIVRAISON ══════════ */
  if (type === 'bon-de-livraison') {
    // Poids articles + 80 g d'emballage, arrondi a la dizaine de grammes.
    let brut = 0, incomplet = false;
    for (const l of productLines) {
      const p = catalogue.find((c: any) => c.id === l.product_id);
      const g = grammes(p?.weight);
      if (!g) incomplet = true;                 // article sans poids renseigne
      brut += g * (Number(l.qty) || 1);
    }
    const poidsColis = brut > 0 ? Math.round((brut + 80) / 10) * 10 : 0;
    /* Un tiers du catalogue n'a pas de poids : afficher un total sec
       laisserait croire a une pesee. Le « environ » dit ce qu'il vaut. */
    const poidsTexte = poidsColis > 0 ? (incomplet ? '~ ' : '') + fmtPoids(poidsColis) : '—';
    /* Absentes sur les commandes anterieures a la 040 : on retombe alors
       sur « tout a ete livre », ce qui etait vrai puisque le partiel
       n'existait pas. */
    const dernierColis: Record<string, number> | null = doc.last_shipment || null;
    const expedie: Record<string, number> | null = doc.shipped_qty || doc.last_shipment || null;
    /* Les quantités expédiées sont tenues PAR PRODUIT. Deux lignes d'un
       même produit (un remplacement de rupture en ajoute une) recevaient
       chacune le total : « Livré » comptait le colis deux fois et « Reste
       à livrer » tombait à zéro sur la seconde. On répartit dans l'ordre
       des lignes, comme l'écran de la commande. */
    const repartir = (parProduit: Record<string, number>) => {
      const dispo: Record<string, number> = { ...parProduit };
      return productLines.map(l => {
        if (!l.product_id) return 0;
        const pris = Math.min(Number(l.qty) || 1, Math.max(0, Number(dispo[l.product_id]) || 0));
        dispo[l.product_id] = (Number(dispo[l.product_id]) || 0) - pris;
        return pris;
      });
    };
    const partiTotal = expedie ? repartir(expedie) : null;
    const partiAvant = dernierColis && expedie
      ? repartir(Object.fromEntries(Object.entries(expedie).map(([pid, n]) => [pid, (Number(n) || 0) - (Number(dernierColis[pid]) || 0)])))
      : null;

    return wrap(<BonDeLivraison d={{
      number: `BL-${String(doc.order_number || '').replace(/^SD-/, '')}`,
      shippedAt: doc.updated_at || doc.created_at,
      orderNumber: doc.order_number,
      carrier: doc.logspher_carrier_name || (doc.mondial_relay_tracking ? 'Mondial Relay' : doc.delivery_mode === 'pickup' ? 'Retrait en magasin' : 'Colissimo'),
      tracking: doc.tracking_number || doc.mondial_relay_tracking || doc.logspher_tracking || '—',
      sender: { name: sellerName, lines: splitAddress(sellerAddr) },
      recipient: {
        name: doc.customer_name || '—',
        lines: [...splitAddress(doc.shipping_address || doc.customer_address), doc.customer_phone || ''].filter(Boolean),
      },
      /* Le bon decrit UN COLIS, pas un historique : « Livre » vaut ce que
         contient ce colis-ci, et « Reste a livrer » ce qui reste du apres
         lui. Les deux colonnes portaient jusqu'ici la meme valeur, si
         bien qu'une livraison partielle s'annoncait complete. */
      lines: productLines.map((l, i) => {
        const commande = Number(l.qty) || 1;
        const ceColis = partiTotal && partiAvant ? partiTotal[i] - partiAvant[i] : commande;
        const cumul = partiTotal ? partiTotal[i] : commande;
        return {
          ...lines[i],
          ordered: commande,
          shipped: ceColis,
          remaining: Math.max(0, commande - cumul),
        };
      }),
      parcels: '1 / 1',
      weight: poidsTexte,
      format: doc.parcel_format || 'Colis standard',
      ...legals,
    }} />);
  }

  /* ══════════ DEVIS ══════════ */
  if (type === 'devis') {
    const discount = Number(doc.discount) || 0;
    return wrap(<Devis d={{
      number: `DV-${String(doc.order_number || '').replace(/^SD-/, '')}`,
      date: doc.created_at,
      validUntil: qs?.get('validite') || undefined,
      seller, client, lines, subtotal,
      discount: discount || undefined,
      discountLabel: doc.promo_code ? `Remise · ${doc.promo_code}` : undefined,
      shipping,
      total: Number(doc.total) || subtotal,
      replyTo: baseMail,
      ...legals,
    }} />);
  }

  /* ══════════ BON DE RETOUR ══════════ */
  if (type === 'bon-de-retour') {
    const hist = Array.isArray(doc.refunds) ? doc.refunds : [];
    const refundedItems = hist.flatMap((r: any) => (r.items || []).map((it: any) => ({
      label: it.name, ref: it.product_id ? undefined : undefined, qty: it.qty,
      unit: it.price, amount: (Number(it.qty) || 1) * (Number(it.price) || 0),
      reason: r.reason || 'Retour client',
    })));
    const retLines = refundedItems.length ? refundedItems : lines.map(l => ({ ...l, reason: 'Retour client' }));
    const itemsTotal = retLines.reduce((s: number, l: any) => s + (l.amount || 0), 0);
    const before = new Date(doc.created_at); before.setDate(before.getDate() + 14);
    return wrap(<BonDeRetour d={{
      number: `RET-${String(doc.order_number || '').replace(/^SD-/, '')}`,
      requestedAt: new Date().toISOString(),
      orderNumber: doc.order_number,
      returnBefore: before.toISOString(),
      client,
      returnTo: {
        name: `${sellerName} — service retours`,
        lines: [...splitAddress(sellerAddr), 'Glissez ce bon dans le colis'],
      },
      lines: retLines,
      itemsTotal,
      refundTotal: Number(doc.refunded_amount) || itemsTotal,
      ...legals,
    }} />);
  }

  return <div style={{ padding: 40, fontFamily: 'Jost, sans-serif' }}>{traduire(TDO.typeInconnu, langue)}</div>;
}
