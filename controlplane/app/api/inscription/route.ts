import { NextRequest, NextResponse } from 'next/server';
import { cp } from '../../../lib/cp-db';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   INSCRIPTION — le début du tunnel

   Valide, enregistre le prospect, puis l'envoie payer chez Stripe
   Billing. Le provisionnement ne démarre JAMAIS ici : il démarre au
   webhook `checkout.session.completed` — on ne fabrique pas une
   boutique pour quelqu'un qui a fermé l'onglet de paiement.

   Sans STRIPE_SECRET_KEY (développement), le paiement est court-
   circuité : client « paye » directement et instance mise en file —
   le tunnel se teste sans compte Stripe.
   ═══════════════════════════════════════════════════════════════ */

const luhnSiren = (s: string) => {
  const d = s.replace(/\D/g, '');
  if (d.length !== 9) return false;
  let somme = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(d[8 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    somme += n;
  }
  return somme % 10 === 0;
};

export async function POST(req: NextRequest) {
  const corps = await req.json().catch(() => ({} as any));
  const email = String(corps.email || '').trim().toLowerCase();
  const nom = String(corps.nom_boutique || '').trim();
  const siren = String(corps.siren || '').replace(/\D/g, '');
  const sousDomaine = String(corps.sous_domaine || '').trim().toLowerCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Email invalide' }, { status: 422 });
  if (nom.length < 2) return NextResponse.json({ error: 'Nom de boutique requis' }, { status: 422 });
  if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(sousDomaine)) {
    return NextResponse.json({ error: 'Sous-domaine invalide (a-z, 0-9, tirets, 3 à 41 caractères)' }, { status: 422 });
  }
  if (siren && !luhnSiren(siren)) return NextResponse.json({ error: 'SIREN invalide (clé de contrôle)' }, { status: 422 });

  /* Unicité du sous-domaine AVANT paiement : personne ne paie pour
     découvrir que son adresse est prise. */
  const { data: pris } = await cp.from('cp_clients').select('id').eq('sous_domaine', sousDomaine).limit(1);
  if (pris && pris.length) return NextResponse.json({ error: 'Ce sous-domaine est déjà pris' }, { status: 409 });

  const { data: client, error } = await cp.from('cp_clients')
    .upsert({ email, nom_boutique: nom, siren: siren || null, sous_domaine: sousDomaine }, { onConflict: 'email' })
    .select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  /* ── Paiement ─────────────────────────────────────────────────── */
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID) {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: { trial_period_days: 14 },
      success_url: `${process.env.CP_URL || ''}/merci?client=${client.id}`,
      cancel_url: `${process.env.CP_URL || ''}/?annule=1`,
      metadata: { client_id: client.id },
    });
    return NextResponse.json({ url: session.url });
  }

  /* Mode développement : pas de Stripe → en file directement. */
  await cp.from('cp_clients').update({ statut: 'paye' }).eq('id', client.id);
  const { data: inst } = await cp.from('cp_instances')
    .insert({ client_id: client.id }).select().single();
  return NextResponse.json({ dev: true, instance_id: inst?.id, message: 'Sans Stripe configuré : instance mise en file directement.' });
}
