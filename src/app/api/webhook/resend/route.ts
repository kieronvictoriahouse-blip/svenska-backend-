import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const EVENT_TO_COL: Record<string, string> = {
  delivered: 'delivered_count',
  opened:    'open_count',
  clicked:   'click_count',
  bounced:   'bounced_count',
};

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }

  const { type, data } = body;
  if (!type || !data) return NextResponse.json({ ok: true });

  // type format: "email.delivered" | "email.opened" | "email.clicked" | "email.bounced"
  const eventType = type.replace('email.', '');
  const resendEmailId: string = data.email_id || '';
  const toEmail: string = Array.isArray(data.to) ? data.to[0] : (data.to || '');
  const tags: { name: string; value: string }[] = data.tags || [];
  const campaignId = tags.find(t => t.name === 'campaign_id')?.value || null;

  // Store raw event
  try {
    await supabaseAdmin.from('email_events').insert({
      resend_email_id: resendEmailId,
      campaign_id:     campaignId,
      to_email:        toEmail,
      event_type:      eventType,
    });
  } catch { /* non bloquant */ }

  // Increment campaign counter
  if (campaignId) {
    const col = EVENT_TO_COL[eventType];
    if (col) {
      try {
        const { data: camp } = await supabaseAdmin
          .from('marketing_campaigns')
          .select(`id, ${col}`)
          .eq('id', campaignId)
          .single();
        if (camp) {
          await supabaseAdmin
            .from('marketing_campaigns')
            .update({ [col]: ((camp as any)[col] || 0) + 1 })
            .eq('id', campaignId);
        }
      } catch { /* non bloquant */ }
    }
  }

  return NextResponse.json({ ok: true });
}
