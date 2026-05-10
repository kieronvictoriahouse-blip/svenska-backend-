import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SECRET = process.env.CUSTOMER_JWT_SECRET || process.env.SNIPCART_SECRET_KEY || 'sd-customer-secret';

function signToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 86400000 * 7 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

// POST /api/customer/auth — issue token for any valid email (no orders required)
export async function POST(req: NextRequest) {
  let email: string;
  let name: string;
  try {
    const body = await req.json();
    email = (body.email || '').trim().toLowerCase();
    name  = (body.name  || '').trim();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const token = signToken(email);
  return NextResponse.json({ token, customer_name: name || email, customer_email: email });
}
