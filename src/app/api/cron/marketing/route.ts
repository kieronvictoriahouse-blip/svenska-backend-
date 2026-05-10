import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getWhiteLabelConfig, sendEmail,
  abandonedCartTemplate, welcomeTemplate, winBackTemplate, postPurchaseTemplate,
} from '@/lib/email-send';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cfg = await getWhiteLabelConfig();
  const siteName = cfg.site_name || '';
  const from = cfg.smtp_from || process.env.SMTP_FROM || (siteName ? `${siteName} <noreply@example.com>` : 'noreply@example.com');
  const results: string[] = [];
  const now = Date.now();

  // ── PANIER ABANDONNÉ (3 étapes automatiques) ─────────────

  // Étape 1 : entre 20h et 48h après l'abandon
  const { data: carts1 } = await supabaseAdmin
    .from('abandoned_carts')
    .select('id,customer_email,customer_name,cart_data,cart_total')
    .eq('recovered', false)
    .is('email_1_sent_at', null)
    .not('customer_email', 'is', null)
    .lt('created_at', new Date(now - 20 * 3600_000).toISOString())
    .gt('created_at', new Date(now - 48 * 3600_000).toISOString());

  for (const cart of (carts1 || [])) {
    try {
      const { html, subject } = abandonedCartTemplate(cart, 1, cfg);
      await sendEmail({ from, to: cart.customer_email, subject, html }, cfg);
      await supabaseAdmin.from('abandoned_carts').update({ email_1_sent_at: new Date().toISOString() }).eq('id', cart.id);
      results.push(`cart_1:${cart.customer_email}`);
    } catch {}
  }

  // Étape 2 : 3 jours (email_1 envoyé, pas email_2)
  const { data: carts2 } = await supabaseAdmin
    .from('abandoned_carts')
    .select('id,customer_email,customer_name,cart_data,cart_total')
    .eq('recovered', false)
    .not('email_1_sent_at', 'is', null)
    .is('email_2_sent_at', null)
    .not('customer_email', 'is', null)
    .lt('created_at', new Date(now - 60 * 3600_000).toISOString())
    .gt('created_at', new Date(now - 168 * 3600_000).toISOString());

  for (const cart of (carts2 || [])) {
    try {
      const { html, subject } = abandonedCartTemplate(cart, 2, cfg);
      await sendEmail({ from, to: cart.customer_email, subject, html }, cfg);
      await supabaseAdmin.from('abandoned_carts').update({ email_2_sent_at: new Date().toISOString() }).eq('id', cart.id);
      results.push(`cart_2:${cart.customer_email}`);
    } catch {}
  }

  // Étape 3 : 7 jours (email_2 envoyé, pas email_3) — avec code promo -10%
  const { data: carts3 } = await supabaseAdmin
    .from('abandoned_carts')
    .select('id,customer_email,customer_name,cart_data,cart_total')
    .eq('recovered', false)
    .not('email_2_sent_at', 'is', null)
    .is('email_3_sent_at', null)
    .not('customer_email', 'is', null)
    .lt('created_at', new Date(now - 144 * 3600_000).toISOString());

  for (const cart of (carts3 || [])) {
    try {
      const { html, subject } = abandonedCartTemplate(cart, 3, cfg);
      await sendEmail({ from, to: cart.customer_email, subject, html }, cfg);
      await supabaseAdmin.from('abandoned_carts').update({ email_3_sent_at: new Date().toISOString() }).eq('id', cart.id);
      results.push(`cart_3:${cart.customer_email}`);
    } catch {}
  }

  // ── AUTOMATIONS PERSONNALISÉES (table marketing_automations) ─

  const { data: automations } = await supabaseAdmin
    .from('marketing_automations')
    .select('*')
    .eq('status', 'active');

  for (const auto of (automations || [])) {
    const delayMs = (auto.delay_hours || 24) * 3600_000;
    const cutoff = new Date(now - delayMs).toISOString();
    let sent = 0;

    // ── WELCOME EMAIL ──────────────────────────────────────
    if (auto.type === 'welcome') {
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('id,customer_email,customer_name')
        .not('customer_email', 'is', null)
        .is('welcome_email_sent_at', null)
        .in('status', ['confirmed', 'paid', 'shipped', 'delivered'])
        .lt('created_at', cutoff)
        .limit(50);

      for (const order of (orders || [])) {
        const { count } = await supabaseAdmin
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('customer_email', order.customer_email);
        const isFirst = (count || 0) <= 1;
        await supabaseAdmin.from('orders').update({ welcome_email_sent_at: isFirst ? new Date().toISOString() : 'skipped' }).eq('id', order.id);
        if (!isFirst) continue;
        try {
          const { html, subject } = welcomeTemplate(order, auto, cfg);
          await sendEmail({ from, to: order.customer_email, subject, html }, cfg);
          results.push(`welcome:${order.customer_email}`);
          sent++;
        } catch {}
      }
    }

    // ── WIN-BACK ────────────────────────────────────────────
    if (auto.type === 'win_back') {
      const inactiveDays = Math.round((auto.delay_hours || 2160) / 24);
      const winCutoff = new Date(now - inactiveDays * 24 * 3600_000).toISOString();
      const recentCutoff = new Date(now - 30 * 24 * 3600_000).toISOString();

      const [{ data: oldOrders }, { data: recentOrders }, { data: logs }] = await Promise.all([
        supabaseAdmin.from('orders').select('customer_email,customer_name').lt('created_at', winCutoff),
        supabaseAdmin.from('orders').select('customer_email').gt('created_at', recentCutoff),
        supabaseAdmin.from('marketing_automation_logs').select('recipient_email').eq('automation_id', auto.id).gt('sent_at', winCutoff),
      ]);

      const recentSet = new Set((recentOrders || []).map((o: any) => o.customer_email));
      const sentSet = new Set((logs || []).map((l: any) => l.recipient_email));
      const seen = new Set<string>();
      const targets = (oldOrders || []).filter((o: any) => {
        if (seen.has(o.customer_email) || recentSet.has(o.customer_email) || sentSet.has(o.customer_email)) return false;
        seen.add(o.customer_email);
        return true;
      }).slice(0, 50);

      for (const customer of targets) {
        try {
          const { html, subject } = winBackTemplate({ email: customer.customer_email, name: customer.customer_name || '' }, auto, cfg);
          await sendEmail({ from, to: customer.customer_email, subject, html }, cfg);
          await supabaseAdmin.from('marketing_automation_logs').insert({
            automation_id: auto.id, automation_type: 'win_back', recipient_email: customer.customer_email,
          });
          results.push(`win_back:${customer.customer_email}`);
          sent++;
        } catch {}
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
        .lt('updated_at', cutoff)
        .limit(50);

      for (const order of (orders || [])) {
        try {
          const { html, subject } = postPurchaseTemplate(order, auto, cfg);
          await sendEmail({ from, to: order.customer_email, subject, html }, cfg);
          await supabaseAdmin.from('orders').update({ review_email_sent_at: new Date().toISOString() }).eq('id', order.id);
          results.push(`post_purchase:${order.customer_email}`);
          sent++;
        } catch {}
      }
    }

    if (sent > 0) {
      await supabaseAdmin.from('marketing_automations')
        .update({ sent_count: (auto.sent_count || 0) + sent, updated_at: new Date().toISOString() })
        .eq('id', auto.id);
    }
  }

  return NextResponse.json({ ok: true, sent: results.length, details: results, ts: new Date().toISOString() });
}
