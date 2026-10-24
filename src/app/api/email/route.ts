import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getWhiteLabelConfig, sendEmail, baseTemplate, abandonedCartTemplate, avecDesinscription } from '@/lib/email-send';
import { desinscription } from '@/lib/relance-panier';

export const dynamic = 'force-dynamic';
// Une campagne part dans cette requête : on se donne le maximum, et on
// s'arrête de soi-même avant (cf. BUDGET_MS) pour reprendre au clic suivant.
export const maxDuration = 300;

const BUDGET_MS = 240_000;
const EVT_ENVOI = 'campagne_envoyee';
const TAILLE_PAGE = 1000;   // plafond de lignes par requête Supabase

/** Toutes les lignes d'une requête, page par page (Supabase en rend 1000 au plus). */
async function toutes<T = any>(fabrique: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await fabrique().range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < TAILLE_PAGE) return out;
  }
}

const norm = (e: unknown) => String(e || '').trim().toLowerCase();
const STATUTS_PAYES = ['paid', 'confirmed', 'preparing', 'partial', 'shipped', 'delivered'];

/* ═══════════════════════════════════════════════════════════════
   DESTINATAIRES D'UNE CAMPAGNE — abonnés newsletter uniquement

   L'ancienne version écrivait à TOUTES les adresses de la table des
   commandes : brouillons jamais payés, commandes de test, désinscrits
   compris, sans lien de désinscription — et s'arrêtait en silence à
   1000 lignes. Règle de la boutique : une campagne ne part qu'aux
   inscrits à la newsletter, moins toute adresse opposée (désinscrit,
   plainte, adresse en échec définitif).
   ═══════════════════════════════════════════════════════════════ */
async function destinataires(segment: string): Promise<string[]> {
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

/** Adresses auxquelles un test de campagne peut partir : celles de la boutique et de l'admin connecté. */
function adressesAdmin(cfg: Record<string, string>, user: any): string[] {
  const nue = (s?: string) => { const m = String(s || '').match(/<([^>]+)>/); return norm(m ? m[1] : s); };
  return Array.from(new Set([user?.email, cfg.email, cfg.smtp_user, cfg.smtp_from, process.env.IMAP_USER, process.env.SMTP_FROM]
    .map(nue).filter(e => e.includes('@'))));
}

// ── TEMPLATES SPÉCIFIQUES À CE ROUTE ──────────────────────

function orderConfirmationTemplate(order: any, cfg: Record<string, any>) {
  const lines = (typeof order.lines === 'string' ? JSON.parse(order.lines) : order.lines || []);
  const linesHtml = lines.map((l: any) => `
    <div class="line"><span>${l.desc || l.name} × ${l.qty}</span><span>${((l.qty * l.price) || 0).toFixed(2)} €</span></div>`).join('');
  const contactEmail = cfg.email || '';
  const content = `
    <h1 class="title">Merci pour votre commande !</h1>
    <p class="text">Bonjour ${order.customer_name},</p>
    <p class="text">Nous avons bien reçu votre commande et nous la préparons avec soin. Vous recevrez un email dès qu'elle sera expédiée.</p>
    <div class="box">
      <div class="box-title">📦 Récapitulatif — ${order.order_number}</div>
      ${linesHtml}
      <hr class="divider">
      <div class="line"><span>Sous-total HT</span><span>${(order.subtotal || 0).toFixed(2)} €</span></div>
      <div class="line"><span>Livraison</span><span>${order.shipping > 0 ? order.shipping.toFixed(2) + ' €' : 'Offerte'}</span></div>
      <div class="line total"><span>Total TTC</span><span>${(order.total || 0).toFixed(2)} €</span></div>
    </div>
    <div class="box">
      <div class="box-title">📬 Livraison</div>
      <p style="font-size:14px;color:#1C2028;margin:0">${order.customer_address || 'Adresse non renseignée'}</p>
    </div>
    ${contactEmail ? `<p class="text">Des questions ? <a href="mailto:${contactEmail}" style="color:#3E4550">${contactEmail}</a></p>` : ''}
    <p class="text">Merci beaucoup ! 🎉</p>`;
  return baseTemplate(content, `Commande ${order.order_number} confirmée`, cfg);
}

function campaignTemplate(campaign: any, cfg: Record<string, any>) {
  const frontUrl = cfg.front_url || process.env.NEXT_PUBLIC_FRONT_URL || '';
  const content = campaign.content || `
    <h1 class="title">${campaign.name}</h1>
    <p class="text">Découvrez nos nouveautés et offres exclusives.</p>
    ${frontUrl ? `<div style="text-align:center"><a href="${frontUrl}" class="btn">Voir la boutique →</a></div>` : ''}`;
  return baseTemplate(content, campaign.subject || campaign.name, cfg);
}

// ── ROUTE HANDLERS ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const body = await req.json();
  const { type, smtp_override } = body;
  const dbCfg = await getWhiteLabelConfig();
  // Merge: form values passed by admin UI take priority over saved DB values (enables testing before saving)
  const cfg: Record<string, string> = { ...dbCfg };
  if (smtp_override) {
    for (const [k, v] of Object.entries(smtp_override as Record<string, string>)) {
      if (v) cfg[k] = v;
    }
  }
  const siteName = cfg.site_name || '';
  const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';

  try {
    // 1. Confirmation de commande
    if (type === 'order_confirmation') {
      const { order } = body;
      if (!order?.customer_email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });
      await sendEmail({
        from: fromEmail, to: order.customer_email,
        subject: `✅ Commande ${order.order_number} confirmée${siteName ? ` — ${siteName}` : ''}`,
        html: orderConfirmationTemplate(order, cfg),
      }, cfg);
      return NextResponse.json({ success: true });
    }

    // 2. Relance panier abandonné
    if (type === 'abandoned_cart') {
      const { cart_id, step } = body;
      const { data: cart } = await supabaseAdmin.from('abandoned_carts').select('*').eq('id', cart_id).single();
      if (!cart) return NextResponse.json({ error: 'Panier non trouvé' }, { status: 404 });
      const { html, subject } = abandonedCartTemplate(cart, step || 1, cfg);
      await sendEmail({ from: fromEmail, to: cart.customer_email, subject, html }, cfg);
      const updateField = `email_${step || 1}_sent_at`;
      await supabaseAdmin.from('abandoned_carts').update({ [updateField]: new Date().toISOString() }).eq('id', cart_id);
      return NextResponse.json({ success: true, message: `Relance J+${step === 1 ? 1 : step === 2 ? 3 : 7} envoyée` });
    }

    // 3. Envoi de campagne
    if (type === 'campaign') {
      const { campaign_id, custom_html } = body;
      const { data: campaign } = await supabaseAdmin.from('marketing_campaigns').select('*').eq('id', campaign_id).single();
      if (!campaign) return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 });

      const segment = campaign.target_segment || 'all';
      if (!['all', 'newsletter', 'new_customers'].includes(segment)) {
        return NextResponse.json({
          error: `Segment « ${segment} » non pris en charge : une campagne ne part qu’aux abonnés newsletter (tous, ou ceux qui ont commandé ces 30 derniers jours).`,
        }, { status: 400 });
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
        return NextResponse.json({ error: 'Un envoi de cette campagne est déjà en cours.' }, { status: 409 });
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
          return NextResponse.json({ error: 'Aucun abonné à la newsletter (hors désinscrits) pour ce segment.' }, { status: 400 });
        }
        if (!aFaire.length) {
          await liberer({ status: 'completed', sent_count: deja.size });
          return NextResponse.json({ error: `Tous les abonnés (${tous.length}) ont déjà reçu cette campagne.` }, { status: 400 });
        }

        let contentHtml = custom_html;
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
        let sent = 0;
        let interrompu = false;
        const echecs: string[] = [];
        for (const email of aFaire) {
          if (Date.now() - debut > BUDGET_MS) { interrompu = true; break; }
          const d = desinscription(email, 'newsletter');
          try {
            await sendEmail({
              from: fromEmail, to: email, subject: campaign.subject || campaign.name,
              html: avecDesinscription(contentHtml, d.url), tags: campaignTags, headers: d.headers,
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
        return NextResponse.json({
          success: restants === 0, sent, total: tous.length, deja: deja.size,
          restants, interrompu, echecs: echecs.slice(0, 20),
        });
      } catch (e) {
        // Le verrou ne doit pas rester posé : la campagne reste reprenable.
        await liberer({ status: 'paused' });
        throw e;
      }
    }

    // 4. Email test
    if (type === 'test') {
      const { to } = body;
      await sendEmail({
        from: fromEmail,
        to: to || cfg.email || fromEmail,
        subject: `✅ Test email${siteName ? ` — ${siteName}` : ''}`,
        html: baseTemplate('<h1 class="title">Email de test ✅</h1><p class="text">Votre configuration email fonctionne parfaitement !</p>', 'Test email', cfg),
      }, cfg);
      return NextResponse.json({ success: true, method: (cfg.smtp_host && cfg.smtp_pass) ? 'smtp' : 'resend' });
    }

    // 5. Test d'une campagne sur une adresse précise (sans envoyer aux clients)
    if (type === 'test_campaign') {
      const { html, subject: testSubject } = body;
      const to = norm(body.to);
      if (!to) return NextResponse.json({ error: 'Email de test requis' }, { status: 400 });
      if (!html) return NextResponse.json({ error: 'Contenu HTML requis' }, { status: 400 });
      /* Un test ne part qu'à la boutique ou à l'admin connecté : une
         faute de frappe ne doit pas envoyer un « [TEST] » à un client. */
      const permises = adressesAdmin(dbCfg, user);
      if (!permises.includes(to)) {
        return NextResponse.json({ error: `Le test ne part qu’à ton adresse ou à celle de la boutique : ${permises.join(', ') || 'aucune configurée'}` }, { status: 400 });
      }
      const d = desinscription(to, 'newsletter');
      await sendEmail({
        from: fromEmail,
        to,
        subject: `[TEST] ${testSubject || 'Aperçu campagne'}${siteName ? ` — ${siteName}` : ''}`,
        // Le test montre le pied de désinscription tel que les abonnés le recevront.
        html: avecDesinscription(html, d.url), headers: d.headers,
      }, cfg);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Type inconnu' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const cfg = await getWhiteLabelConfig();
  const fromEmail = (cfg as any).smtp_from || process.env.SMTP_FROM || '';
  return NextResponse.json({ configured: !!(cfg.smtp_host || process.env.RESEND_API_KEY), from: fromEmail });
}
