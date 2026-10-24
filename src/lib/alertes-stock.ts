import { supabaseAdmin } from '@/lib/supabase';
import { getWhiteLabelConfig, sendEmail } from '@/lib/email-send';
import { renderEmail, sujetPersonnalise, contexteMarque } from '@/lib/email-templates';
import { disponiblesPour } from '@/lib/reserve';
import { SUJETS, formatEuro } from '@/lib/emails-i18n';
import type { LangueClient } from '@/lib/langue-client';

/* ═══════════════════════════════════════════════════════════════
   ALERTES « RETOUR EN STOCK »

   Pour chaque produit qui a des alertes en attente et qui est de nouveau
   DISPONIBLE — stock moins les commandes payées pas encore parties, box
   comprises (disponiblesPour) —, un e-mail par adresse, une seule fois.

   Deux déclencheurs :
   — tout de suite, à chaque hausse de stock (lib/stock → alerterRetour) :
     réception, inventaire, saisie dans la fiche, retour de commande… ;
   — chaque matin (cron relance-paniers), le balayage complet : un produit
     redevient aussi disponible quand une commande payée est annulée, sans
     le moindre mouvement de stock.
   ═══════════════════════════════════════════════════════════════ */

const SUPA_MEDIA = /^https?:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/svenska-media\//i;

/** Adresse de la fiche : le slug figé en base s'il existe, sinon le même
 *  calcul que sdProductUrl() du site (js/app.js). */
function slugProduit(p: any): string {
  const fige = String(p?.slug || '');
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/.test(fige)) return fige;
  const base = String(p?.name_fr || 'produit').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base}-${String(p?.id || '').slice(0, 8)}`;
}

const nomEn = (p: any, lang: LangueClient) =>
  (lang === 'sv' ? p.name_sv : lang === 'en' ? p.name_en : '') || p.name_fr || '';

/**
 * Hausse de stock de ces produits : alertes en attente sur eux, ou sur une
 * box qui les contient (un sachet qui rentre peut compléter une box).
 * Appelé par lib/stock après chaque hausse ; ne lève jamais d'erreur bloquante.
 */
export async function alerterRetour(productIds: string[]): Promise<string[]> {
  const ids = new Set(productIds.filter(Boolean));
  if (!ids.size) return [];
  const { data: attente } = await supabaseAdmin
    .from('stock_alerts').select('product_id').is('notified_at', null).limit(1000);
  if (!attente?.length) return [];

  const enAttente = Array.from(new Set(attente.map(a => a.product_id as string)));
  const cibles = enAttente.filter(id => ids.has(id));
  const autres = enAttente.filter(id => !ids.has(id));
  if (autres.length) {
    const { data: boxes } = await supabaseAdmin
      .from('products').select('id, bundle_items').in('id', autres);
    for (const b of boxes || []) {
      if (Array.isArray(b.bundle_items) && b.bundle_items.some((it: any) => ids.has(it?.product_id))) cibles.push(b.id);
    }
  }
  /* L'envoi se fait pendant l'enregistrement du stock (réception,
     inventaire…) : au plus 5 e-mails ici, pour ne pas faire attendre
     l'écran ; s'il y en a plus, le passage du matin envoie la suite. */
  return cibles.length ? envoyerAlertesStock({ produits: cibles, max: 5 }) : [];
}

/** Sans `produits` : le balayage complet du matin (avec la purge). */
export async function envoyerAlertesStock(opts: { produits?: string[]; max?: number } = {}): Promise<string[]> {
  const journal: string[] = [];

  if (!opts.produits) {
    // Conservation (062) : envoyées → 90 jours, jamais servies → 1 an.
    const jours = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
    await supabaseAdmin.from('stock_alerts').delete().lt('notified_at', jours(90));
    await supabaseAdmin.from('stock_alerts').delete().is('notified_at', null).lt('created_at', jours(365));
  }

  let lecture = supabaseAdmin
    .from('stock_alerts').select('id, product_id, email, lang')
    .is('notified_at', null).order('created_at').limit(opts.max ?? 500);
  if (opts.produits) lecture = lecture.in('product_id', opts.produits);
  const { data: alertes, error } = await lecture;
  if (error) { journal.push(`alertes : lecture impossible (${error.message})`); return journal; }
  if (!alertes?.length) return journal;

  const ids = Array.from(new Set(alertes.map(a => a.product_id)));
  const dispo = await disponiblesPour(ids);
  /* null = stock non suivi : vendable, donc disponible. */
  const revenus = ids.filter(id => dispo[id] === null || (dispo[id] ?? 0) > 0);
  if (!revenus.length) return journal;

  /* select('*') : la colonne slug n'existe qu'après la migration 063 ; la
     nommer ferait échouer toute la requête sur une base pas encore à jour. */
  const { data: produits } = await supabaseAdmin
    .from('products').select('*').in('id', revenus).eq('is_active', true);
  const parId = new Map((produits || []).map((p: any) => [p.id, p]));

  /* Adresses en plainte ou en rejet (webhook Resend) : on n'insiste pas. */
  const emails = Array.from(new Set(alertes.map(a => a.email)));
  const { data: bloquees } = await supabaseAdmin
    .from('email_optouts').select('email').in('email', emails).in('source', ['plainte', 'rejet']);
  const exclues = new Set((bloquees || []).map((o: any) => o.email));

  const marque = await contexteMarque();
  const site = (marque.boutique_url || process.env.NEXT_PUBLIC_FRONT_URL || '').replace(/\/$/, '');
  const cfg = await getWhiteLabelConfig();
  const from = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';

  for (const a of alertes) {
    const p: any = parId.get(a.product_id);
    if (!p) continue;
    const marqueEnvoi = new Date().toISOString();
    // La prise : deux passages simultanés n'envoient pas deux fois.
    const { data: pris } = await supabaseAdmin.from('stock_alerts')
      .update({ notified_at: marqueEnvoi }).eq('id', a.id).is('notified_at', null).select('id');
    if (!pris?.length) continue;
    if (exclues.has(a.email)) { journal.push(`${a.id} : adresse bloquée, rien envoyé`); continue; }

    const lang = (['fr', 'en', 'sv'].includes(a.lang) ? a.lang : 'fr') as LangueClient;
    const produit = nomEn(p, lang);
    const image = String(p.image_url || '').replace(SUPA_MEDIA, `${site}/media-w/600/`);
    try {
      const html = await renderEmail('email-retour-stock', {
        produit,
        prix: Number(p.price) > 0 ? formatEuro(Number(p.price), lang) : '',
        image: /^https:\/\//.test(image) ? image : '',
        lien: `${site}/produit/${slugProduit(p)}`,
      }, lang);
      const sujet = (await sujetPersonnalise('email-retour-stock', lang)) || SUJETS.retourStock(produit, lang);
      await sendEmail({ from, to: a.email, subject: sujet, html }, cfg);
      journal.push(`${a.id} : envoyé (${p.name_fr})`);
    } catch (e: any) {
      // Échec : l'alerte repart en attente pour le prochain passage.
      await supabaseAdmin.from('stock_alerts').update({ notified_at: null })
        .eq('id', a.id).eq('notified_at', marqueEnvoi);
      journal.push(`${a.id} : échec (${e?.message || e})`);
    }
  }
  return journal;
}
