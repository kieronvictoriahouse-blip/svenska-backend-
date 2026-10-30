import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { evaluatePromo, PromoRefusal } from '@/lib/promo';
import { boutiqueDeRequete } from '@/lib/boutique';

/**
 * Validation publique d'UN code promo, pour l'affichage panier.
 *
 * Remplace l'ancien appel front à `/api/marketing?tab=promo`, qui renvoyait
 * la liste complète des codes (y compris inactifs) à qui la demandait.
 * Ici on ne répond que sur le code fourni, et on n'expose jamais
 * `used_count`, `max_uses`, `is_active` ni les identifiants internes.
 *
 * ⚠️ Réponse indicative : le montant réellement facturé est recalculé par
 * `/api/checkout`, qui refait toutes ces vérifications.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const refuse = (reason: PromoRefusal, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ valid: false, reason, ...extra }, { headers: CORS });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));

  const code = String(body?.code || '').trim().toUpperCase();
  const subtotal = Number(body?.subtotal) || 0;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  // Part du panier hors articles déjà en promotion (codes personnels).
  const base = typeof body?.base === 'number' && Number.isFinite(body.base) ? body.base : subtotal;

  if (!code || code.length > 64) return refuse('invalid');

  // select('*') : seule la réponse ci-dessous est publique, et elle est filtrée.
  // Un code ne vaut que dans la boutique qui l'a créé.
  const { data: promo, error } = await supabaseAdmin
    .from('promo_codes')
    .select('*')
    .eq('code', code)
    .eq('boutique_id', boutiqueDeRequete(req))
    .maybeSingle();

  if (error || !promo) return refuse('invalid');

  /* Code fidélité ou code ami : réservé à un email (cf. @/lib/fidelite).
     On ne renvoie jamais à qui il appartient. */
  if (promo.kind) {
    const { evaluerCodePerso } = await import('@/lib/fidelite');
    const verdict = await evaluerCodePerso(promo, { email, base });
    if (!verdict.ok) return refuse(verdict.reason);
    return NextResponse.json({
      valid: true,
      code:  promo.code,
      type:  'percent',
      value: verdict.taux,
      min_order: 0,
      discount: verdict.discount,
      kind: promo.kind,
      hors_promo: true,
    }, { headers: CORS });
  }

  // Usage client vérifié avant l'évaluation : une seule requête, seulement si utile
  let alreadyUsedByCustomer = false;
  if (promo.single_use_per_customer && email) {
    const { data: used } = await supabaseAdmin
      .from('promo_code_usages')
      .select('id')
      .eq('promo_code_id', promo.id)
      .eq('customer_email', email)
      .maybeSingle();
    alreadyUsedByCustomer = !!used;
  }

  const verdict = evaluatePromo(promo, { subtotal, alreadyUsedByCustomer });
  if (!verdict.ok) return refuse(verdict.reason, { min_order: verdict.minOrder });

  return NextResponse.json({
    valid: true,
    code:  promo.code,
    type:  promo.type,
    value: Number(promo.value) || 0,
    min_order: Number(promo.min_order) || 0,
    discount: verdict.discount,
  }, { headers: CORS });
}
