import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Inscription newsletter — PUBLIC (pas d'auth). Enregistre l'email dans le CRM (contacts)
// pour qu'il soit exploitable par le module Marketing (campagnes).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const email = String(body.email || '').trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400, headers: CORS });
  }

  // Anti-doublon : si l'email existe déjà, on renvoie OK (idempotent)
  const { data: existing } = await supabaseAdmin
    .from('contacts')
    .select('id')
    .eq('email', email)
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, already: true }, { headers: CORS });
  }

  const { error } = await supabaseAdmin.from('contacts').insert({
    email,
    type: 'client',
    company: 'Inscrit newsletter',
    first_name: '',
    last_name: '',
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  }
  return NextResponse.json({ ok: true }, { headers: CORS });
}
