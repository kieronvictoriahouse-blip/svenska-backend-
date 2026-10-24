import { supabaseAdmin } from '@/lib/supabase';
import { getWhiteLabelConfig, sendEmail } from '@/lib/email-send';
import { renderEmail, sujetPersonnalise, contexteMarque } from '@/lib/email-templates';
import { disponiblesPour } from '@/lib/reserve';
import { SUJETS, formatEuro } from '@/lib/emails-i18n';
import type { LangueClient } from '@/lib/langue-client';

/* ═══════════════════════════════════════════════════════════════
   ALERTES « RETOUR EN STOCK »

   Passage quotidien (cron relance-paniers) : pour chaque produit qui a
   des alertes en attente et qui est de nouveau DISPONIBLE — stock moins
   les commandes payées pas encore parties, box comprises
   (disponiblesPour) —, un e-mail par adresse, une seule fois.

   On ne s'accroche pas aux mouvements de stock : un produit redevient
   aussi disponible quand une commande payée est annulée, sans le
   moindre mouvement. Le balayage voit tous les cas.
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

export async function envoyerAlertesStock(): Promise<string[]> {
  const journal: string[] = [];

  // Conservation (062) : envoyées → 90 jours, jamais servies → 1 an.
  const jours = (n: number) => new Date(Date.now() - n * 86400_000).toISOString();
  await supabaseAdmin.from('stock_alerts').delete().lt('notified_at', jours(90));
  await supabaseAdmin.from('stock_alerts').delete().is('notified_at', null).lt('created_at', jours(365));

  const { data: alertes, error } = await supabaseAdmin
    .from('stock_alerts').select('id, product_id, email, lang')
    .is('notified_at', null).order('created_at').limit(500);
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
