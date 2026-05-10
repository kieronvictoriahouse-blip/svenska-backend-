import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

const SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.SNIPCART_SECRET_KEY || 'sd-customer-secret';

function verifyToken(token: string): string | null {
  try {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
    if (sig !== expected) return null;
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!email || Date.now() > exp) return null;
    return email as string;
  } catch { return null; }
}

function getToken(req: NextRequest): string {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : '';
}

// GET /api/customer/profile
export async function GET(req: NextRequest) {
  const email = verifyToken(getToken(req));
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('customer_profiles')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  return NextResponse.json({ profile: data || { email } });
}

// PUT /api/customer/profile
export async function PUT(req: NextRequest) {
  const email = verifyToken(getToken(req));
  if (!email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_body' }, { status: 400 }); }

  const { name, phone, address1, address2, city, postal_code, country } = body;

  const { data, error } = await supabaseAdmin
    .from('customer_profiles')
    .upsert({
      email,
      name:        name || null,
      phone:       phone || null,
      address1:    address1 || null,
      address2:    address2 || null,
      city:        city || null,
      postal_code: postal_code || null,
      country:     country || 'FR',
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'email' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync to contacts table (admin CRM)
  const countryNames: Record<string, string> = {
    FR:'France',BE:'Belgique',CH:'Suisse',LU:'Luxembourg',DE:'Allemagne',
    ES:'Espagne',IT:'Italie',GB:'Royaume-Uni',NL:'Pays-Bas',PT:'Portugal',
    SE:'Suède',NO:'Norvège',DK:'Danemark',
  };
  const countryName = countryNames[country || 'FR'] || (country || 'France');
  const nameParts   = (name || '').trim().split(' ');
  const firstName   = nameParts[0] || null;
  const lastName    = nameParts.slice(1).join(' ') || null;

  try {
    const { data: existing } = await supabaseAdmin
      .from('contacts').select('id').eq('email', email).maybeSingle();
    if (existing) {
      await supabaseAdmin.from('contacts').update({
        first_name: firstName, last_name: lastName,
        phone: phone || null,
        address: address1 || null, city: city || null,
        zip: postal_code || null, country: countryName,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('contacts').insert({
        type: 'client', email,
        first_name: firstName, last_name: lastName,
        phone: phone || null,
        address: address1 || null, city: city || null,
        zip: postal_code || null, country: countryName,
        is_active: true,
      });
    }
  } catch { /* sync non-bloquant */ }

  return NextResponse.json({ profile: data });
}
