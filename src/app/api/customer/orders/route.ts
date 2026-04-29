import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

const SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.SNIPCART_SECRET_KEY || 'sd-customer-secret';

function signToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 86400000 * 7 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

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

// POST /api/customer/orders — login by email, returns token + orders
export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = await req.json();
    email = (body.email || '').trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('id,order_number,status,customer_name,customer_email,lines,subtotal,shipping,total,created_at,updated_at,snipcart_invoice')
    .ilike('customer_email', email)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: 'no_orders' }, { status: 404 });
  }

  const customer_name = orders[0].customer_name || email;
  const token = signToken(email);

  return NextResponse.json({ token, customer_name, customer_email: email, orders });
}

// GET /api/customer/orders — authenticated by Bearer token
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const email = verifyToken(token);

  if (!email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: orders, error } = await supabaseAdmin
    .from('orders')
    .select('id,order_number,status,customer_name,customer_email,lines,subtotal,shipping,total,created_at,updated_at,snipcart_invoice')
    .ilike('customer_email', email)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: orders || [] });
}
