import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { evaluatePromo, PromoRefusal, PromoVerdict } from '@/lib/promo';
import {
  FIDELITE, STATUTS_PAYES, SorteCode, normEmail, motifEmail,
  finDuBonus, tauxFidelite, nouveauCode, memePersonne,
} from '@/lib/fidelite-regles';

/* ═══════════════════════════════════════════════════════════════
   FIDÉLITÉ & PARRAINAGE — APPLICATION AUX DONNÉES

   Les règles sont dans @/lib/fidelite-regles. Ici :
   · le verdict d'un code personnel, pour le panier et le checkout ;
   · ce qui se passe après un paiement (parrainage, création des codes) ;
   · la validation des parrainages, passé le délai de rétractation.

   Le client n'a pas de compte : il est reconnu par l'email de ses
   commandes payées. Ce qui le protège, c'est que ses codes n'arrivent
   que dans SA boîte mail, et que le code fidélité exige son email au
   panier — email que Stripe reprend sans permettre de le changer.
   ═══════════════════════════════════════════════════════════════ */

const alea = (n: number) => crypto.randomInt(n);

/**
 * Commandes payées de ce client. Les commandes de test ne comptent
 * que pour un email de test, pour pouvoir essayer le parcours sans
 * donner de statut à personne.
 */
export async function commandesPayees(email: string, o: { inclureTests?: boolean } = {}): Promise<number> {
  let q = supabaseAdmin.from('orders').select('id', { count: 'exact', head: true })
    .ilike('customer_email', motifEmail(email))
    .in('status', STATUTS_PAYES);
  if (!o.inclureTests) q = q.not('is_test', 'is', true);
  const { count } = await q;
  return count || 0;
}

/** Fin du −10 % du propriétaire d'un code fidélité ; null s'il n'a
 *  encore parrainé personne. */
export async function finBonusDe(email: string, fideleDepuis: string): Promise<Date | null> {
  const { data } = await supabaseAdmin.from('referrals').select('validated_at')
    .ilike('referrer_email', motifEmail(email))
    .eq('status', 'validated')
    .order('validated_at', { ascending: false })
    .limit(1);
  return finDuBonus(data?.[0]?.validated_at, fideleDepuis);
}

/** Taux réel d'un code personnel. Jamais lu dans `value` : celui du code
 *  fidélité dépend des parrainages validés, qui changent sans lui. */
export async function tauxDuCode(promo: any): Promise<number> {
  if (promo.kind === 'parrainage') return FIDELITE.tauxFilleul;
  return tauxFidelite(await finBonusDe(promo.owner_email, promo.created_at));
}

async function refusCodePerso(promo: any, email?: string): Promise<PromoRefusal | null> {
  const e = normEmail(email);
  if (!e) return 'email_required';
  const proprio = normEmail(promo.owner_email);
  if (promo.kind === 'fidelite') return e === proprio ? null : 'not_owner';

  // Code ami : réservé à quelqu'un qui n'a jamais commandé ni été parrainé.
  if (e === proprio) return 'own_code';
  if (await commandesPayees(e)) return 'not_new_customer';
  const { data: deja } = await supabaseAdmin.from('referrals').select('id')
    .ilike('referee_email', motifEmail(e)).limit(1);
  return deja?.length ? 'not_new_customer' : null;
}

/**
 * Verdict d'un code personnel — même forme que evaluatePromo, pour que
 * le panier et le checkout le traitent comme n'importe quel code.
 * `base` : le montant des articles qui ne sont pas déjà en promotion.
 */
export async function evaluerCodePerso(
  promo: any, ctx: { email?: string; base: number },
): Promise<PromoVerdict & { taux?: number }> {
  const refus = await refusCodePerso(promo, ctx.email);
  if (refus) return { ok: false, reason: refus, minOrder: 0 };
  const taux = await tauxDuCode(promo);
  const verdict = evaluatePromo(
    { ...promo, type: 'percent', value: taux, min_order: 0 },
    { subtotal: ctx.base },
  );
  if (!verdict.ok) return verdict;
  if (verdict.discount <= 0) return { ok: false, reason: 'only_promo_items', minOrder: 0 };
  return { ...verdict, taux };
}

/** Le code de cette sorte du client, créé s'il n'existe pas encore. */
async function codeDe(email: string, sorte: SorteCode, nom?: string | null) {
  const lire = async () => (await supabaseAdmin.from('promo_codes').select('*')
    .eq('kind', sorte).ilike('owner_email', motifEmail(email)).limit(1)).data?.[0] || null;

  const existant = await lire();
  if (existant) return { code: existant, cree: false };

  for (let essai = 0; essai < 5; essai++) {
    const { data, error } = await supabaseAdmin.from('promo_codes').insert({
      code: nouveauCode(sorte, nom, alea),
      type: 'percent',
      // Affichage seulement : le taux appliqué vient de tauxDuCode.
      value: sorte === 'parrainage' ? FIDELITE.tauxFilleul : FIDELITE.tauxFidele,
      min_order: 0,
      is_active: true,
      single_use_per_customer: false,
      kind: sorte,
      owner_email: normEmail(email),
    }).select().single();
    if (!error && data) return { code: data, cree: true };
    /* Refus d'unicité : soit le code tiré existe déjà (on retire), soit
       un événement concurrent vient de créer celui du client. */
    const entre = await lire();
    if (entre) return { code: entre, cree: false };
  }
  console.error('[fidelite] code non créé', sorte, email);
  return null;
}

/** Le code ami utilisé pour cette commande devient un parrainage, sauf
 *  si l'on voit que le « nouveau client » n'en est pas un. */
async function enregistrerParrainage(p: {
  orderId: string; email: string; nom?: string | null; telephone?: string | null;
  promoCode: string; estTest?: boolean;
}) {
  const { data: promo } = await supabaseAdmin.from('promo_codes')
    .select('id, kind, owner_email').eq('code', p.promoCode.toUpperCase().trim()).maybeSingle();
  if (promo?.kind !== 'parrainage') return;
  const parrain = normEmail(promo.owner_email);

  /* Revérifié sur ce que Stripe a réellement encaissé : le panier a pu
     être contourné, et un « ami » peut être le parrain lui-même. */
  let raison: string | null = null;
  if (parrain === p.email) raison = 'propre_code';
  else if (await commandesPayees(p.email, { inclureTests: p.estTest }) > 1) raison = 'deja_client';
  else {
    const { data: siennes } = await supabaseAdmin.from('orders')
      .select('customer_name, customer_phone')
      .ilike('customer_email', motifEmail(parrain))
      .in('status', STATUTS_PAYES)
      .limit(50);
    const filleul = { nom: p.nom, telephone: p.telephone };
    if ((siennes || []).some(o => memePersonne(filleul, { nom: o.customer_name, telephone: o.customer_phone }))) {
      raison = 'meme_personne';
    }
  }

  const { error } = await supabaseAdmin.from('referrals').insert({
    referrer_email: parrain,
    referee_email: p.email,
    order_id: p.orderId,
    promo_code_id: promo.id,
    status: raison ? 'cancelled' : 'pending',
    cancel_reason: raison,
  });
  // Déjà parrainé : l'index unique refuse, et c'est voulu.
  if (error && error.code !== '23505') console.error('[fidelite] parrainage non enregistré', error.message);
}

export type BilanFidelite = {
  commandes: number;
  codeAmi: string | null;
  codeFidelite: string | null;
  /** Taux du code fidélité aujourd'hui (0 sans code). */
  taux: number;
  finBonus: Date | null;
  /** Le code fidélité vient d'être créé par cette commande. */
  nouveauFidele: boolean;
};

/**
 * Après un paiement : parrainage éventuel, codes mérités, et de quoi les
 * annoncer dans la confirmation. Appelé par le webhook Stripe une seule
 * fois par commande — la prise du statut « paid » l'en garantit.
 */
export async function apresPaiement(p: {
  orderId: string; email: string; nom?: string | null; telephone?: string | null;
  promoCode?: string | null; estTest?: boolean;
}): Promise<BilanFidelite> {
  const email = normEmail(p.email);
  if (p.promoCode) {
    try { await enregistrerParrainage({ ...p, email, promoCode: p.promoCode }); }
    catch (e) { console.error('[fidelite] parrainage (non bloquant):', e); }
  }

  const commandes = await commandesPayees(email, { inclureTests: p.estTest });
  const ami = commandes >= 1 ? await codeDe(email, 'parrainage', p.nom) : null;
  const fid = commandes >= FIDELITE.seuilCommandes ? await codeDe(email, 'fidelite', p.nom) : null;
  const finBonus = fid ? await finBonusDe(email, fid.code.created_at) : null;

  return {
    commandes,
    codeAmi: ami?.code.code || null,
    codeFidelite: fid?.code.code || null,
    taux: fid ? tauxFidelite(finBonus) : 0,
    finBonus,
    nouveauFidele: !!fid?.cree,
  };
}

/**
 * Passage quotidien : les parrainages en attente depuis plus de 14 jours
 * sont validés si la commande de l'ami tient toujours, annulés sinon.
 * Le parrain reçoit un email à chaque parrainage validé.
 */
export async function validerParrainages(maintenant: Date = new Date()): Promise<string[]> {
  const limite = new Date(maintenant.getTime() - FIDELITE.delaiValidationJours * 86400_000).toISOString();
  const { data } = await supabaseAdmin.from('referrals')
    .select('id, referrer_email, order_id')
    .eq('status', 'pending').lt('created_at', limite)
    .order('created_at').limit(200);

  const journal: string[] = [];
  for (const r of data || []) {
    const { data: o } = await supabaseAdmin.from('orders').select('status').eq('id', r.order_id).maybeSingle();
    const tient = !!o && STATUTS_PAYES.includes(o.status);
    const { data: pris } = await supabaseAdmin.from('referrals')
      .update(tient
        ? { status: 'validated', validated_at: maintenant.toISOString() }
        : { status: 'cancelled', cancel_reason: 'commande_annulee' })
      .eq('id', r.id).eq('status', 'pending')
      .select('id');
    if (!pris?.length) continue; // traité entre-temps (back-office)
    journal.push(`${r.id} ${tient ? 'validé' : 'annulé (commande ' + (o?.status || 'introuvable') + ')'}`);
    if (!tient) continue;
    try { await annoncerParrainage(r.referrer_email); }
    catch (e) { journal.push(`  email non envoyé à ${r.referrer_email} : ${e instanceof Error ? e.message : e}`); }
  }
  return journal;
}

/** « Votre ami a commandé » — au parrain, dans la langue de sa dernière commande. */
async function annoncerParrainage(parrainEmail: string) {
  const email = normEmail(parrainEmail);
  const [{ data: commandes }, { data: fid }] = await Promise.all([
    supabaseAdmin.from('orders').select('*')
      .ilike('customer_email', motifEmail(email)).in('status', STATUTS_PAYES)
      .order('created_at', { ascending: false }).limit(1),
    supabaseAdmin.from('promo_codes').select('code, kind, created_at')
      .ilike('owner_email', motifEmail(email)).not('kind', 'is', null),
  ]);
  const derniere = commandes?.[0];
  if (!derniere) return;
  const codeAmi = (fid || []).find(c => c.kind === 'parrainage');
  let codeFid = (fid || []).find(c => c.kind === 'fidelite');
  const nb = await commandesPayees(email);
  /* Client fidèle d'avant le programme : son code fidélité n'a pas encore
     été créé (il l'est à la commande suivante). Son parrainage le lui donne. */
  if (!codeFid && nb >= FIDELITE.seuilCommandes) {
    codeFid = (await codeDe(email, 'fidelite', derniere.customer_name))?.code;
  }

  const [{ parrainageValideEmail }, { getWlConfig }, { sendEmail }] = await Promise.all([
    import('@/lib/customer-emails'), import('@/lib/mailer'), import('@/lib/email-send'),
  ]);
  const mail = await parrainageValideEmail(derniere, {
    codeFidelite: codeFid?.code || null,
    finBonus: codeFid ? await finBonusDe(email, codeFid.created_at) : null,
    codeAmi: codeAmi?.code || null,
    commandesRestantes: Math.max(0, FIDELITE.seuilCommandes - nb),
  });
  const cfg = await getWlConfig();
  await sendEmail({
    from: cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '',
    to: email,
    subject: mail.sujet,
    html: mail.html,
  }, cfg);
}
