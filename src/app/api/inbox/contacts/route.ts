import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/* Carnet d'adresses de la rédaction : clients, fournisseurs, et les
   adresses vues passer dans la boîte. Évite de retaper une adresse
   qu'on a déjà quelque part. */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const [contacts, commandes, recus] = await Promise.all([
    supabaseAdmin.from('contacts').select('name, email, type').not('email', 'is', null).limit(500),
    supabaseAdmin.from('orders').select('customer_name, customer_email')
      .not('customer_email', 'is', null).order('created_at', { ascending: false }).limit(300),
    supabaseAdmin.from('inbox_messages').select('from_name, from_email')
      .not('from_email', 'is', null).order('sent_at', { ascending: false }).limit(300),
  ]);

  const carnet = new Map<string, { email: string; nom: string; type: string }>();
  const ajoute = (email?: string | null, nom?: string | null, type = 'contact') => {
    const e = String(email || '').trim().toLowerCase();
    if (!e || !e.includes('@')) return;
    if (carnet.has(e)) return;                 // la première source gagne
    carnet.set(e, { email: e, nom: String(nom || '').trim(), type });
  };

  for (const c of contacts.data || []) ajoute(c.email, c.name, c.type === 'supplier' ? 'fournisseur' : 'client');
  for (const o of commandes.data || []) ajoute(o.customer_email, o.customer_name, 'client');
  for (const m of recus.data || []) ajoute(m.from_email, m.from_name, 'reçu');

  return NextResponse.json({ carnet: Array.from(carnet.values()) });
}
