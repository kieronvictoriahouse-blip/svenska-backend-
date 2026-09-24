import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { renderEmail } from '@/lib/email-templates';
import { sendEmail, getWhiteLabelConfig } from '@/lib/email-send';
import { langueDeCommande, LangueClient } from '@/lib/langue-client';
import { formatEuro } from '@/lib/emails-i18n';
import { urlVitrine, urlAdmin } from '@/lib/urls-instance';

/* ═══════════════════════════════════════════════════════════════
   RELANCE DES PANIERS ABANDONNÉS

   Le panier demande l'email avant Stripe ; la commande brouillon le
   garde. Si le paiement n'aboutit pas :
     · relance 1 — à l'expiration de la session Stripe (≈ 3 h), via le
       webhook `checkout.session.expired` ; le cron quotidien rattrape
       celles que le webhook aurait manquées ;
     · relance 2 — le lendemain matin, par le cron quotidien.

   Jamais plus de deux emails par panier, et aucun si :
     · l'adresse s'est désinscrite ;
     · le client a commandé depuis (il a payé autrement, ou plus tard) ;
     · un panier plus récent existe pour la même adresse (on ne relance
       que le dernier : trois clics sur « Payer » ne font pas trois
       relances) ;
     · le brouillon n'a pas de jeton — il date d'avant cette fonction,
       le client n'a donc pas été prévenu qu'on pourrait le relancer.

   Le geste commercial n'est pas codé ici : l'équipe le choisit chaque
   semaine dans l'admin (table cart_recovery_offers).
   ═══════════════════════════════════════════════════════════════ */

export type Rang = 1 | 2;

export type Offre = {
  kind: 'code' | 'cadeau';
  code?: string;
  type?: string;             // percent | fixed | free_shipping
  value?: number;
  min_order?: number;
  cadeau?: { id: string; name_fr: string; name_en?: string; name_sv?: string; image_url?: string };
  message?: Record<LangueClient, string | null>;
  apply_to: 'r1' | 'r2' | 'both';
};

export const jetonRelance = () => crypto.randomBytes(18).toString('base64url');

/* Secret des liens de désinscription. Doit rester stable : un lien déjà
   envoyé doit fonctionner des semaines plus tard. */
const SECRET = process.env.RELANCE_SECRET || process.env.CUSTOMER_JWT_SECRET
  || process.env.STRIPE_WEBHOOK_SECRET || 'sd-relance';

export const signatureEmail = (email: string) =>
  crypto.createHmac('sha256', SECRET).update(email.trim().toLowerCase()).digest('base64url').slice(0, 24);

/** Lundi (heure de Paris) de la semaine d'une date, au format YYYY-MM-DD. */
export function lundiDe(d: Date = new Date()): string {
  const ymd = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  const jour = d.toLocaleDateString('en-US', { timeZone: 'Europe/Paris', weekday: 'short' });
  const decalage = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(jour);
  const base = new Date(ymd + 'T12:00:00Z');
  base.setUTCDate(base.getUTCDate() - Math.max(0, decalage));
  return base.toISOString().slice(0, 10);
}

/* URL publique du back-office, pour le lien de désinscription.
   NEXT_PUBLIC_BACKEND_URL n'est pas toujours renseignée ; Vercel fournit
   de lui-même le domaine de production du projet. */
function urlBackOffice(): string {
  try { return urlAdmin(); } catch { /* repli ci-dessous */ }
  const v = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (v) return `https://${v.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  throw new Error('URL du back-office introuvable : renseigner NEXT_PUBLIC_BACKEND_URL (Vercel).');
}

const parseLines = (v: any): any[] => {
  try { const l = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(l) ? l : []; }
  catch { return []; }
};

/**
 * Geste de la semaine pour une relance donnée — ou null.
 * Un code désactivé ou expiré vaut « pas de geste » : mieux vaut un email
 * sans offre qu'un email qui promet un code refusé au paiement.
 */
export async function offreDeLaSemaine(rang: Rang, quand: Date = new Date()): Promise<Offre | null> {
  const { data: o } = await supabaseAdmin
    .from('cart_recovery_offers').select('*').eq('week_start', lundiDe(quand)).maybeSingle();
  if (!o) return null;
  if (!(o.apply_to === 'both' || o.apply_to === `r${rang}`)) return null;
  const message = { fr: o.message_fr || null, en: o.message_en || null, sv: o.message_sv || null };

  if (o.gift_product_id) {
    const { data: p } = await supabaseAdmin
      .from('products').select('id, name_fr, name_en, name_sv, image_url, is_active, stock, track_stock')
      .eq('id', o.gift_product_id).maybeSingle();
    if (!p || !p.is_active || (p.track_stock && (Number(p.stock) || 0) <= 0)) return null;
    return { kind: 'cadeau', cadeau: p, message, apply_to: o.apply_to };
  }

  if (o.promo_code_id) {
    const { data: pc } = await supabaseAdmin
      .from('promo_codes').select('code, type, value, min_order, is_active, valid_from, valid_until, max_uses, used_count')
      .eq('id', o.promo_code_id).maybeSingle();
    if (!pc || !pc.is_active) return null;
    if (pc.valid_until && quand > new Date(String(pc.valid_until).slice(0, 10) + 'T23:59:59')) return null;
    if (pc.max_uses && (pc.used_count || 0) >= pc.max_uses) return null;
    if (!['percent', 'fixed', 'free_shipping'].includes(pc.type)) return null;
    return {
      kind: 'code', code: pc.code, type: pc.type, value: Number(pc.value) || 0,
      min_order: Number(pc.min_order) || 0, message, apply_to: o.apply_to,
    };
  }
  return null;
}

/** Texte de l'offre dans la langue du client. */
function texteOffre(o: Offre, lang: LangueClient): { titre: string; texte: string } {
  const eur = (n: number) => formatEuro(n, lang);
  const min = o.min_order ? (lang === 'en' ? ` from ${eur(o.min_order)} of purchases` : lang === 'sv' ? ` vid köp över ${eur(o.min_order)}` : ` dès ${eur(o.min_order)} d'achats`) : '';
  let titre = '';
  if (o.kind === 'cadeau') {
    const nom = (lang === 'en' ? o.cadeau?.name_en : lang === 'sv' ? o.cadeau?.name_sv : null) || o.cadeau?.name_fr || '';
    titre = lang === 'en' ? `${nom}, on us` : lang === 'sv' ? `${nom} på köpet` : `${nom} offert`;
  } else if (o.type === 'percent') {
    titre = lang === 'en' ? `${o.value}% off your basket` : lang === 'sv' ? `${o.value} % rabatt på din varukorg` : `−${o.value} % sur votre panier`;
  } else if (o.type === 'fixed') {
    titre = lang === 'en' ? `${eur(o.value || 0)} off your basket` : lang === 'sv' ? `${eur(o.value || 0)} rabatt på din varukorg` : `−${eur(o.value || 0)} sur votre panier`;
  } else if (o.type === 'free_shipping') {
    titre = lang === 'en' ? 'Free delivery' : lang === 'sv' ? 'Fri frakt' : 'Livraison offerte';
  }
  const defaut = o.kind === 'cadeau'
    ? (lang === 'en' ? 'Added to your parcel when you complete your order from the button below.' : lang === 'sv' ? 'Läggs i ditt paket när du slutför beställningen via knappen nedan.' : 'Glissé dans votre colis si vous finalisez votre commande depuis le bouton ci-dessous.')
    : (lang === 'en' ? `Valid on this order${min}.` : lang === 'sv' ? `Gäller den här beställningen${min}.` : `Valable sur cette commande${min}.`);
  return { titre, texte: o.message?.[lang] || o.message?.fr || defaut };
}

/** Fabrique l'email de relance (sujet + HTML) — sert à l'envoi ET à l'aperçu de l'admin. */
export async function composerRelance(p: {
  lignesBrutes: any[]; prenom?: string | null; lang: LangueClient; rang: Rang;
  offre: Offre | null; front: string; lienPanier: string; lienDesinscription: string;
}): Promise<{ sujet: string; html: string }> {
  const { lignesBrutes, lang, rang, offre, front } = p;
  const ids = lignesBrutes.map(l => l.product_id).filter(Boolean);
  const { data: produits } = ids.length
    ? await supabaseAdmin.from('products').select('id, name_fr, name_en, name_sv, image_url').in('id', ids)
    : { data: [] as any[] };
  const P = Object.fromEntries((produits || []).map(x => [x.id, x]));
  const media = (u?: string) => String(u || '')
    .replace(/^https?:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/svenska-media\//i, `${front}/media/`);

  let sousTotal = 0;
  const lignes = lignesBrutes.map(l => {
    const pr = P[l.product_id] || {};
    const qte = Number(l.qty) || 1, pu = Number(l.price) || 0;
    sousTotal += qte * pu;
    const nom = (lang === 'en' ? pr.name_en || l.name_en : lang === 'sv' ? pr.name_sv || l.name_sv : null) || pr.name_fr || l.name || '';
    return { nom, qte, pu: formatEuro(pu, lang), montant: formatEuro(qte * pu, lang), image: media(pr.image_url || l.image_url) };
  });

  const t = offre ? texteOffre(offre, lang) : null;
  const cfg = await getWhiteLabelConfig();
  const seuil = Number((cfg as any).free_shipping_threshold) || 29;
  const noteLivraison = sousTotal >= seuil
    ? (lang === 'en' ? 'Free delivery to a relay point on this basket.' : lang === 'sv' ? 'Fri frakt till utlämningsställe för den här varukorgen.' : 'Livraison en point relais offerte sur ce panier.')
    : (lang === 'en' ? `Free delivery from ${formatEuro(seuil, lang)} — only ${formatEuro(seuil - sousTotal, lang)} to go.`
      : lang === 'sv' ? `Fri frakt från ${formatEuro(seuil, lang)} — bara ${formatEuro(seuil - sousTotal, lang)} kvar.`
      : `Livraison offerte dès ${formatEuro(seuil, lang)} — plus que ${formatEuro(seuil - sousTotal, lang)}.`);

  const sujet = rang === 1
    ? (lang === 'en' ? 'Your basket is waiting for you' : lang === 'sv' ? 'Din varukorg väntar på dig' : 'Votre panier vous attend')
    : (t ? `${t.titre} — ${lang === 'en' ? 'your basket is still here' : lang === 'sv' ? 'din varukorg finns kvar' : 'votre panier est toujours là'}`
         : (lang === 'en' ? 'Still tempted? Your basket is still here' : lang === 'sv' ? 'Fortfarande sugen? Din varukorg finns kvar' : 'Toujours tenté ? Votre panier est toujours là'));

  const html = await renderEmail('email-relance-panier', {
    rang2: rang === 2,
    prenom: String(p.prenom || '').trim().split(/\s+/)[0] || (lang === 'en' ? 'there' : lang === 'sv' ? 'där' : 'à vous'),
    preheader: t ? t.titre : sujet,
    lignes,
    sous_total: formatEuro(sousTotal, lang),
    note_livraison: noteLivraison,
    offre: !!t,
    offre_titre: t?.titre || '',
    offre_texte: t?.texte || '',
    offre_code: offre?.kind === 'code' ? offre.code : '',
    lien_panier: p.lienPanier,
    lien_desinscription: p.lienDesinscription,
  }, lang, front);

  return { sujet, html };
}

type Resultat = { ok: boolean; raison: string };

/**
 * Envoie la relance `rang` d'une commande brouillon, si elle est due.
 * La prise (écriture de recovery_N_sent_at) se fait AVANT l'envoi et
 * seulement si la colonne était vide : deux déclenchements simultanés
 * (webhook + cron) ne peuvent pas envoyer deux fois le même email.
 */
export async function envoyerRelance(orderId: string, rang: Rang): Promise<Resultat> {
  const col = rang === 1 ? 'recovery_1_sent_at' : 'recovery_2_sent_at';
  const { data: o } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!o) return { ok: false, raison: 'introuvable' };

  const email = String(o.customer_email || '').trim().toLowerCase();
  const passer = async (raison: string): Promise<Resultat> => {
    await supabaseAdmin.from('orders').update({ recovery_skip_reason: raison }).eq('id', orderId);
    return { ok: false, raison };
  };

  if (!['pending', 'abandoned'].includes(o.status)) return { ok: false, raison: `statut ${o.status}` };
  if (!o.recovery_token) return { ok: false, raison: 'sans jeton (antérieur à la relance)' };
  if (!email) return { ok: false, raison: 'sans email' };
  if (o[col]) return { ok: false, raison: 'déjà envoyée' };
  if (o.recovery_skip_reason) return { ok: false, raison: o.recovery_skip_reason };
  if (o.recovered_at) return { ok: false, raison: 'déjà récupéré' };
  if (rang === 2 && !o.recovery_1_sent_at) return { ok: false, raison: 'relance 1 pas encore partie' };

  const { data: optout } = await supabaseAdmin.from('email_optouts').select('email').eq('email', email).maybeSingle();
  if (optout) return passer('désinscrit');

  const { data: apres } = await supabaseAdmin
    .from('orders').select('id, status, created_at')
    .ilike('customer_email', email).gt('created_at', o.created_at).neq('id', orderId);
  if ((apres || []).some(x => !['pending', 'abandoned', 'cancelled'].includes(x.status))) return passer('a commandé depuis');
  if ((apres || []).some(x => ['pending', 'abandoned'].includes(x.status))) return passer('panier plus récent');

  /* Un client revenu par le lien puis reparti crée un NOUVEAU brouillon :
     sans cette garde, il repartirait pour deux relances de plus. La
     promesse « deux rappels maximum » vaut par personne, sur 7 jours. */
  if (rang === 1) {
    const { data: deja } = await supabaseAdmin
      .from('orders').select('id')
      .ilike('customer_email', email).neq('id', orderId)
      .gt('recovery_1_sent_at', new Date(Date.now() - 7 * 86400_000).toISOString())
      .limit(1);
    if (deja?.length) return passer('déjà relancé cette semaine');
  }

  const lignesBrutes = parseLines(o.lines).filter(l => l?.product_id && (Number(l.price) || 0) > 0);
  if (!lignesBrutes.length) return passer('panier vide');

  // La prise : personne d'autre n'enverra cette relance.
  const maintenant = new Date().toISOString();
  const { data: pris } = await supabaseAdmin
    .from('orders').update({ [col]: maintenant }).eq('id', orderId).is(col, null).select('id');
  if (!pris?.length) return { ok: false, raison: 'déjà prise' };

  try {
    const lang = langueDeCommande(o);
    const front = await urlVitrine();
    const offre = await offreDeLaSemaine(rang);
    const codeParam = offre?.kind === 'code' && offre.code ? `&code=${encodeURIComponent(offre.code)}` : '';
    const { sujet, html } = await composerRelance({
      lignesBrutes, prenom: o.customer_name, lang, rang, offre, front,
      lienPanier: `${front}/panier.html?reprise=${o.id}.${o.recovery_token}${codeParam}&r=${rang}`,
      lienDesinscription: `${urlBackOffice()}/api/relance/desinscription?e=${encodeURIComponent(email)}&s=${signatureEmail(email)}`,
    });
    const cfg = await getWhiteLabelConfig();
    const from = (cfg as any).smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';
    await sendEmail({ from, to: email, subject: sujet, html }, cfg);
    return { ok: true, raison: `relance ${rang} envoyée à ${email}` };
  } catch (e: any) {
    // Échec d'envoi : on libère la prise pour qu'un prochain passage réessaie.
    await supabaseAdmin.from('orders').update({ [col]: null }).eq('id', orderId).eq(col, maintenant);
    return { ok: false, raison: `échec d'envoi : ${e?.message || e}` };
  }
}

/**
 * Au paiement : les paniers relancés de la même adresse sont marqués
 * « récupérés », rattachés à la commande payée. C'est ce qui permet de
 * mesurer ce que la relance rapporte vraiment.
 */
export async function marquerRecupere(email: string, commandePayeeId: string) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return;
  await supabaseAdmin.from('orders')
    .update({ recovered_at: new Date().toISOString(), recovered_order_id: commandePayeeId })
    .ilike('customer_email', e)
    .in('status', ['pending', 'abandoned'])
    .not('recovery_1_sent_at', 'is', null)
    .is('recovered_at', null)
    .neq('id', commandePayeeId);
}

/**
 * Cadeau de relance à ajouter au checkout, si le client arrive par un
 * lien de relance valide et que l'offre envoyée était un cadeau.
 * Vérifié côté serveur : sans le jeton du brouillon, pas de cadeau.
 */
export async function cadeauDeReprise(reprise: unknown): Promise<Offre['cadeau'] | null> {
  const [id, jeton] = String(reprise || '').split('.');
  if (!id || !jeton) return null;
  const { data: o } = await supabaseAdmin
    .from('orders').select('id, status, recovery_token, recovery_1_sent_at, recovery_2_sent_at, recovered_at')
    .eq('id', id).maybeSingle();
  if (!o || o.recovery_token !== jeton || o.recovered_at) return null;
  if (!['pending', 'abandoned'].includes(o.status)) return null;
  // L'offre est celle de la semaine où la dernière relance est partie.
  const rang: Rang = o.recovery_2_sent_at ? 2 : 1;
  const envoi = o.recovery_2_sent_at || o.recovery_1_sent_at;
  if (!envoi) return null;
  const offre = await offreDeLaSemaine(rang, new Date(envoi));
  return offre?.kind === 'cadeau' ? offre.cadeau || null : null;
}
