import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import {
  getWhiteLabelConfig, sendEmail,
  welcomeTemplate, winBackTemplate, postPurchaseTemplate,
} from '@/lib/email-send';
import { desinscription } from '@/lib/relance-panier';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const PAYES = ['confirmed', 'paid', 'preparing', 'partial', 'shipped', 'delivered'];
const norm = (e: unknown) => String(e || '').trim().toLowerCase();

export async function GET(req: NextRequest) {
  /* Vercel appelle avec « Bearer CRON_SECRET » ; le bouton « Exécuter
     maintenant » de l'admin, avec la session de l'admin. Sans
     CRON_SECRET, la route tournait OUVERTE à tout l'internet (les autres
     crons, eux, refusent) ; et avec, le bouton de l'admin recevait un 401
     qui le déconnectait. */
  const secret = (process.env.CRON_SECRET || '').trim();
  const parCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
  if (!parCron && !(await requireAuth(req))) {
    if (!secret) console.error('[cron/marketing] CRON_SECRET absent de l’environnement : passage refusé');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cfg = await getWhiteLabelConfig();
  const siteName = cfg.site_name || '';
  const from = cfg.smtp_from || process.env.SMTP_FROM || (siteName ? `${siteName} <noreply@example.com>` : 'noreply@example.com');
  const results: string[] = [];
  const echecs: string[] = [];
  const now = Date.now();

  /* L'ancien circuit « panier abandonné » en trois emails (table
     abandoned_carts, code RETOUR10 en dur, sans lien de désinscription ni
     respect des oppositions) est retiré : plus rien n'alimente cette
     table, et la règle de la boutique est « deux relances maximum »,
     tenue par lib/relance-panier (cron relance-paniers + webhook Stripe). */

  /* Adresses opposées (désinscrit, plainte, rejet) : aucune automation ne
     leur écrit. Lues par lot de destinataires (une table entière
     plafonnerait à 1000 lignes). */
  const opposees = async (emails: string[]): Promise<Set<string>> => {
    const l = Array.from(new Set(emails.map(norm).filter(Boolean)));
    if (!l.length) return new Set();
    const { data } = await supabaseAdmin.from('email_optouts').select('email').in('email', l);
    return new Set((data || []).map((o: any) => norm(o.email)));
  };

  // ── AUTOMATIONS PERSONNALISÉES (table marketing_automations) ─

  const { data: automations } = await supabaseAdmin
    .from('marketing_automations')
    .select('*')
    .eq('status', 'active');

  for (const auto of (automations || [])) {
    const delayMs = (auto.delay_hours || 24) * 3600_000;
    const cutoff = new Date(now - delayMs).toISOString();
    /* Borne basse : une automation activée aujourd'hui ne doit pas
       écrire à tout l'historique (50 anciens clients par jour recevaient
       « merci pour votre première commande » des mois après). */
    const depuisActivation = auto.created_at || new Date(now - 30 * 86400_000).toISOString();
    let sent = 0;

    // ── WELCOME EMAIL ──────────────────────────────────────
    if (auto.type === 'welcome') {
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('id,customer_email,customer_name,created_at')
        .not('customer_email', 'is', null)
        .is('welcome_email_sent_at', null)
        .in('status', PAYES)
        .or('is_test.is.null,is_test.eq.false')
        .lt('created_at', cutoff)
        .gte('created_at', depuisActivation)
        .limit(50);

      const opposes = await opposees((orders || []).map((o: any) => o.customer_email));
      for (const order of (orders || [])) {
        /* « Première commande » = première commande PAYÉE : les
           brouillons (clics sur « Payer ») d'un même client le faisaient
           passer pour un habitué. */
        const { count } = await supabaseAdmin
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .ilike('customer_email', norm(order.customer_email))
          .in('status', [...PAYES, 'refunded'])
          .lt('created_at', order.created_at);
        const isFirst = (count || 0) === 0 && !opposes.has(norm(order.customer_email));
        // La prise : deux passages simultanés (cron + bouton) n'envoient pas deux fois.
        const { data: pris } = await supabaseAdmin.from('orders')
          .update({ welcome_email_sent_at: isFirst ? new Date().toISOString() : 'skipped' })
          .eq('id', order.id).is('welcome_email_sent_at', null).select('id');
        if (!pris?.length || !isFirst) continue;
        try {
          const { html, subject } = welcomeTemplate(order, auto, cfg);
          await sendEmail({ from, to: order.customer_email, subject, html }, cfg);
          results.push(`welcome:${order.customer_email}`);
          sent++;
        } catch (e: any) { echecs.push(e?.message || 'erreur'); }
      }
    }

    // ── WIN-BACK ────────────────────────────────────────────
    if (auto.type === 'win_back') {
      const inactiveDays = Math.round((auto.delay_hours || 2160) / 24);
      const winCutoff = new Date(now - inactiveDays * 24 * 3600_000).toISOString();

      /* Clients PAYANTS uniquement (un brouillon jamais payé n'est pas un
         client à « réactiver »), et « inactif » sur la même fenêtre que le
         réglage : l'ancien filtre « rien depuis 30 jours » écrivait
         « on vous manque » à qui avait commandé il y a 45 jours avec un
         seuil de 90. */
      const [{ data: oldOrders }, { data: recentOrders }, { data: logs }] = await Promise.all([
        supabaseAdmin.from('orders').select('customer_email,customer_name')
          .in('status', PAYES).or('is_test.is.null,is_test.eq.false')
          .not('customer_email', 'is', null).lt('created_at', winCutoff)
          .order('created_at', { ascending: false }).limit(1000),
        supabaseAdmin.from('orders').select('customer_email')
          .not('status', 'in', '(abandoned,cancelled)').not('customer_email', 'is', null)
          .gt('created_at', winCutoff).limit(1000),
        supabaseAdmin.from('marketing_automation_logs').select('recipient_email').eq('automation_id', auto.id).gt('sent_at', winCutoff),
      ]);

      const recentSet = new Set((recentOrders || []).map((o: any) => norm(o.customer_email)));
      const sentSet = new Set((logs || []).map((l: any) => norm(l.recipient_email)));
      const seen = new Set<string>();
      const candidats = (oldOrders || []).filter((o: any) => {
        const e = norm(o.customer_email);
        if (!e || seen.has(e) || recentSet.has(e) || sentSet.has(e)) return false;
        seen.add(e);
        return true;
      });
      // 200 candidats au plus par passage : la liste part dans l'URL du filtre `in`.
      const lot = candidats.slice(0, 200);
      const opposes = await opposees(lot.map((o: any) => o.customer_email));
      const targets = lot.filter((o: any) => !opposes.has(norm(o.customer_email))).slice(0, 50);

      for (const customer of targets) {
        const email = norm(customer.customer_email);
        /* Journal AVANT l'envoi : un 2e passage simultané ne réécrit pas
           au même client. Retiré si l'envoi échoue. */
        const { data: log } = await supabaseAdmin.from('marketing_automation_logs').insert({
          automation_id: auto.id, automation_type: 'win_back', recipient_email: email,
        }).select('id').single();
        try {
          // Email commercial : lien de désinscription et en-tête List-Unsubscribe.
          const d = desinscription(email, 'newsletter');
          const { html, subject } = winBackTemplate({ email, name: customer.customer_name || '' }, auto, cfg, d.url);
          await sendEmail({ from, to: email, subject, html, headers: d.headers }, cfg);
          results.push(`win_back:${email}`);
          sent++;
        } catch (e: any) {
          if (log?.id) await supabaseAdmin.from('marketing_automation_logs').delete().eq('id', log.id);
          echecs.push(e?.message || 'erreur');
        }
      }
    }

    // ── POST-PURCHASE / AVIS ────────────────────────────────
    if (auto.type === 'post_purchase') {
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('id,customer_email,customer_name')
        .eq('status', 'delivered')
        .is('review_email_sent_at', null)
        .not('customer_email', 'is', null)
        .or('is_test.is.null,is_test.eq.false')
        .lt('updated_at', cutoff)
        // Pas tout l'historique livré le jour où l'automation est activée.
        .gte('created_at', depuisActivation)
        .limit(50);

      const opposes = await opposees((orders || []).map((o: any) => o.customer_email));
      for (const order of (orders || [])) {
        // La prise avant l'envoi : deux passages simultanés n'envoient pas deux fois.
        const marque = opposes.has(norm(order.customer_email)) ? 'skipped' : new Date().toISOString();
        const { data: pris } = await supabaseAdmin.from('orders')
          .update({ review_email_sent_at: marque })
          .eq('id', order.id).is('review_email_sent_at', null).select('id');
        if (!pris?.length || marque === 'skipped') continue;
        try {
          const { html, subject } = postPurchaseTemplate(order, auto, cfg);
          await sendEmail({ from, to: order.customer_email, subject, html }, cfg);
          results.push(`post_purchase:${order.customer_email}`);
          sent++;
        } catch (e: any) {
          // Échec : on rend la commande au prochain passage.
          await supabaseAdmin.from('orders').update({ review_email_sent_at: null }).eq('id', order.id).eq('review_email_sent_at', marque);
          echecs.push(e?.message || 'erreur');
        }
      }
    }

    if (sent > 0) {
      await supabaseAdmin.from('marketing_automations')
        .update({ sent_count: (auto.sent_count || 0) + sent, updated_at: new Date().toISOString() })
        .eq('id', auto.id);
    }
  }

  /* Les echecs remontent dans la reponse et dans les logs : un email
     de relance qui ne part pas doit se voir, pas disparaitre. */
  if (echecs.length) console.error('[cron/marketing] envois en echec :', echecs);
  return NextResponse.json({
    ok: echecs.length === 0, sent: results.length, details: results,
    echecs, ts: new Date().toISOString(),
  }, { status: echecs.length ? 207 : 200 });
}
