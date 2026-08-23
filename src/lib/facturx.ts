import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   FACTUR-X — le XML structuré de la facture (CII, profil EN 16931)

   La réforme française de la facturation électronique repose sur des
   formats structurés du socle EN 16931 : Factur-X (PDF + XML CII),
   UBL, ou CII seul. Ce module produit le XML CII ; invoice-pdf
   l'embarque dans le PDF sous le nom réservé `factur-x.xml`, ce qui
   fait du PDF un Factur-X — lisible par un humain ET par la machine
   de la plateforme de dématérialisation.

   Choix posés, à connaître :

   · Profil EN 16931. Le profil MINIMUM serait suffisant pour du B2C,
     mais il ne porte pas les lignes — or les lignes existent déjà, et
     un profil complet évite une seconde passe en 2027.

   · TVA : catégorie E (exonéré), motif VATEX-FR-FRANCHISE. C'est la
     traduction normalisée de « TVA non applicable, art. 293 B du
     CGI » pour une micro-entreprise en franchise en base.

   · Le SIREN part dans les identifiants du vendeur (schemeID 0002 =
     registre SIRENE). Sans lui, aucune plateforme n'acceptera la
     pièce : c'est la clé de l'annuaire.
   ═══════════════════════════════════════════════════════════════ */

const SIREN_FALLBACK = '105003537';

const esc = (s: any) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const n2 = (v: any) => (Number(v) || 0).toFixed(2);

/** AAAAMMJJ, le seul format de date du CII (code 102). */
const dateCII = (d: any) => String(d || '').slice(0, 10).replace(/-/g, '');

/** SIREN à 9 chiffres depuis un SIRET ou un SIREN déjà nu. */
const sirenDe = (v: any) => String(v || '').replace(/\D/g, '').slice(0, 9) || SIREN_FALLBACK;

export type FacturXResult = { xml: string; filename: string };

/**
 * Construit le XML CII d'une facture existante.
 * `inv` est la ligne de la table `invoices`, lignes déjà parsées ou non.
 */
export function construireFacturX(inv: any): FacturXResult {
  const lignes: any[] = (() => {
    try {
      const l = typeof inv.lines === 'string' ? JSON.parse(inv.lines) : (inv.lines || []);
      return Array.isArray(l) ? l : [];
    } catch { return []; }
  })();

  const estAvoir = inv.status === 'avoir' || Number(inv.total_ttc) < 0;
  /* 380 = facture commerciale, 381 = avoir. Le montant d'un avoir
     s'exprime en positif, le code de type porte le sens. */
  const typeCode = estAvoir ? 381 : 380;
  const abs = (v: any) => Math.abs(Number(v) || 0).toFixed(2);

  const lignesXml = lignes.map((l, i) => {
    const qte = Number(l.qty) || 1;
    const pu = Math.abs(Number(l.price) || 0);
    const totalLigne = (qte * pu).toFixed(2);
    return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${esc(l.desc || l.name || 'Article')}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${pu.toFixed(2)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${qte}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>E</ram:CategoryCode>
          <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${totalLigne}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
  }).join('');

  const totalHt = abs(inv.total_ht);
  const totalTtc = abs(inv.total_ttc);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.number)}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${dateCII(inv.date)}</udt:DateTimeString>
    </ram:IssueDateTime>
    <ram:IncludedNote>
      <ram:Content>${esc(inv.legal_mention || 'TVA non applicable, art. 293 B du CGI')}</ram:Content>
    </ram:IncludedNote>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lignesXml}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:ID schemeID="0002">${sirenDe(inv.seller_siret)}</ram:ID>
        <ram:Name>${esc(inv.seller_name || '')}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${sirenDe(inv.seller_siret)}</ram:ID>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:LineOne>${esc(inv.seller_address || '')}</ram:LineOne>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${inv.seller_email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(inv.seller_email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(inv.client_name || 'Client')}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:LineOne>${esc(inv.client_address || '')}</ram:LineOne>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        ${inv.client_email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(inv.client_email)}</ram:URIID></ram:URIUniversalCommunication>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>0.00</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:ExemptionReason>TVA non applicable, art. 293 B du CGI</ram:ExemptionReason>
        <ram:BasisAmount>${totalHt}</ram:BasisAmount>
        <ram:CategoryCode>E</ram:CategoryCode>
        <ram:ExemptionReasonCode>VATEX-FR-FRANCHISE</ram:ExemptionReasonCode>
        <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${totalHt}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${totalHt}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${totalTtc}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${inv.status === 'paid' ? '0.00' : totalTtc}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

  return { xml, filename: 'factur-x.xml' };
}

/** Charge la facture et construit son XML — utilisé par la route et le PDF. */
export async function facturXDe(invoiceId: string): Promise<FacturXResult | null> {
  const { data: inv } = await supabaseAdmin
    .from('invoices').select('*').eq('id', invoiceId).maybeSingle();
  if (!inv) return null;
  return construireFacturX(inv);
}
