import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabase';
import { resolveShipping, INTERNATIONAL_COUNTRIES } from '@/lib/shipping';
import { evaluatePromo } from '@/lib/promo';
import { effectiveUnitPrice, isDiscountActive, resolveDiscount } from '@/lib/product-price';
import crypto from 'crypto';

const CUSTOMER_SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.SNIPCART_SECRET_KEY || 'sd-customer-secret';

function verifyCustomerToken(token: string): string | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', CUSTOMER_SECRET).update(payload).digest('base64url');
    if (sig !== expected) return null;
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!email || Date.now() > exp) return null;
    return email as string;
  } catch { return null; }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const ADMIN_TEST_EMAILS = (process.env.ADMIN_TEST_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

/* ── Langue du client chez Stripe ─────────────────────────────────
   La page de paiement suivait toujours le français, libellés compris,
   quelle que soit la langue du panier. */
type Langue = 'fr' | 'en' | 'sv';

/** « 9,90 € » en français et en suédois, « €9.90 » en anglais. */
const eur = (n: number, l: Langue) =>
  l === 'en' ? `€${n.toFixed(2)}` : `${n.toFixed(2).replace('.', ',')} €`;

const LIBELLES = {
  retrait:       { fr: 'Retrait en magasin (Click & Collect)', en: 'In-store pickup (Click & Collect)', sv: 'Hämtning i butik (Click & Collect)' },
  relais:        { fr: 'Livraison en point relais', en: 'Delivery to a relay point', sv: 'Leverans till utlämningsställe' },
  relaisGratuit: { fr: 'Livraison gratuite en point relais', en: 'Free delivery to a relay point', sv: 'Fri frakt till utlämningsställe' },
  relaisIntl:    { fr: 'Livraison en point relais — International', en: 'Delivery to a relay point — International', sv: 'Leverans till utlämningsställe — internationellt' },
  gratuite:      { fr: 'Livraison gratuite', en: 'Free delivery', sv: 'Fri frakt' },
  standard:      { fr: 'Livraison standard', en: 'Standard delivery', sv: 'Standardleverans' },
};

/* Rappel sous le bouton « Payer » : où va la commande, et le cadeau
   glissé dans le colis — Stripe n'affiche ni l'un ni l'autre. Pas de
   phrase « on vous prévient quand c'est prêt » au retrait : aucun email
   de ce type n'existe aujourd'hui. */
const RAPPEL = {
  relais:   { fr: 'Livraison : ', en: 'Delivery to: ', sv: 'Leverans till: ' },
  retrait:  { fr: 'Retrait : ', en: 'Pickup at: ', sv: 'Hämtas i butiken: ' },
  cadeau:   { fr: 'Cadeau offert : ', en: 'Free gift: ', sv: 'Gåva: ' },
  cadeaux:  { fr: 'Cadeaux offerts : ', en: 'Free gifts: ', sv: 'Gåvor: ' },
};

/* Stripe n'affiche une image que par URL absolue en https. Celles du
   catalogue sont soit l'URL publique du stockage, soit un chemin du site
   (« /media/… », que la vitrine réécrit vers le stockage). */
function imageAbsolue(brut: unknown, vitrine: string): string | null {
  const s = String(brut || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s, vitrine + '/');
    return u.protocol === 'https:' && u.href.length <= 2048 ? u.href : null;
  } catch { return null; }
}

const uneLigne = (s: unknown, max = 300) =>
  String(s || '').replace(/\s*[\r\n]+\s*/g, ', ').replace(/\s{2,}/g, ' ').trim().slice(0, max);

/* Messages renvoyés au panier, qui affiche `error` tel quel quand il ne
   connaît pas le `code`. Le détail technique reste dans les logs : un
   acheteur n'a rien à faire d'un message d'API. */
const ERREURS = {
  serveur:  { fr: 'Le paiement n’a pas pu démarrer. Réessayez dans un instant.', en: 'Payment could not be started. Please try again in a moment.', sv: 'Betalningen kunde inte startas. Försök igen om en stund.' },
  commande: { fr: 'Votre commande n’a pas pu être enregistrée. Réessayez dans un instant.', en: 'Your order could not be saved. Please try again in a moment.', sv: 'Din beställning kunde inte sparas. Försök igen om en stund.' },
  quantite: { fr: 'Une quantité du panier est invalide.', en: 'A quantity in your basket is invalid.', sv: 'Ett antal i varukorgen är ogiltigt.' },
  relais:   { fr: 'Choisissez un point relais pour finaliser la commande.', en: 'Please choose a relay point to complete your order.', sv: 'Välj ett utlämningsställe för att slutföra beställningen.' },
};

/* Numéro de commande : count + 1, colonne UNIQUE. Une seule commande
   supprimée suffit à faire retomber le compte sur un numéro déjà pris.
   Aux essais suivants, on repart du plus grand numéro récent, un cran
   plus loin à chaque fois au cas où un paiement concurrent vient de le
   prendre. */
async function numeroCommande(essai: number): Promise<string> {
  const { count } = await supabaseAdmin.from('orders').select('id', { count: 'exact', head: true });
  let n = (count || 0) + 1;
  if (essai > 0) {
    const { data } = await supabaseAdmin
      .from('orders').select('order_number').order('created_at', { ascending: false }).limit(50);
    const nums = (data || [])
      .map((o: any) => parseInt(String(o.order_number || '').replace(/^\D+/, ''), 10))
      .filter(Number.isFinite);
    n = Math.max(n, Math.max(0, ...nums) + 1) + (essai - 1);
  }
  return `SD-${String(n).padStart(4, '0')}`;
}

export async function POST(req: NextRequest) {
  // Langue des messages d'erreur : connue dès le corps lu, français sinon.
  let langue: Langue = 'fr';
  try {
    const body = await req.json();
    const { items, customer_token, delivery_mode, promo_code, customer_note, relay_point_id, relay_point_name, relay_point_address, relay_point_pays, relay_carrier_uuid } = body;
    let { customer_email } = body;
    /* Email demandé dans le panier (relance des paniers abandonnés) :
       une adresse mal formée est refusée ici plutôt que de partir chez
       Stripe puis de rater chaque relance. */
    if (typeof customer_email === 'string') customer_email = customer_email.trim().toLowerCase() || undefined;
    if (customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(customer_email)) {
      return NextResponse.json({ error: 'Adresse email invalide', code: 'BAD_EMAIL' }, { status: 400, headers: CORS });
    }
    const langClient = ['fr', 'en', 'sv'].includes(body.lang) ? body.lang : null;
    langue = langClient || 'fr';
    const isPickup = delivery_mode === 'pickup';
    const isMondialRelay = delivery_mode === 'mondial_relay';

    const isTestMode = !!customer_email && ADMIN_TEST_EMAILS.includes(customer_email.toLowerCase());
    const stripeKey = isTestMode
      ? (process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY)
      : process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      console.error('[checkout] clé Stripe absente');
      return NextResponse.json({ error: ERREURS.serveur[langue], code: 'SERVER_ERROR' }, { status: 500, headers: CORS });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' });

    // Verify customer token and load profile for name + address
    let customerName = '';
    let customerAddress = '';
    const tokenEmail = customer_token ? verifyCustomerToken(customer_token) : null;
    if (tokenEmail) {
      customer_email = customer_email || tokenEmail;
      const { data: profile } = await supabaseAdmin
        .from('customer_profiles').select('name,address1,city,postal_code,country')
        .eq('email', tokenEmail).maybeSingle();
      if (profile) {
        customerName = profile.name || '';
        if (profile.address1) {
          customerAddress = [profile.address1, profile.city, profile.postal_code, profile.country || 'FR']
            .filter(Boolean).join(', ');
        }
      }
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Panier vide' }, { status: 400, headers: CORS });
    }
    /* Quantité entière et positive : une quantité négative faisait baisser
       le sous-total, et toute valeur exotique finissait en erreur Stripe
       après la création du brouillon. */
    for (const it of items) {
      if (!it || typeof it !== 'object') {
        return NextResponse.json({ error: ERREURS.quantite[langue], code: 'BAD_QUANTITY' }, { status: 400, headers: CORS });
      }
      if (it.gift) continue;
      const q = Number(it.quantity);
      if (!Number.isInteger(q) || q < 1 || q > 999) {
        return NextResponse.json({ error: ERREURS.quantite[langue], code: 'BAD_QUANTITY' }, { status: 400, headers: CORS });
      }
      it.quantity = q;
    }
    /* Un colis en point relais sans point relais ne peut pas partir : le
       panier l'empêche, le serveur le refuse aussi. */
    if (isMondialRelay && !relay_point_id) {
      return NextResponse.json({ error: ERREURS.relais[langue], code: 'RELAY_POINT_REQUIRED' }, { status: 400, headers: CORS });
    }

    /* Normalisée et validée AVANT Stripe : le 28/08, une valeur d'env
       malformée a bloqué un client carte en main — « Not a valid URL »
       est un message pour développeur, pas pour un acheteur. Lue dès ici :
       les images des articles en dépendent. */
    const { urlVitrine } = await import('@/lib/urls-instance');
    const baseUrl = await urlVitrine();

    const lineItems: any[] = [];
    // Cadeaux du colis, dans les trois langues, pour le rappel chez Stripe.
    const cadeaux: Array<Record<Langue, string>> = [];
    const orderLines: Array<{ product_id: string; name: string; name_en?: string; name_sv?: string; qty: number; price: number; image_url?: string }> = [];
    let subtotal = 0;
    /* Part du panier hors articles déjà en promotion : c'est la seule
       sur laquelle portent le code fidélité et le code ami. */
    let baseRemisable = 0;
    let hasPickupOnly = false;
    const stockErrors: Array<{ name: string; available: number; requested: number }> = [];

    /* Calculé une fois pour tout le panier : le réservé se déduit des
       commandes, il ne dépend pas de la ligne qu'on examine. */
    const { quantitesReservees } = await import('@/lib/reserve');
    const { chargerLots } = await import('@/lib/lots');
    const [reserve, lots] = await Promise.all([quantitesReservees(), chargerLots()]);
    const giftClaims: Array<{ id: string }> = [];
    /* Box (migration 054) : ce sont leurs sachets qui sont en rayon. On
       cumule ici la demande du panier par sachet — box ET achats à
       l'unité — pour la confronter au disponible après la boucle. Une
       box et le même sachet à l'unité se disputent la même étagère. */
    const demandeSachets: Record<string, number> = {};
    const boxDuPanier: Array<{ id: string; name: string; qty: number }> = [];

    for (const item of items) {
      // Les cadeaux (offerts) sont mis de côté : validés + ajoutés à 0 € après le sous-total.
      if (item && item.gift) { giftClaims.push({ id: item.id }); continue; }
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id);
      const sortOrder = isUUID ? NaN : parseInt(item.id);
      let q = supabaseAdmin.from('products').select('*, product_variants(*), categories(discount_type, discount_value, discount_start, discount_end)').eq('is_active', true);
      q = isUUID ? q.eq('id', item.id) : q.eq('sort_order', sortOrder);
      const { data: product } = await q.maybeSingle();
      if (!product) continue;
      if (product.pickup_only) hasPickupOnly = true;

      /* Contrôle de stock côté serveur (l'UI peut être contournée).
         On compare au DISPONIBLE — stock physique moins ce qui est déjà
         dû à des commandes payées non expédiées. Comparer au stock brut
         laisserait vendre deux fois la même boîte : elle est encore en
         rayon, mais elle appartient déjà à quelqu'un. */
      const compoBox = lots[product.id];
      if (compoBox) {
        for (const it of compoBox) {
          demandeSachets[it.product_id] = (demandeSachets[it.product_id] || 0) + it.qty * item.quantity;
        }
        boxDuPanier.push({ id: product.id, name: product.name_fr || product.id, qty: item.quantity });
      } else {
        demandeSachets[product.id] = (demandeSachets[product.id] || 0) + item.quantity;
      }

      if (!compoBox && product.track_stock === true && typeof product.stock === 'number') {
        const dispo = product.stock - (reserve[product.id] || 0);
        if (dispo <= 0 || item.quantity > dispo) {
          stockErrors.push({
            name: product.name_fr || product.id,
            available: Math.max(0, dispo),
            requested: item.quantity,
          });
        }
      }

      const variant = item.variant
        ? (product.product_variants || []).find((v: { label: string }) => v.label === item.variant)
        : null;
      /* Remise par article (migration 049) : appliquée ici, côté serveur,
         sur le prix de base (produit ou variante). C'est CE prix qui part
         chez Stripe — l'affichage front n'est qu'un miroir, jamais cru. */
      const basePrice = variant ? variant.price : product.price;
      // Remise produit prioritaire, sinon remise de la catégorie (migration 052).
      const remise    = resolveDiscount(product, product.categories);
      const price     = effectiveUnitPrice(basePrice, remise);
      const suffix   = item.variant ? ` — ${item.variant}` : '';
      const name     = (product.name_fr || '') + suffix;
      const name_en  = (product.name_en || product.name_fr || '') + suffix;
      const name_sv  = (product.name_sv || product.name_fr || '') + suffix;

      subtotal += price * item.quantity;
      if (!isDiscountActive(remise)) baseRemisable += price * item.quantity;

      orderLines.push({ product_id: product.id, name, name_en, name_sv, qty: item.quantity, price, ...(product.image_url ? { image_url: product.image_url } : {}) });

      const image = imageAbsolue(product.image_url, baseUrl);
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: {
            name: langue === 'en' ? name_en : langue === 'sv' ? name_sv : name,
            ...(image ? { images: [image] } : {}),
          },
          unit_amount: Math.round(price * 100),
        },
        quantity: item.quantity,
      });
    }

    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'Produits introuvables' }, { status: 400, headers: CORS });
    }

    // Stock insuffisant → on refuse la commande AVANT tout paiement.
    /* Box : chaque sachet doit couvrir TOUTE la demande du panier. Si un
       sachet manque, c'est la box qui est refusée (le client ne voit pas
       ses composants), avec le nombre de box encore possibles. */
    if (boxDuPanier.length) {
      const ids = Object.keys(demandeSachets);
      const { data: sachets } = await supabaseAdmin
        .from('products').select('id, name_fr, stock, track_stock').in('id', ids);
      const parId = Object.fromEntries((sachets || []).map((p: any) => [p.id, p]));
      const dispoSachet = (id: string): number | null => {
        const p = parId[id];
        if (!p || p.track_stock !== true || typeof p.stock !== 'number') return null;
        return p.stock - (reserve[id] || 0);
      };
      for (const b of boxDuPanier) {
        let possibles: number | null = null;
        for (const it of lots[b.id]) {
          const d = dispoSachet(it.product_id);
          if (d === null) continue;
          /* Ce que le reste du panier prend déjà sur ce sachet. */
          const autres = (demandeSachets[it.product_id] || 0) - it.qty * b.qty;
          const p = Math.floor(Math.max(0, d - autres) / it.qty);
          possibles = possibles === null ? p : Math.min(possibles, p);
        }
        if (possibles !== null && b.qty > possibles) {
          stockErrors.push({ name: b.name, available: possibles, requested: b.qty });
        }
      }
    }

    if (stockErrors.length > 0) {
      return NextResponse.json(
        { error: 'Stock insuffisant pour un ou plusieurs articles.', code: 'OUT_OF_STOCK', items: stockErrors },
        { status: 409, headers: CORS },
      );
    }

    // ── Cadeau offert : validé 100% côté serveur (impossible de forcer un produit gratuit) ──
    // On n'ajoute le cadeau à 0 € que si : offre gift active + valide, sous-total (hors cadeau)
    // ≥ seuil, et le produit demandé fait bien partie des cadeaux éligibles.
    if (giftClaims.length > 0) {
      try {
        const now = new Date();
        const { data: gifts } = await supabaseAdmin
          .from('promo_codes').select('*').eq('type', 'gift').eq('is_active', true)
          .order('created_at', { ascending: false });
        const offer = (gifts || []).find((p: any) => {
          const dateOk = (!p.valid_from || now >= new Date(p.valid_from)) &&
            (!p.valid_until || now <= new Date(String(p.valid_until).slice(0, 10) + 'T23:59:59'));
          return dateOk && (!p.max_uses || (p.used_count || 0) < p.max_uses);
        });
        /* Combien de cadeaux le panier merite REELLEMENT — calcule ici,
           jamais depuis le panier. « 2 Piffi achetes, 1 dip offert »
           peut en accorder plusieurs ; l'ancien code n'en donnait qu'un
           quoi qu'il arrive. */
        const { cadeauxDus, listeIds } = await import('@/lib/cadeau');
        const dus = cadeauxDus(offer, items, subtotal);

        if (offer && dus > 0) {
          const ids = listeIds((offer as any).gift_product_ids);
          /* On sert les cadeaux demandes, dans l'ordre, jusqu'a
             concurrence de ce qui est du. Un client qui en reclame trois
             pour deux merites en recoit deux. */
          const retenus = giftClaims.filter(g => ids.includes(g.id)).slice(0, dus);

          for (const claim of retenus) {
            const { data: gp } = await supabaseAdmin
              .from('products')
              .select('id, name_fr, name_en, name_sv, image_url, is_active, track_stock, stock')
              .eq('id', claim.id).eq('is_active', true).maybeSingle();
            /* Un cadeau en rupture n'est pas un cadeau : on l'omet
               plutot que de promettre ce qu'on ne peut pas mettre dans
               le carton. Le disponible tient compte du reserve. */
            const dispo = gp ? (Number(gp.stock) || 0) - (reserve[gp.id] || 0) : 0;
            const servable = gp && !(gp.track_stock === true && dispo <= 0);
            if (gp && servable) {
              orderLines.push({
                product_id: gp.id,
                name: (gp.name_fr || 'Cadeau') + ' (offert)',
                name_en: (gp.name_en || gp.name_fr || 'Gift') + ' (free gift)',
                name_sv: (gp.name_sv || gp.name_fr || 'Gåva') + ' (gåva)',
                qty: 1, price: 0,
                ...(gp.image_url ? { image_url: gp.image_url } : {}),
              });
              cadeaux.push({ fr: gp.name_fr || '', en: gp.name_en || gp.name_fr || '', sv: gp.name_sv || gp.name_fr || '' });
            }
          }
        }
      } catch (giftErr) {
        console.warn('[checkout] gift error (non-fatal):', giftErr);
      }
    }

    /* Cadeau de relance : le client arrive d'un email de relance dont
       l'offre de la semaine était un produit offert. Le jeton du brouillon
       d'origine fait foi — sans lui, rien n'est ajouté. */
    if (body.reprise) {
      try {
        const { cadeauDeReprise } = await import('@/lib/relance-panier');
        const c = await cadeauDeReprise(body.reprise);
        if (c && !orderLines.some(l => l.product_id === c.id && l.price === 0)) {
          orderLines.push({
            product_id: c.id,
            name: (c.name_fr || 'Cadeau') + ' (offert)',
            name_en: (c.name_en || c.name_fr || 'Gift') + ' (free gift)',
            name_sv: (c.name_sv || c.name_fr || 'Gåva') + ' (gåva)',
            qty: 1, price: 0,
            ...(c.image_url ? { image_url: c.image_url } : {}),
          });
          cadeaux.push({ fr: c.name_fr || '', en: c.name_en || c.name_fr || '', sv: c.name_sv || c.name_fr || '' });
        }
      } catch (e) { console.warn('[checkout] cadeau de relance (non bloquant):', e); }
    }

    // Verrou : un produit "retrait uniquement" (frais, fragile…) impose le click & collect
    // pour toute la commande. On refuse tout autre mode côté serveur (l'UI peut être contournée).
    if (hasPickupOnly && !isPickup) {
      return NextResponse.json(
        { error: 'Votre panier contient un produit disponible en retrait en magasin uniquement (click & collect). Sélectionnez ce mode de livraison pour finaliser la commande.', code: 'PICKUP_ONLY' },
        { status: 400, headers: CORS },
      );
    }

    console.log('[checkout] lineItems:', JSON.stringify(lineItems), 'subtotal:', subtotal);

    if (subtotal <= 0) {
      return NextResponse.json({ error: 'Subtotal invalide (prix produit à 0 ou manquant en base)', subtotal }, { status: 400, headers: CORS });
    }

    // Promo code validation
    let discountAmount = 0;
    let stripeCouponId: string | null = null;
    let promoCodeId: string | null = null;
    let isFreeShippingPromo = false;

    if (promo_code && typeof promo_code === 'string') {
      try {
        const { data: promo } = await supabaseAdmin
          .from('promo_codes')
          .select('*')
          .eq('code', promo_code.toUpperCase().trim())
          .eq('is_active', true)
          .maybeSingle();

        if (promo?.kind) {
          /* Code fidélité ou code ami (@/lib/fidelite). Refusé, on le dit
             au panier plutôt que de laisser le client payer plein tarif
             sans le savoir — il comptait dessus. */
          const { evaluerCodePerso } = await import('@/lib/fidelite');
          const verdict = await evaluerCodePerso(promo, { email: customer_email, base: baseRemisable });
          if (!verdict.ok) {
            return NextResponse.json(
              { error: 'Ce code ne peut pas être utilisé pour cette commande.', code: 'PROMO_REFUSED', reason: verdict.reason },
              { status: 400, headers: CORS },
            );
          }
          /* Montant fixe et non pourcentage Stripe : un pourcentage
             porterait aussi sur les articles déjà en promotion. */
          promoCodeId = promo.id;
          const coupon = await stripe.coupons.create({ amount_off: Math.round(verdict.discount * 100), currency: 'eur', duration: 'once' });
          stripeCouponId = coupon.id;
          discountAmount = verdict.discount;
        } else if (promo) {
          // Vérifie l'usage client avant d'évaluer (une seule requête, si utile)
          let alreadyUsedByCustomer = false;
          if (promo.single_use_per_customer && customer_email) {
            const { data: existingUsage } = await supabaseAdmin
              .from('promo_code_usages')
              .select('id')
              .eq('promo_code_id', promo.id)
              .eq('customer_email', customer_email.toLowerCase())
              .maybeSingle();
            alreadyUsedByCustomer = !!existingUsage;
          }

          // Mêmes règles que /api/promo/validate — cf. @/lib/promo
          const verdict = evaluatePromo(promo, { subtotal, alreadyUsedByCustomer });
          if (verdict.ok) {
            promoCodeId = promo.id;
            if (promo.type === 'percent') {
              const coupon = await stripe.coupons.create({ percent_off: promo.value, duration: 'once' });
              stripeCouponId = coupon.id;
              discountAmount = (subtotal * promo.value) / 100;
            } else if (promo.type === 'fixed') {
              const discAmt = Math.min(subtotal, promo.value);
              const coupon = await stripe.coupons.create({ amount_off: Math.round(discAmt * 100), currency: 'eur', duration: 'once' });
              stripeCouponId = coupon.id;
              discountAmount = discAmt;
            } else if (promo.type === 'free_shipping') {
              isFreeShippingPromo = true;
            }
          }
        }
      } catch (promoErr) {
        console.warn('[checkout] promo code error (non-fatal):', promoErr);
      }
    }

    const relayCountry = (relay_point_pays || 'FR').toUpperCase();
    const isInternational = isMondialRelay && INTERNATIONAL_COUNTRIES.includes(relayCountry);
    /* Un pays hors barème (ex. Suisse, encore proposée par l'ancien panier)
       partait au tarif France. On refuse plutôt que de vendre à perte. */
    if (isMondialRelay && relayCountry !== 'FR' && !isInternational) {
      return NextResponse.json(
        { error: 'Nous ne livrons pas encore ce pays en point relais.', code: 'COUNTRY_NOT_SERVED' },
        { status: 400, headers: CORS },
      );
    }

    // Barème + opération « livraison offerte » : le serveur fait autorité,
    // le front n'affiche qu'une estimation.
    const { data: shipCfg } = await supabaseAdmin
      .from('white_label_config').select('*').limit(1).maybeSingle();
    const shipRules = resolveShipping(shipCfg, { isInternational });

    const freeShipping = subtotal >= shipRules.threshold || isFreeShippingPromo;
    const shippingCost = isPickup ? 0 : (freeShipping ? 0 : shipRules.cost);
    const grandTotal = Math.max(0, subtotal - discountAmount) + shippingCost;
    if (grandTotal < 0.50) {
      return NextResponse.json({ error: `Total minimum de commande non atteint (${grandTotal.toFixed(2)} € < 0.50 €)` }, { status: 400, headers: CORS });
    }

    // Créer la commande en statut pending AVANT Stripe
    const brouillon = {
      status:           'pending',
      customer_email:   customer_email || null,
      // Jeton du lien « reprendre mon panier » envoyé par la relance.
      ...(customer_email ? { recovery_token: (await import('@/lib/relance-panier')).jetonRelance() } : {}),
      ...(langClient ? { lang: langClient } : {}),
      customer_name:    customerName || null,
      // For pickup, Stripe won't collect address — store profile address now
      ...(isPickup && customerAddress ? { shipping_address: customerAddress } : {}),
      subtotal,
      shipping:         shippingCost,
      discount:         discountAmount > 0 ? Math.round(discountAmount * 100) / 100 : 0,
      total:            grandTotal,
      lines:            orderLines,
      delivery_mode:    isPickup ? 'pickup' : isMondialRelay ? 'mondial_relay' : 'delivery',
      /* Le transporteur du point relais choisi : c'est lui qui doit
         produire l'etiquette. Sans cette valeur, tout partait en
         Mondial Relay, y compris un point Shop2Shop. */
      relay_carrier_uuid: relay_carrier_uuid || null,
      ...(isTestMode ? { is_test: true } : {}),
      ...(isMondialRelay && relay_point_id ? {
        relay_point_id,
        relay_point_name: relay_point_name || null,
        relay_point_address: relay_point_address || null,
        relay_point_pays: relay_point_pays || 'FR',
      } : {}),
      ...(promo_code && discountAmount > 0 ? { promo_code: promo_code.toUpperCase().trim() } : {}),
      ...(promo_code && isFreeShippingPromo ? { promo_code: promo_code.toUpperCase().trim() } : {}),
      ...(customer_note ? { notes: String(customer_note).slice(0, 1000) } : {}),
    };

    /* L'insertion n'était pas vérifiée : sur un numéro déjà pris, la
       session Stripe partait sans commande rattachée (metadata vide) et le
       paiement atterrissait hors du circuit normal. On retente sur un
       doublon de numéro ; sinon, on s'arrête ici, AVANT tout paiement. */
    let draftOrder: { id: string; order_number: string } | null = null;
    for (let essai = 0; essai < 3 && !draftOrder; essai++) {
      const { data, error } = await supabaseAdmin
        .from('orders')
        .insert({ ...brouillon, order_number: await numeroCommande(essai) })
        .select('id, order_number')
        .single();
      if (!error && data) { draftOrder = data; break; }
      console.error('[checkout] brouillon non créé', JSON.stringify({ essai, code: error?.code, message: error?.message }));
      if (error?.code !== '23505') break; // autre chose qu'un numéro en double : inutile d'insister
    }
    if (!draftOrder) {
      return NextResponse.json({ error: ERREURS.commande[langue], code: 'ORDER_CREATE_FAILED' }, { status: 500, headers: CORS });
    }

    const orderId = draftOrder.id;
    const successUrl = `${baseUrl}/success.html?order_id=${orderId}`;
    const cancelUrl  = `${baseUrl}/panier.html`;
    console.log('[checkout] successUrl:', successUrl, 'orderId:', orderId);

    const rappel: string[] = [];
    if (isMondialRelay && relay_point_name) {
      rappel.push(RAPPEL.relais[langue] + [uneLigne(relay_point_name, 120), uneLigne(relay_point_address)].filter(Boolean).join(', '));
    } else if (isPickup && uneLigne(shipCfg?.address)) {
      rappel.push(RAPPEL.retrait[langue] + uneLigne(shipCfg?.address));
    }
    const nomsCadeaux = cadeaux.map(c => c[langue]).filter(Boolean);
    if (nomsCadeaux.length) {
      rappel.push((nomsCadeaux.length > 1 ? RAPPEL.cadeaux : RAPPEL.cadeau)[langue] + nomsCadeaux.join(', '));
    }
    const messageValidation = rappel.join(' · ').slice(0, 1200);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: customer_email || undefined,
      locale: langue,
      /* Téléphone : seulement quand un colis part — le transporteur s'en
         sert (étiquette, SMS d'arrivée au relais). En Click & Collect, ce
         n'était qu'un champ de plus avant de pouvoir payer. */
      phone_number_collection: { enabled: !isPickup },
      // Adresse de facturation exigée par la facture Factur-X (EN 16931).
      billing_address_collection: 'required',
      ...(messageValidation ? { custom_text: { submit: { message: messageValidation } } } : {}),
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      /* Livraison à domicile (plus proposée par le panier, gardée pour les
         anciens liens) : le pays n'est connu que chez Stripe, après le
         calcul du port — on la limite donc à la France, seul tarif appliqué
         ici. L'ancienne liste laissait partir la Suisse ou le Royaume-Uni
         à 4,90 €. */
      ...(isPickup || isMondialRelay ? {} : {
        shipping_address_collection: { allowed_countries: ['FR', 'MC'] },
      }),
      shipping_options: [
        isPickup
          ? {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: { amount: 0, currency: 'eur' },
                display_name: LIBELLES.retrait[langue],
              },
            }
          : isMondialRelay
          ? {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: { amount: freeShipping ? 0 : Math.round(shipRules.cost * 100), currency: 'eur' },
                display_name: freeShipping
                  ? LIBELLES.relaisGratuit[langue]
                  : isInternational
                  ? `${LIBELLES.relaisIntl[langue]} (${eur(shipRules.cost, langue)})`
                  : LIBELLES.relais[langue],
              },
            }
          : freeShipping
          ? {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: { amount: 0, currency: 'eur' },
                display_name: LIBELLES.gratuite[langue],
              },
            }
          : {
              shipping_rate_data: {
                type: 'fixed_amount',
                // Même barème que le panier (lib/shipping) — plus de 4,90 € en dur.
                fixed_amount: { amount: Math.round(shipRules.cost * 100), currency: 'eur' },
                display_name: LIBELLES.standard[langue],
              },
            },
      ],
      metadata: { order_id: orderId },
      /* 3 h au lieu de 24 : l'expiration déclenche la 1re relance
         (webhook checkout.session.expired). Un client qui revient après
         repasse par le panier, qui recrée une session. */
      expires_at: Math.floor(Date.now() / 1000) + 3 * 3600,
      success_url: successUrl,
      cancel_url:  cancelUrl,
    });

    // Increment promo usage counter + track per-user usage
    if (promoCodeId) {
      try {
        const { data: p } = await supabaseAdmin.from('promo_codes').select('used_count, single_use_per_customer').eq('id', promoCodeId).single();
        await supabaseAdmin.from('promo_codes').update({ used_count: (p?.used_count || 0) + 1 }).eq('id', promoCodeId);
        if (p?.single_use_per_customer && customer_email) {
          await supabaseAdmin.from('promo_code_usages').upsert(
            { promo_code_id: promoCodeId, customer_email: customer_email.toLowerCase() },
            { onConflict: 'promo_code_id,customer_email', ignoreDuplicates: true }
          );
        }
      } catch (e) {
        /* Non bloquant : la session de paiement est creee, refuser ici
           empecherait la vente. Mais l'usage unique du code ne sera pas
           enregistre, donc le code restera reutilisable — il faut le
           savoir. */
        console.error('[checkout] usage du code promo non enregistre', e);
      }
    }

    return NextResponse.json({ url: session.url }, { headers: CORS });
  } catch (e: unknown) {
    /* Le détail (message Stripe ou base, paramètre fautif) ne part que
       dans les logs ; le client reçoit un message dans sa langue. */
    const err = e as any;
    const msg   = err?.message || 'Unknown error';
    const type  = err?.type  || err?.name  || '';
    const param = err?.param || '';
    const code  = err?.code  || err?.statusCode || '';
    console.error('[checkout]', JSON.stringify({ msg, type, param, code }));
    return NextResponse.json({ error: ERREURS.serveur[langue], code: 'SERVER_ERROR' }, { status: 500, headers: CORS });
  }
}
