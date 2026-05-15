import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const EVENT_TO_COL: Record<string, string> = {
  delivered: 'delivered_count',
  opened:    'open_count',
  clicked:   'click_count',
  bounced:   'bounced_count',
};

function verifySignature(rawBody: string, headers: Headers, secret: string): boolean {
  const msgId        = headers.get('svix-id');
  const msgTimestamp = headers.get('svix-timestamp');
  const msgSignature = headers.get('svix-signature');
  if (!msgId || !msgTimestamp || !msgSignature) return false;

  // Reject if timestamp is older than 5 minutes
  if (Math.abs(Date.now() / 1000 - parseInt(msgTimestamp)) > 300) return false;

  const secretBytes  = Buffer.from(secret.replace('whsec_', ''), 'base64');
  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`;
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  return msgSignature.split(' ').some(part => {
    const sig = part.replace(/^v\d+,/, '');
    try {
      const a = Buffer.from(sig, 'base64');
      const b = Buffer.from(expected, 'base64');
      return a.length === b.length && timingSafeEqual(a, b);
    } catch { return false; }
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret  = process.env.RESEND_WEBHOOK_SECRET;

  if (secret && !verifySignature(rawBody, req.headers, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: any;
  try { body = JSON.parse(rawBody); } catch { return NextResponse.json({ ok: true }); }

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
