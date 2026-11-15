import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail, baseTemplate, avecDesinscription } from '@/lib/email-send';
import { desinscription } from '@/lib/relance-panier';

/* ═══════════════════════════════════════════════════════════════
   ENVOI D'UNE CAMPAGNE EMAIL — logique unique

   Extrait de /api/email (15/11/2026) pour servir aussi au cron des
   campagnes programmées (/api/cron/campagnes). Verrou anti double envoi,
   reprise sans doublon (email_events), lien de désinscription signé,
   budget de temps : rien de changé, seulement déplacé.
   ═══════════════════════════════════════════════════════════════ */

const BUDGET_MS = 240_000;
const EVT_ENVOI = 'campagne_envoyee';
const TAILLE_PAGE = 1000;   // plafond de lignes par requête Supabase

/** Toutes les lignes d'une requête, page par page (Supabase en rend 1000 au plus). */
export async function toutes<T = any>(fabrique: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await fabrique().range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < TAILLE_PAGE) return out;
  }
}

export const norm = (e: unknown) => String(e || '').trim().toLowerCase();
export const STATUTS_PAYES = ['paid', 'confirmed', 'preparing', 'partial', 'shipped', 'delivered'];

/* ═══════════════════════════════════════════════════════════════
   DESTINATAIRES D'UNE CAMPAGNE — abonnés newsletter uniquement

   L'ancienne version écrivait à TOUTES les adresses de la table des
   commandes : brouillons jamais payés, commandes de test, désinscrits
   compris, sans lien de désinscription — et s'arrêtait en silence à
   1000 lignes. Règle de la boutique : une campagne ne part qu'aux
   inscrits à la newsletter, moins toute adresse opposée (désinscrit,
   plainte, adresse en échec définitif).
   ═══════════════════════════════════════════════════════════════ */
export async function destinataires(segment: string): Promise<string[]> {
  /* « clients » : toute personne ayant PAYÉ une commande sur le site
     (prospection de produits analogues auprès de ses clients, art.
     L34-5 CPCE). Hors commandes de test et ventes de la caisse, hors
     adresses de la boutique, moins toute opposition. Chaque email porte
     le lien de désinscription en un clic, avec la raison « vous avez
     commandé chez nous ». */
  if (segment === 'clients') {
    const cmd = await toutes(() => supabaseAdmin.from('orders').select('customer_email, is_test, notes')
      .in('status', STATUTS_PAYES).not('customer_email', 'is', null));
    const clients = new Set(cmd
      .filter((o: any) => !o.is_test && !/^\[CAISSE\]/.test(o.notes || ''))
      .map((o: any) => norm(o.customer_email))
      .filter(e => e.includes('@') && !e.endsWith('@swedishcravings.fr')));
    const opposes = await toutes(() => supabaseAdmin.from('email_optouts').select('email'));
    const non = new Set(opposes.map((o: any) => norm(o.email)));
    return Array.from(clients).filter(e => !non.has(e));
  }

  const abonnes = await toutes(() => supabaseAdmin.from('contacts')
    .select('email, is_active')
    .or('tags.cs.{newsletter},company.eq."Inscrit newsletter"')
    .not('email', 'is', null)
    .order('created_at', { ascending: true }));
  let emails = new Set(abonnes.filter((c: any) => c.is_active !== false).map((c: any) => norm(c.email)).filter(e => e.includes('@')));

  if (segment === 'new_customers') {
    // Abonnés ayant payé une commande ces 30 derniers jours.
    const depuis = new Date(Date.now() - 30 * 86400_000).toISOString();
    const cmd = await toutes(() => supabaseAdmin.from('orders').select('customer_email')
      .in('status', STATUTS_PAYES).gte('created_at', depuis).not('customer_email', 'is', null));
    const recents = new Set(cmd.map((o: any) => norm(o.customer_email)));
    emails = new Set(Array.from(emails).filter(e => recents.has(e)));
  }

  const opposes = await toutes(() => supabaseAdmin.from('email_optouts').select('email'));
  const non = new Set(opposes.map((o: any) => norm(o.email)));
  return Array.from(emails).filter(e => !non.has(e));
}


function campaignTemplate(campaign: any, cfg: Record<string, any>) {
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const content = campaign.content || `
    <h1 class="title">${campaign.name}</h1>
    <p class="text">Découvrez nos nouveautés et offres exclusives.</p>
    ${frontUrl ? `<div style="text-align:center"><a href="${frontUrl}" class="btn">Voir la boutique →</a></div>` : ''}`;
  return baseTemplate(content, campaign.subject || campaign.name, cfg);
}


export async function envoyerCampagne(
  { campaign_id, custom_html, cfg, fromEmail }:
  { campaign_id: string; custom_html?: string; cfg: Record<string, string>; fromEmail: string },
): Promise<{ status: number; body: Record<string, any> }> {
  const { data: campaign } = await supabaseAdmin.from('marketing_campaigns').select('*').eq('id', campaign_id).single();
  if (!campaign) return { status: 404, body: { error: 'Campagne non trouvée' } };

  const segment = campaign.target_segment || 'all';
  if (!['all', 'newsletter', 'new_customers', 'clients'].includes(segment)) {
    return { status: 400, body: {
      error: `Segment « ${segment} » non pris en charge : une campagne ne part qu’aux abonnés newsletter (tous, ou ceux qui ont commandé ces 30 derniers jours) ou aux clients ayant déjà commandé.`,
    } };
  }

  /* Verrou : un double clic, ou un nouveau clic pendant qu'un envoi
     tourne encore, n'envoie pas deux fois. Un envoi resté « sending »
     plus de 10 min (fonction coupée par Vercel) peut être repris. */
  const perime = new Date(Date.now() - 10 * 60_000).toISOString();
  const statutAvant = campaign.status || 'draft';
  const { data: pris } = await supabaseAdmin.from('marketing_campaigns')
    .update({ status: 'sending', started_at: new Date().toISOString() })
    .eq('id', campaign_id)
    .or(`status.is.null,status.neq.sending,started_at.is.null,started_at.lt."${perime}"`)
    .select('id');
  if (!pris?.length) {
    return { status: 409, body: { error: 'Un envoi de cette campagne est déjà en cours.' } };
  }
  const liberer = (patch: Record<string, any>) => supabaseAdmin.from('marketing_campaigns')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', campaign_id);

  try {
    const tous = await destinataires(segment);
    /* Reprise : qui l'a déjà reçue ne la reçoit pas une 2e fois — un
       envoi interrompu (délai Vercel, panne SMTP) se termine au clic
       suivant au lieu de repartir de zéro chez tout le monde. */
    const deja = new Set((await toutes(() => supabaseAdmin.from('email_events').select('to_email')
      .eq('campaign_id', campaign_id).eq('event_type', EVT_ENVOI))).map((e: any) => norm(e.to_email)));
    const aFaire = tous.filter(e => !deja.has(e));

    if (!tous.length) {
      await liberer({ status: statutAvant });
      return { status: 400, body: { error: segment === 'clients' ? 'Aucun client (hors désinscrits) pour ce segment.' : 'Aucun abonné à la newsletter (hors désinscrits) pour ce segment.' } };
    }
    if (!aFaire.length) {
      await liberer({ status: 'completed', sent_count: deja.size });
      return { status: 400, body: { error: `Tous les abonnés (${tous.length}) ont déjà reçu cette campagne.` } };
    }

    let contentHtml: string = custom_html || "";
    if (!contentHtml) {
      const rawContent = campaign.content || '';
      try {
        const parsed = JSON.parse(rawContent);
        contentHtml = parsed.html || campaignTemplate(campaign, cfg);
      } catch {
        contentHtml = rawContent || campaignTemplate(campaign, cfg);
      }
    }

    /* Cadence : Resend limite à 2 requêtes/s par défaut — au-delà,
       ses 429 étaient avalés et l'adresse sautée sans que personne
       le sache. Le SMTP est de toute façon plus lent. */
    const viaResend = !(cfg.smtp_host && cfg.smtp_user && cfg.smtp_pass);
    const pause = viaResend ? 600 : 150;
    const debut = Date.now();
    const campaignTags = [{ name: 'campaign_id', value: campaign_id }];
    const raisonPied = segment === 'clients'
      ? 'Vous recevez cet email car vous avez passé commande sur Swedish Cravings.' : undefined;
    let sent = 0;
    let interrompu = false;
    const echecs: string[] = [];
    for (const email of aFaire) {
      if (Date.now() - debut > BUDGET_MS) { interrompu = true; break; }
      const d = desinscription(email, 'newsletter');
      try {
        await sendEmail({
          from: fromEmail, to: email, subject: campaign.subject || campaign.name,
          html: avecDesinscription(contentHtml, d.url, raisonPied), tags: campaignTags, headers: d.headers,
        }, cfg);
        sent++;
        const { error: eLog } = await supabaseAdmin.from('email_events')
          .insert({ campaign_id, to_email: email, event_type: EVT_ENVOI });
        if (eLog) console.error('[campagne] envoi non journalisé', email, eLog.message);
      } catch (e: any) {
        echecs.push(`${email} : ${e?.message || 'erreur'}`);
      }
      await new Promise(r => setTimeout(r, pause));
    }

    const restants = aFaire.length - sent;
    await liberer({
      status: restants > 0 ? 'paused' : 'completed',
      sent_count: deja.size + sent,
      ...(restants > 0 ? {} : { ended_at: new Date().toISOString() }),
    });
    if (echecs.length) console.error('[campagne] envois en échec :', echecs);
    return { status: 200, body: {
      success: restants === 0, sent, total: tous.length, deja: deja.size,
      restants, interrompu, echecs: echecs.slice(0, 20),
    } };
  } catch (e) {
    // Le verrou ne doit pas rester posé : la campagne reste reprenable.
    await liberer({ status: 'paused' });
    throw e;
  }
}
