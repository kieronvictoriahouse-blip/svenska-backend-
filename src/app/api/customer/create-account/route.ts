import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { getWhiteLabelConfig, sendEmail, baseTemplate } from '@/lib/email-send';
import crypto from 'crypto';

const CUSTOMER_SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.SNIPCART_SECRET_KEY || 'sd-customer-secret';

function signToken(email: string): string {
  // 30-day token (magic link)
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 86400000 * 30 })).toString('base64url');
  const sig = crypto.createHmac('sha256', CUSTOMER_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401, headers: CORS });
  }

  let email: string, name: string, sendEmailFlag: boolean;
  try {
    const body = await req.json();
    email = (body.email || '').trim().toLowerCase();
    name  = (body.name  || '').trim();
    sendEmailFlag = !!body.send_email;
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: CORS });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400, headers: CORS });
  }

  // Créer / mettre à jour customer_profiles
  const { data: profile, error } = await supabaseAdmin
    .from('customer_profiles')
    .upsert(
      { email, name: name || null, updated_at: new Date().toISOString() },
      { onConflict: 'email' }
    )
    .select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  }

  // Sync contacts CRM
  try {
    const nameParts = (name || '').trim().split(' ');
    const { data: existing } = await supabaseAdmin.from('contacts').select('id').eq('email', email).maybeSingle();
    if (!existing) {
      await supabaseAdmin.from('contacts').insert({
        type: 'client', email,
        first_name: nameParts[0] || null,
        last_name:  nameParts.slice(1).join(' ') || null,
        is_active:  true,
      });
    }
  } catch { /* sync non-bloquant */ }

  // Générer le magic link (token 30 jours)
  const token     = signToken(email);
  const frontUrl  = process.env.NEXT_PUBLIC_FRONT_URL || 'https://www.swedishcravings.fr';
  const magicLink = `${frontUrl}/compte.html?token=${encodeURIComponent(token)}`;

  if (sendEmailFlag) {
    try {
      const cfg       = await getWhiteLabelConfig();
      const siteName  = (cfg as any).site_name || 'Swedish Cravings';
      const fromEmail = (cfg as any).smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || 'onboarding@resend.dev';

      const body = `
        <h1 class="title">Bienvenue !</h1>
        <p class="text">Bonjour ${name || email},</p>
        <p class="text">Votre espace client a été créé sur <strong>${siteName}</strong>. Cliquez ci-dessous pour accéder à votre compte et consulter vos commandes.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${magicLink}" style="display:inline-block;background:#3E5238;color:#fff;padding:14px 32px;border-radius:4px;font-size:15px;text-decoration:none;letter-spacing:1px">Accéder à mon compte →</a>
        </div>
        <p style="font-size:12px;color:#9CA3AF;text-align:center;margin-top:8px">Ce lien est valable 30 jours.</p>
      `;

      await sendEmail({
        from:    fromEmail,
        to:      email,
        subject: `👋 Bienvenue chez ${siteName} — votre espace client`,
        html:    baseTemplate(body, `Bienvenue chez ${siteName}`, cfg),
      }, cfg as any);
    } catch (err: any) {
      console.warn('[create-account] email error (non-fatal):', err.message);
    }
  }

  return NextResponse.json({ profile, magic_link: magicLink }, { headers: CORS });
}
