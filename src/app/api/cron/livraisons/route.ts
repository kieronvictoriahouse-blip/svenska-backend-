import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* ═══════════════════════════════════════════════════════════════
   SUIVI DES LIVRAISONS — demande au transporteur si le colis est arrivé

   Une commande expédiée ne redevenait jamais « livrée » toute seule :
   il fallait qu'un humain change le statut à la main. Personne ne le
   faisait, et 22 commandes dormaient en « expédiée » — donc aucune
   demande d'avis n'est jamais partie, puisqu'elle se déclenche sur
   « livrée ».

   Ce cron interroge UGO (is-delivered) pour chaque colis encore en
   transit, marque les arrivées, et prévient le client. Il tourne une
   fois par jour, à 17 h : le plan Vercel Hobby n'autorise qu'un cron
   quotidien — deux passages (11 h et 17 h) font rejeter le déploiement
   entier avec « cron_jobs_limits_reached », ce qui bloque aussi tout
   le reste du commit. Passer en Pro permettrait d'en remettre deux.

   « Livrée » = remis au client. Pour un point relais, c'est le RETRAIT
   par le client : Mondial Relay/UGO ne répond `success: true` qu'à ce
   moment-là. Le code 81 « Livraison au point relais » est notre dépôt au
   relais de départ (constaté sur SD-0146 le 26/09/2026), pas l'arrivée.
   L'avis « votre colis est disponible » (avec le code du casier) est
   envoyé au client par Mondial Relay lui-même : on lui transmet email et
   téléphone dans ship_to.

   Ce qu'il envoie :
     — point relais → rien : le client vient de retirer son colis.
     — domicile     → message de livraison classique.

   Les colis sans numéro de suivi sont ignorés : rien à demander au
   transporteur. Un colis en transit depuis plus de 60 jours est
   abandonné, pour ne pas interroger l'API indéfiniment.
   ═══════════════════════════════════════════════════════════════ */

const API_URL = process.env.LOGSPHER_API_URL || 'https://upelgo.com';
const UUID_DEFAUT = process.env.LOGSPHER_MR_UUID || 'b139ac1f-bbb9-4235-b87e-aedcb3c32132';
const ABANDON_JOURS = 60;

async function estLivre(carrierUuid: string, tracking: string) {
  const cle = process.env.LOGSPHER_API_KEY;
  if (!cle) throw new Error('LOGSPHER_API_KEY manquante');

  const res = await fetch(`${API_URL}/api/carrier/${carrierUuid}/is-delivered`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracking_number: tracking }),
  });
  const texte = await res.text();
  if (!res.ok) throw new Error(`is-delivered ${res.status}: ${texte.slice(0, 200)}`);

  let j: any = {};
  try { j = JSON.parse(texte); } catch { /* réponse illisible = pas de conclusion */ }
  return { livre: j?.success === true, date: dateIso(j?.date) };
}

/** « 2026-09-28 10:15 », « 28/09/2026 10:15:00 » → ISO. null si illisible
 *  ou date « vide » d'UGO (1970-01-01). Une date JJ/MM mal lue par Postgres
 *  ferait échouer la mise à jour du statut. */
function dateIso(brut: any): string | null {
  const s = String(brut || '').trim();
  if (!s || s.startsWith('1970')) return null;
  const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  const d = fr
    ? new Date(`${fr[3]}-${fr[2]}-${fr[1]}T${fr[4] || '12'}:${fr[5] || '00'}:${fr[6] || '00'}`)
    : new Date(s.replace(' ', 'T'));
  return Number.isNaN(+d) ? null : d.toISOString();
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const limite = new Date(Date.now() - ABANDON_JOURS * 86400_000).toISOString();

  /* ── 0. Rattrapage des étiquettes UGO jamais relues ───────────────
     Commandes point relais payées sans étiquette enregistrée : on demande
     à UGO (GET /api/order/reference) si un envoi a été généré depuis — cas
     typique : 402 réglé via le lien de paiement. Si oui, on remplit suivi
     + PDF et, si la commande est déjà expédiée, on envoie au client
     l'email de suivi qu'il n'a jamais eu. Les suivis ainsi récupérés sont
     vérifiés juste après (étape 1) : « colis arrivé au relais ». */
  const rattrapage = { verifiees: 0, rattachees: 0, emails: 0, echecs: [] as string[] };
  const { data: sansEtiquette } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('delivery_mode', 'mondial_relay')
    .is('logspher_label_url', null)
    .in('status', ['paid', 'confirmed', 'preparing', 'partial', 'shipped'])
    .gte('created_at', limite)
    .limit(80);
  const { attachExistingLogspherLabel } = await import('@/lib/logspher-sync');
  for (const o of ((sansEtiquette || []) as any[])) {
    if (o.is_test) continue;
    rattrapage.verifiees++;
    try {
      const r = await attachExistingLogspherLabel(o);
      if (r.attached) { rattrapage.rattachees++; if (r.emailed) rattrapage.emails++; }
    } catch (e: any) {
      rattrapage.echecs.push(`${o.order_number}: ${e?.message || e}`);
    }
  }

  const { data: enTransit, error } = await supabaseAdmin
    .from('orders')
    /* `*` plutot qu'une liste : `relay_carrier_uuid` n'existe qu'apres
       la migration 051, et nommer une colonne absente fait echouer la
       requete entiere en PostgREST. */
    .select('*')
    .eq('status', 'shipped')
    .gte('created_at', limite)
    .limit(80);

  if (error) {
    return NextResponse.json({ ok: false, erreur: error.message }, { status: 500 });
  }

  const rapport = { examinees: 0, sans_suivi: 0, livrees: 0, retires: 0, en_transit: 0, echecs: [] as string[] };

  for (const o of ((enTransit || []) as any[])) {
    const tracking = o.logspher_tracking || o.mondial_relay_tracking || o.tracking_number;
    if (!tracking) { rapport.sans_suivi++; continue; }
    rapport.examinees++;

    try {
      const { livre, date } = await estLivre(o.relay_carrier_uuid || UUID_DEFAUT, tracking);
      if (!livre) { rapport.en_transit++; continue; }

      await supabaseAdmin.from('orders')
        .update({ status: 'delivered', updated_at: date || new Date().toISOString() })
        .eq('id', o.id)
        .eq('status', 'shipped');   // ne rien écraser si le statut a bougé entre-temps

      rapport.livrees++;

      /* Point relais : le client vient de retirer son colis, il n'y a
         rien à lui annoncer (l'ancien « votre colis vous attend » partait
         ici, au moment du retrait — donc trop tard et à contresens).
         Domicile : message de livraison, comme avant. Un email raté ne doit
         pas empêcher le statut d'avancer. */
      const enRelais = !!(o.relay_point_name || o.relay_point_address) || o.delivery_mode === 'mondial_relay';
      if (enRelais) { rapport.retires++; continue; }
      if (o.customer_email) {
        try {
          const { expeditionEmail } = await import('@/lib/customer-emails');
          const { getWhiteLabelConfig, sendEmail } = await import('@/lib/email-send');
          const cfg = await getWhiteLabelConfig();
          const from = (cfg.email_from as string) || (cfg as any).smtp_from || '';
          const mail = await expeditionEmail({ ...o, tracking_number: tracking });
          await sendEmail({ from, to: o.customer_email, subject: mail.sujet, html: mail.html }, cfg);
        } catch (e: any) {
          rapport.echecs.push(`${o.order_number} email: ${e?.message || e}`);
        }
      }
    } catch (e: any) {
      rapport.echecs.push(`${o.order_number}: ${e?.message || e}`);
    }
  }

  return NextResponse.json({ ok: true, rattrapage_ugo: rattrapage, ...rapport });
}
