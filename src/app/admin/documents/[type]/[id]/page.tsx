'use client';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { adminFetch } from '@/lib/auth-client';
import { DOC_PRINT_CSS, DocLine, Party } from '@/components/documents/doc-kit';
import Facture, { FactureData } from '@/components/documents/Facture';
import Avoir, { AvoirData } from '@/components/documents/Avoir';
import BonDeCommande from '@/components/documents/BonDeCommande';
import BonDeLivraison from '@/components/documents/BonDeLivraison';
import Devis from '@/components/documents/Devis';
import BonDeRetour from '@/components/documents/BonDeRetour';

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
  const params = useParams<{ type: string; id: string }>();
  const qs = useSearchParams();
  const type = String(params?.type || '');
  const id = String(params?.id || '');
  const source = SOURCE[type];

  const [doc, setDoc] = useState<any>(null);
  const [cfg, setCfg] = useState<any>({});
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [error, setError] = useState('');

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
        /* Le poids du colis n'est stocke nulle part : on le reconstitue
           depuis le poids unitaire des articles du catalogue. */
        if (type === 'bon-de-livraison') {
          adminFetch('/api/products?limit=1000').then(r => r.json())
            .then(d => setCatalogue(d.products || [])).catch(() => {});
        }
      } catch (e: any) {
        setError(e?.message || 'Chargement impossible');
      }
    })();
  }, [id, type, source]);

  if (error) return <div style={{ padding: 40, fontFamily: 'Jost, sans-serif' }}>⚠️ {error}</div>;
  if (!doc) return <div style={{ padding: 40, fontFamily: 'Jost, sans-serif' }}>Chargement…</div>;

  /* ── Identité de l'émetteur ─────────────────────────── */
  const sellerName = doc.seller_name || cfg.site_name || 'Swedish Cravings';
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
  const baseMail = doc.seller_email || cfg.email || 'hej@swedishcravings.fr';
  const mail = mailbox ? baseMail.replace(/^[^@]+/, mailbox) : baseMail;
  const contactLine1 = [mail, doc.seller_phone || cfg.phone].filter(Boolean).join(' · ');
  const contactLine2 = String(cfg.front_url || 'https://www.swedishcravings.fr').replace(/^https?:\/\//, '');
  const legals = { legalLine1, legalLine2, contactLine1, contactLine2 };

  /* ── Lignes ─────────────────────────────────────────── */
  let raw: any[] = [];
  try { raw = typeof doc.lines === 'string' ? JSON.parse(doc.lines) : (doc.lines || []); } catch { raw = []; }
  const productLines = raw.filter(l => !isShippingLine(l));
  const shippingLine = raw.find(isShippingLine);
  const shipping = shippingLine
    ? (Number(shippingLine.qty) || 1) * (Number(shippingLine.price) || 0)
    : (source === 'order' ? Number(doc.shipping) || 0 : undefined);

  const lines: DocLine[] = productLines.map(l => {
    const qty = Number(l.qty) || 1;
    const unit = Number(l.price ?? l.unit_price) || 0;
    return {
      label: l.desc || l.name_fr || l.name || 'Article',
      desc: l.subdesc || undefined,
      ref: l.ref || l.sku || undefined,
      qty, unit, amount: qty * unit,
    };
  });
  const subtotal = lines.reduce((s, l) => s + (l.amount || 0), 0);

  const toolbar = (
    <div className="doc-toolbar">
      <button onClick={() => window.print()}>Imprimer / PDF</button>
      <a href={source === 'purchase' ? '/admin/achats' : source === 'invoice' ? '/admin/gestion' : '/admin/commandes'}>← Retour</a>
      <span style={{ flex: 1 }} />
      <span style={{ opacity: .6 }}>{TITLES[type]} {doc.number || doc.order_number}</span>
    </div>
  );
  const wrap = (node: React.ReactNode) => (
    <><style dangerouslySetInnerHTML={{ __html: DOC_PRINT_CSS }} />{toolbar}{node}</>
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
    const d: FactureData = {
      number: doc.number, date: doc.date, dueLabel: 'À réception',
      orderNumber: doc.order_number || undefined, paymentLabel: 'Carte bancaire',
      seller, client, lines, subtotal, shipping,
      shippingLabel: shippingLine?.desc || undefined,
      total: Number(doc.total_ttc) || 0,
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
      lines: lines.map(l => ({ ...l, ordered: l.qty, shipped: l.qty })),
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

  return <div style={{ padding: 40, fontFamily: 'Jost, sans-serif' }}>Type inconnu.</div>;
}
