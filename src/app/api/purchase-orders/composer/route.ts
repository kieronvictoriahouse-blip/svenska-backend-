import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { repartir, type Methode } from '@/lib/landed';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   ENVOI D'UNE COMMANDE COMPOSÉE

   L'écran de composition envoie ici son panier en CARTONS ; c'est le
   serveur qui recalcule les unités et les montants. Rien de ce qui
   engage de l'argent n'est repris tel quel du client.

   Volontairement, aucune réception prévisionnelle n'est créée : une
   réception applique le stock dès son écriture, elle ferait donc entrer
   la marchandise avant qu'elle arrive. Ce qui est en route se déduit
   des commandes ouvertes — c'est déjà ce que fait /api/purchase-planner.
   ═══════════════════════════════════════════════════════════════ */

type Ligne = {
  product_id: string; packs: number; pack_size: number;
  unit_cost_eur: number; unit_cost_sek: number | null;
};

/** Conversion identique à la saisie de ticket : la moms de 12 % est
 *  déduite AVANT la conversion, sinon le coût d'achat est surévalué. */
const sekVersEur = (sek: number, taux: number) => (sek / 1.12) * taux;

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();
  const supplierId: string = body.supplier_id;
  const entrantes: Ligne[] = Array.isArray(body.lignes) ? body.lignes : [];
  const taux = Number(body.rate) || 0.0876;

  if (!supplierId) return NextResponse.json({ error: 'Fournisseur manquant' }, { status: 400 });
  if (!entrantes.length) return NextResponse.json({ error: 'Commande vide' }, { status: 400 });

  const { data: fournisseur } = await supabaseAdmin.from('contacts')
    .select('id, company, first_name, last_name, email, lead_time_days')
    .eq('id', supplierId).maybeSingle();
  if (!fournisseur) return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 404 });

  const nomFournisseur = fournisseur.company
    || `${fournisseur.first_name || ''} ${fournisseur.last_name || ''}`.trim()
    || 'Fournisseur';

  /* On relit les produits : le nom et la référence gravés dans la
     commande doivent venir de la base, pas de l'écran. */
  const ids = Array.from(new Set(entrantes.map(l => l.product_id).filter(Boolean)));
  const { data: produits } = await supabaseAdmin.from('products')
    .select('id, name_fr, name_sv, sku, sort_order, pack_size, cost_price')
    .in('id', ids);
  const parId = Object.fromEntries((produits || []).map(p => [p.id, p]));

  let sousTotal = 0, totalSek = 0, unites = 0;
  const lignes = [];

  for (const l of entrantes) {
    const p = parId[l.product_id];
    if (!p) continue;
    const cartons = Math.max(0, Math.round(Number(l.packs) || 0));
    const parCarton = Math.max(1, Math.round(Number(l.pack_size) || Number(p.pack_size) || 1));
    const qty = cartons * parCarton;
    if (qty <= 0) continue;

    const sek = Number(l.unit_cost_sek) || 0;
    const puEuro = sek > 0
      ? sekVersEur(sek, taux)
      : (Number(l.unit_cost_eur) || Number(p.cost_price) || 0);
    const total = puEuro * qty;

    sousTotal += total;
    totalSek += sek * qty;
    unites += qty;

    lignes.push({
      product_id: p.id,
      sku: p.sku || (p.sort_order ? `SC-${String(p.sort_order).padStart(4, '0')}` : ''),
      name: p.name_fr,
      // Le magasin lit le suédois : le bon de commande s'appuie dessus.
      name_sv: p.name_sv || null,
      packs: cartons,
      pack_size: parCarton,
      qty,
      received_qty: 0,
      unit_cost: Number(puEuro.toFixed(4)),
      unit_cost_eur: Number(puEuro.toFixed(4)),
      unit_cost_sek: sek || null,
      total: Number(total.toFixed(2)),
    });
  }

  if (!lignes.length) return NextResponse.json({ error: 'Aucune ligne exploitable' }, { status: 400 });

  /* Le transport est un coût d'achat : on le reverse sur les articles
     pour connaître le vrai prix de revient. Mais `unit_cost` reste le
     prix marchandise — c'est lui qui est imprimé sur le bon envoyé au
     magasin, qui n'a rien à voir avec notre transporteur. */
  const port = Math.max(0, Number(body.shipping) || 0);
  const exclus: string[] = Array.isArray(body.shipping_exclus) ? body.shipping_exclus : [];
  const methode: Methode = body.shipping_method === 'prorata' ? 'prorata' : 'equal';

  if (port > 0) {
    const parts = repartir(
      lignes.map(l => ({
        key: l.product_id, qty: l.qty, unit_cost: l.unit_cost_eur,
        retenue: !exclus.includes(l.product_id),
      })),
      port, methode,
    );
    for (const l of lignes as any[]) {
      const part = parts[l.product_id];
      l.shipping_share = part?.total || 0;
      l.shipping_per_unit = part?.parUnite || 0;
      l.landed_unit_cost = part?.revient ?? l.unit_cost_eur;
      l.bears_shipping = !exclus.includes(l.product_id);
    }
  }

  /* Numérotation par le maximum existant, pas par le nombre de lignes :
     une commande annulée puis supprimée ferait sinon réémettre un numéro
     déjà utilisé. */
  const { data: dernieres } = await supabaseAdmin.from('purchase_orders')
    .select('number').like('number', 'ACH-%').order('number', { ascending: false }).limit(1);
  const precedent = Number(String(dernieres?.[0]?.number || '').replace(/\D/g, '')) || 0;
  const numero = `ACH-${String(precedent + 1).padStart(4, '0')}`;

  const delai = Math.max(1, Number(fournisseur.lead_time_days) || 7);
  const attendue = new Date(Date.now() + delai * 86400000).toISOString().slice(0, 10);

  const payload: Record<string, unknown> = {
    number: numero,
    status: 'confirmed',
    supplier_id: fournisseur.id,
    supplier_name: nomFournisseur,
    expected_date: attendue,
    lines: JSON.stringify(lignes),
    subtotal: Number(sousTotal.toFixed(2)),
    tax: 0,
    shipping: Number(port.toFixed(2)),
    total: Number((sousTotal + port).toFixed(2)),
    currency: 'EUR',
    updated_at: new Date().toISOString(),
  };
  // Colonnes de la migration 037 — absentes tant qu'elle n'est pas jouée.
  if (body.coverage_weeks) payload.coverage_weeks = Math.round(Number(body.coverage_weeks));
  payload.exchange_rate_used = taux;

  let { data: commande, error } = await supabaseAdmin
    .from('purchase_orders').insert(payload).select().single();

  /* Si la 037 n'est pas encore appliquée, la commande ne doit pas être
     perdue pour deux colonnes de confort. */
  if (error && /coverage_weeks|exchange_rate_used/.test(error.message || '')) {
    delete payload.coverage_weeks; delete payload.exchange_rate_used;
    ({ data: commande, error } = await supabaseAdmin
      .from('purchase_orders').insert(payload).select().single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from('contacts')
    .update({ last_order_at: new Date().toISOString() }).eq('id', fournisseur.id);

  /* Le prix payé chez ce magasin est ce qui alimentera la comparaison
     des enseignes à la prochaine commande. */
  for (const l of lignes) {
    const { data: connu } = await supabaseAdmin.from('product_suppliers')
      .select('times_bought').eq('product_id', l.product_id).eq('supplier_id', fournisseur.id).maybeSingle();
    await supabaseAdmin.from('product_suppliers').upsert({
      product_id: l.product_id,
      supplier_id: fournisseur.id,
      cost_eur: l.unit_cost_eur,
      cost_sek: l.unit_cost_sek,
      pack_size: l.pack_size,
      times_bought: (Number(connu?.times_bought) || 0) + 1,
      last_bought_at: new Date().toISOString(),
    }, { onConflict: 'product_id,supplier_id' });
  }

  const dateFr = new Date(attendue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  let message = `${numero} — ${lignes.length} référence(s), ${unites} unités, `
    + `${sousTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT`
    + (port > 0 ? ` + ${port.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € de transport reversés sur les articles` : '')
    + `. Attendue vers le ${dateFr}.`;

  /* L'envoi par mail n'a de sens que si le magasin en a une : plusieurs
     de ces enseignes sont des points de vente où l'on se rend. */
  let envoye = false;
  if (fournisseur.email) {
    try {
      const { generatePurchaseOrderPdf } = await import('@/lib/purchase-order-pdf');
      const { sendEmail, getWhiteLabelConfig } = await import('@/lib/email-send');
      const { buffer, filename } = await generatePurchaseOrderPdf(commande.id, 'sv');
      const cfg = await getWhiteLabelConfig();
      await sendEmail({
        from: (cfg.email_from as string) || 'Svenska Delikatessen <hej@swedishcravings.fr>',
        to: fournisseur.email,
        subject: `Inköpsorder ${numero}`,
        html: '<p>Vänligen se bifogad inköpsorder.</p><p>Med vänlig hälsning,<br>Svenska Delikatessen</p>',
        attachments: [{ filename, content: buffer }],
      }, cfg);
      await supabaseAdmin.from('purchase_orders')
        .update({ status: 'sent' }).eq('id', commande.id);
      envoye = true;
      message += ` Bon de commande envoyé à ${fournisseur.email}.`;
    } catch (e: any) {
      message += ` La commande est enregistrée, mais l’envoi du bon a échoué (${e.message}) — tu peux le renvoyer depuis sa fiche.`;
    }
  } else {
    message += ` Aucune adresse mail pour ce magasin : la commande est enregistrée, le bon est téléchargeable depuis sa fiche.`;
  }

  return NextResponse.json({ ok: true, id: commande.id, number: numero, envoye, message });
}
