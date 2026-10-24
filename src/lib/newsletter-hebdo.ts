import { supabaseAdmin } from '@/lib/supabase';
import { getWhiteLabelConfig, envoyeurGroupe } from '@/lib/email-send';
import { renderEmail, contexteMarque, sujetPersonnalise } from '@/lib/email-templates';
import { disponiblesPour } from '@/lib/reserve';
import { isDiscountActive, resolveDiscount, effectiveUnitPrice } from '@/lib/product-price';
import { formatEuro } from '@/lib/emails-i18n';
import { desinscription, lundiDe } from '@/lib/relance-panier';
import { slugProduit, imageProduit } from '@/lib/url-fiche';
import type { LangueClient } from '@/lib/langue-client';

/* ═══════════════════════════════════════════════════════════════
   NEWSLETTER HEBDOMADAIRE (migration 064)

   Mercredi : la lettre de la semaine est composée et son aperçu part à
   la boutique. Jeudi ~10 h : elle part aux inscrits à la newsletter,
   moins les adresses opposées — sauf si elle a été annulée dans
   Marketing → Newsletter. Un envoi interrompu reprend le lendemain
   (une ligne par destinataire dans newsletter_hebdo_envois).

   Contenu, dans cet ordre : promos en cours, nouveautés, retours en
   stock, puis une box et un rituel. Une semaine sans rien de neuf, les
   best-sellers prennent la place : la lettre part quand même (choix de
   la boutique, 24/10/2026).
   ═══════════════════════════════════════════════════════════════ */

const HOME = ['art-de-la-table', 'maison-deco'];
const PAR_SECTION = 4;
const BUDGET_MS = 250_000;

export type Contenu = {
  promos: string[]; nouveautes: string[]; retours: string[]; best: string[];
  box: string | null; rituel: number;
};

/* Rituels et recettes du site, un par semaine à tour de rôle. */
const RITUELS: Array<{ url: string } & Record<LangueClient, { t: string; x: string }>> = [
  { url: '/recette-fredagsmys-tacos',
    fr: { t: 'Fredagsmys : les tacos du vendredi', x: 'Le vendredi soir, en Suède, on dîne de tacos devant un film, en famille. Notre recette, avec les épices Santa Maria.' },
    en: { t: 'Fredagsmys: Friday tacos', x: 'On Friday nights, Swedes have tacos in front of a film with the family. Our recipe, with Santa Maria spices.' },
    sv: { t: 'Fredagsmys: fredagstacos', x: 'På fredagskvällen äter svenskarna tacos framför en film med familjen. Vårt recept, med kryddor från Santa Maria.' } },
  { url: '/recette-kanelbullar',
    fr: { t: 'Kanelbullar, les brioches à la cannelle', x: 'La reine de la fika, à faire le week-end : la recette pas à pas, avec le sucre perlé suédois.' },
    en: { t: 'Kanelbullar, cinnamon buns', x: 'The queen of fika, for a weekend bake: the step-by-step recipe, with Swedish pearl sugar.' },
    sv: { t: 'Kanelbullar', x: 'Fikans drottning, perfekt att baka i helgen: receptet steg för steg, med pärlsocker.' } },
  { url: '/recette-dip-suedois',
    fr: { t: 'Le dip suédois de l’apéro', x: 'Un sachet, 20 cl de crème fraîche, 30 minutes au frais : la sauce que l’on sert avec les chips partout en Suède.' },
    en: { t: 'The Swedish party dip', x: 'One sachet, 200 ml of crème fraîche, 30 minutes in the fridge: the dip served with crisps all over Sweden.' },
    sv: { t: 'Den svenska dippen', x: 'En påse, 2 dl crème fraiche, 30 minuter i kylen: dippen som serveras till chips i hela Sverige.' } },
  { url: '/recette-entrecote-cafe-de-paris',
    fr: { t: 'L’entrecôte sauce Café de Paris', x: 'Le classique des restaurants suédois, à refaire chez soi avec la sauce Blå Band.' },
    en: { t: 'Steak with Café de Paris sauce', x: 'A Swedish restaurant classic to make at home, with Blå Band sauce.' },
    sv: { t: 'Entrecôte med Café de Paris', x: 'En klassiker från svenska restauranger att laga hemma, med Blå Band-såsen.' } },
];

const TXT: Record<LangueClient, {
  surtitre: string; mois: string;
  promos: [string, string]; nouveautes: [string, string]; retours: [string, string]; defaut: [string, string];
  sujetPromo: (pct: number) => string; sujetNouveau: (n: string) => string; sujetRetour: (n: string) => string; sujetDefaut: (r: string) => string;
  bandeau: (jeudi: string, url: string) => string;
}> = {
  fr: {
    surtitre: 'LA SÉLECTION DE LA SEMAINE', mois: 'fr-FR',
    promos: ['Les promos de la semaine', 'Cette semaine, des douceurs suédoises à plus petit prix — jusqu’à la fin de l’offre ou de notre stock.'],
    nouveautes: ['Du nouveau à l’épicerie', 'De nouvelles saveurs suédoises viennent d’arriver à l’atelier.'],
    retours: ['Ils sont de retour', 'Vous les attendiez : ils sont de nouveau en stock.'],
    defaut: ['Cette semaine en Suède', 'Les favoris de nos clients, une box à offrir et un rituel suédois pour le week-end.'],
    sujetPromo: pct => pct > 0 ? `Les promos de la semaine : jusqu’à −${pct} %` : 'Les promos de la semaine',
    sujetNouveau: n => `Nouveau à l’épicerie : ${n}`,
    sujetRetour: n => `De retour en stock : ${n}`,
    sujetDefaut: r => `Cette semaine : ${r}`,
    bandeau: (jeudi, url) => `<strong>Aperçu</strong> — cette newsletter partira ${jeudi} vers 10 h aux inscrits. Pour l’annuler ou la modifier : <a href="${url}" style="color:#E3C98C;">back-office → Marketing → Newsletter</a>.`,
  },
  en: {
    surtitre: "THIS WEEK'S SELECTION", mois: 'en-GB',
    promos: ["This week's offers", 'A few Swedish treats at a smaller price this week — until the offer ends or stocks run out.'],
    nouveautes: ['New in the shop', 'New Swedish flavours have just arrived at the workshop.'],
    retours: ["They're back", "You've been waiting for them: they're back in stock."],
    defaut: ['This week in Sweden', "Our customers' favourites, a box to give and a Swedish ritual for the weekend."],
    sujetPromo: pct => pct > 0 ? `This week's offers: up to −${pct}%` : "This week's offers",
    sujetNouveau: n => `New in: ${n}`,
    sujetRetour: n => `Back in stock: ${n}`,
    sujetDefaut: r => `This week: ${r}`,
    bandeau: (jeudi, url) => `<strong>Preview</strong> — this newsletter goes out ${jeudi} around 10 am. To cancel it: <a href="${url}" style="color:#E3C98C;">back office → Marketing → Newsletter</a>.`,
  },
  sv: {
    surtitre: 'VECKANS URVAL', mois: 'sv-SE',
    promos: ['Veckans erbjudanden', 'Den här veckan finns några svenska godsaker till lägre pris — så länge erbjudandet gäller eller lagret räcker.'],
    nouveautes: ['Nytt i butiken', 'Nya svenska smaker har just kommit till ateljén.'],
    retours: ['De är tillbaka', 'Du har väntat på dem: nu finns de i lager igen.'],
    defaut: ['Veckan i Sverige', 'Kundernas favoriter, en låda att ge bort och en svensk tradition till helgen.'],
    sujetPromo: pct => pct > 0 ? `Veckans erbjudanden: upp till −${pct} %` : 'Veckans erbjudanden',
    sujetNouveau: n => `Nyhet: ${n}`,
    sujetRetour: n => `Tillbaka i lager: ${n}`,
    sujetDefaut: r => `Den här veckan: ${r}`,
    bandeau: (jeudi, url) => `<strong>Förhandsvisning</strong> — nyhetsbrevet skickas ${jeudi} runt kl. 10. För att stoppa det: <a href="${url}" style="color:#E3C98C;">admin → Marknadsföring → Nyhetsbrev</a>.`,
  },
};

const nomEn = (p: any, l: LangueClient) => (l === 'sv' ? p.name_sv : l === 'en' ? p.name_en : '') || p.name_fr || '';
const isBox = (p: any) => (p.tags || []).some((t: string) => String(t).toLowerCase() === 'box') || (Array.isArray(p.bundle_items) && p.bundle_items.length > 0);
const remiseDe = (p: any) => resolveDiscount(p, p.categories);
const pctRemise = (p: any) => {
  const d = remiseDe(p);
  if (!isDiscountActive(d)) return 0;
  const v = Number(d.discount_value) || 0;
  return Math.round(d.discount_type === 'percent' ? v : (Number(p.price) > 0 ? (v / Number(p.price)) * 100 : 0));
};
const indexSemaine = (semaine: string) => Math.floor(Date.parse(semaine + 'T12:00:00Z') / (7 * 86400_000));

/** Jeudi de la semaine (lundi + 3 jours), au format YYYY-MM-DD. */
export const jeudiDe = (semaine: string) => {
  const d = new Date(semaine + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 3);
  return d.toISOString().slice(0, 10);
};

async function catalogue() {
  const { data } = await supabaseAdmin.from('products').select('*, categories(*)').eq('is_active', true);
  const produits = (data || []).filter((p: any) => !HOME.includes(p.categories?.slug));
  const dispo = await disponiblesPour(produits.map((p: any) => p.id));
  /* null = stock non suivi : vendable. */
  const ok = (p: any) => dispo[p.id] === null || (dispo[p.id] ?? 0) > 0;
  return { produits, ok };
}

/** Ce que contient la lettre de la semaine (identifiants seulement). */
export async function choisirContenu(semaine: string): Promise<Contenu> {
  const { produits, ok } = await catalogue();
  /* « Depuis » : le début du dernier envoi, à défaut une semaine avant ce lundi. */
  const { data: derniere } = await supabaseAdmin.from('newsletter_hebdo')
    .select('envoi_debut_at').lt('semaine', semaine).not('envoi_debut_at', 'is', null)
    .order('semaine', { ascending: false }).limit(1).maybeSingle();
  const depuis = derniere?.envoi_debut_at || new Date(Date.parse(semaine + 'T00:00:00Z') - 7 * 86400_000).toISOString();
  const pris = new Set<string>();
  const garder = (l: any[]) => { const out = l.filter(p => !pris.has(p.id)).slice(0, PAR_SECTION); out.forEach(p => pris.add(p.id)); return out.map(p => p.id); };

  const promos = garder(produits.filter(p => ok(p) && pctRemise(p) > 0).sort((a, b) => pctRemise(b) - pctRemise(a)));
  const nouveautes = garder(produits.filter(p => ok(p) && !isBox(p) && String(p.created_at || '') >= depuis)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));

  const { data: mouv } = await supabaseAdmin.from('stock_movements')
    .select('product_id, created_at').gte('created_at', depuis).lte('qty_before', 0).gt('qty_after', 0)
    .order('created_at', { ascending: false }).limit(200);
  const revenus = Array.from(new Set((mouv || []).map((m: any) => m.product_id)));
  const retours = garder(revenus.map(id => produits.find(p => p.id === id)).filter(p => p && ok(p) && !isBox(p)));

  const best = promos.length || nouveautes.length || retours.length ? []
    : garder(produits.filter(p => ok(p) && !isBox(p) && p.is_bestseller).sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)));

  const boxes = produits.filter(p => ok(p) && isBox(p) && !pris.has(p.id)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const box = boxes.length ? boxes[indexSemaine(semaine) % boxes.length].id : null;
  return { promos, nouveautes, retours, best, box, rituel: indexSemaine(semaine) % RITUELS.length };
}

/** Contexte du gabarit email-newsletter pour une langue, et l'objet du message. */
export async function construireLettre(contenu: Contenu, semaine: string, lang: LangueClient) {
  const tous = [...contenu.promos, ...contenu.nouveautes, ...contenu.retours, ...contenu.best, ...(contenu.box ? [contenu.box] : [])];
  const { data } = tous.length
    ? await supabaseAdmin.from('products').select('*, categories(*)').in('id', tous)
    : { data: [] as any[] };
  const parId = new Map((data || []).map((p: any) => [p.id, p]));
  const marque = await contexteMarque();
  const site = (marque.boutique_url || process.env.NEXT_PUBLIC_FRONT_URL || '').replace(/\/$/, '');
  const T = TXT[lang];

  const prixHtml = (p: any) => {
    const base = Number(p.price) || 0;
    const d = remiseDe(p);
    if (!isDiscountActive(d)) return `<span style="color:#44573D; font-weight:bold;">${formatEuro(base, lang)}</span>`;
    return `<span style="color:#A0977F; text-decoration:line-through;">${formatEuro(base, lang)}</span>&nbsp; `
      + `<span style="color:#B03A2E; font-weight:bold;">${formatEuro(effectiveUnitPrice(base, d), lang)}</span>`;
  };
  const ligne = (id: string, promo = false) => {
    const p = parId.get(id); if (!p) return null;
    const pct = promo ? pctRemise(p) : 0;
    const poids = String(p.weight || '').trim();
    return {
      nom: nomEn(p, lang),
      detail: [pct > 0 ? `−${pct} %` : '', poids].filter(Boolean).join(' · '),
      prix_html: prixHtml(p),
      image: imageProduit(p.image_url, site, 300),
      lien: `${site}/produit/${slugProduit(p)}`,
    };
  };
  const liste = (ids: string[], promo = false) => ids.map(id => ligne(id, promo)).filter(Boolean) as any[];
  const promos = liste(contenu.promos, true), nouveautes = liste(contenu.nouveautes), retours = liste(contenu.retours), best = liste(contenu.best);

  const box = contenu.box ? parId.get(contenu.box) : null;
  const premiere = (s: string) => { const t = String(s || '').trim(); const m = t.match(/^.{20,160}?[.!?](\s|$)/); return m ? m[0].trim() : t.slice(0, 160); };
  const r = RITUELS[contenu.rituel % RITUELS.length];

  const maxPct = Math.max(0, ...contenu.promos.map(id => { const p = parId.get(id); return p ? pctRemise(p) : 0; }));
  const [titre, intro] = promos.length ? T.promos : nouveautes.length ? T.nouveautes : retours.length ? T.retours : T.defaut;
  const sujetAuto = promos.length ? T.sujetPromo(maxPct)
    : nouveautes.length ? T.sujetNouveau(nouveautes[0].nom)
    : retours.length ? T.sujetRetour(retours[0].nom)
    : T.sujetDefaut(r[lang].t);
  const jeudi = new Date(jeudiDe(semaine) + 'T12:00:00Z')
    .toLocaleDateString(T.mois, { day: 'numeric', month: 'long', timeZone: 'UTC' }).toUpperCase();

  return {
    sujet: (await sujetPersonnalise('email-newsletter', lang)) || sujetAuto,
    ctx: {
      surtitre: `${T.surtitre} · ${jeudi}`, titre, intro, preheader: intro,
      a_promos: promos.length > 0, promos,
      a_nouveautes: nouveautes.length > 0, nouveautes,
      a_retours: retours.length > 0, retours,
      a_best: best.length > 0, best,
      a_box: !!box,
      box_nom: box ? nomEn(box, lang) : '',
      box_texte: box ? premiere((lang === 'sv' ? box.subtitle_sv || box.desc_sv : lang === 'en' ? box.subtitle_en || box.desc_en : '') || box.subtitle_fr || box.desc_fr) : '',
      box_image: box ? imageProduit(box.image_url, site, 600) : '',
      box_prix_html: box ? prixHtml(box) : '',
      box_lien: box ? `${site}/produit/${slugProduit(box)}` : '',
      a_rituel: true, rituel_titre: r[lang].t, rituel_texte: r[lang].x, rituel_lien: `${site}${r.url}`,
    },
  };
}

/* ── Inscrits ────────────────────────────────────────────────── */

const norm = (e: unknown) => String(e || '').trim().toLowerCase();
async function toutes<T = any>(fabrique: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await fabrique().range(debut, debut + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

/** Inscrits à la newsletter (mêmes règles qu'une campagne : /api/email), avec leur langue. */
export async function abonnes(): Promise<Array<{ email: string; lang: LangueClient }>> {
  const contacts = await toutes(() => supabaseAdmin.from('contacts')
    .select('email, is_active, lang')
    .or('tags.cs.{newsletter},company.eq."Inscrit newsletter"')
    .not('email', 'is', null).order('created_at', { ascending: true }));
  const opposes = new Set((await toutes(() => supabaseAdmin.from('email_optouts').select('email'))).map((o: any) => norm(o.email)));
  const vus = new Map<string, LangueClient>();
  for (const c of contacts as any[]) {
    const e = norm(c.email);
    if (c.is_active === false || !e.includes('@') || opposes.has(e) || vus.has(e)) continue;
    vus.set(e, (['fr', 'en', 'sv'].includes(c.lang) ? c.lang : 'fr') as LangueClient);
  }
  return Array.from(vus, ([email, lang]) => ({ email, lang }));
}

/* ── Étapes ──────────────────────────────────────────────────── */

export const semaineCourante = () => lundiDe(new Date());

export async function lireSemaine(semaine: string) {
  const { data } = await supabaseAdmin.from('newsletter_hebdo').select('*').eq('semaine', semaine).maybeSingle();
  return data as any;
}

/** Compose (ou recompose) la lettre tant qu'elle n'est pas partie ni annulée. */
export async function preparer(semaine: string) {
  const ligne = await lireSemaine(semaine);
  if (ligne && ligne.statut !== 'preparee') return ligne;
  const contenu = await choisirContenu(semaine);
  const { sujet } = await construireLettre(contenu, semaine, 'fr');
  const { data } = await supabaseAdmin.from('newsletter_hebdo')
    .upsert({ semaine, statut: 'preparee', sujet, contenu, updated_at: new Date().toISOString() }, { onConflict: 'semaine' })
    .select('*').single();
  return data as any;
}

/** HTML de la lettre pour une adresse (lien de désinscription personnel), ou pour l'aperçu. */
export async function rendreLettre(
  contenu: Contenu, semaine: string, lang: LangueClient, email: string | null, bandeau = '',
  pret?: Awaited<ReturnType<typeof construireLettre>>,
) {
  const { sujet, ctx } = pret || await construireLettre(contenu, semaine, lang);
  const lien = email ? desinscription(email, 'newsletter') : null;
  const html = await renderEmail('email-newsletter', {
    ...ctx, bandeau, lien_desinscription: lien?.url || '#',
  }, lang);
  return { sujet, html, headers: lien?.headers };
}

/** Aperçu à la boutique (mercredi), une fois par semaine sauf demande expresse. */
export async function envoyerApercu(semaine: string, opts: { a?: string[]; force?: boolean } = {}) {
  const ligne = await preparer(semaine);
  if (!ligne || ligne.statut === 'annulee') return 'annulée : pas d’aperçu';
  if (ligne.apercu_envoye_at && !opts.force) return 'aperçu déjà envoyé';
  const cfg = await getWhiteLabelConfig();
  const dest = (opts.a?.length ? opts.a : [cfg.email || cfg.smtp_user]).filter(e => String(e || '').includes('@'));
  if (!dest.length) return 'aucune adresse pour l’aperçu';
  const backOffice = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://admin.swedishcravings.fr').replace(/\/$/, '');
  const jeudi = new Date(jeudiDe(semaine) + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const { sujet, html } = await rendreLettre(ligne.contenu, semaine, 'fr', null,
    TXT.fr.bandeau(jeudi, `${backOffice}/admin/marketing/newsletter`));
  const envoi = await envoyeurGroupe(cfg);
  try {
    const from = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';
    for (const to of dest) await envoi.envoyer({ from, to, subject: `[Aperçu] ${sujet}`, html });
  } finally { envoi.fermer(); }
  if (!opts.a?.length) {
    await supabaseAdmin.from('newsletter_hebdo').update({ apercu_envoye_at: new Date().toISOString() }).eq('semaine', semaine);
  }
  return `aperçu envoyé à ${dest.join(', ')}`;
}

/**
 * Envoi aux inscrits. Reprend là où il s'est arrêté (une ligne par
 * destinataire) ; s'arrête avant la limite de durée et laisse la suite
 * au passage suivant. Ne fait rien si la lettre est annulée ou partie.
 */
export async function envoyerLettre(semaine: string): Promise<{ etat: string; envoyes: number; echecs: number; restants: number }> {
  let ligne = await lireSemaine(semaine);
  if (ligne?.statut === 'annulee' || ligne?.statut === 'envoyee') return { etat: ligne.statut, envoyes: 0, echecs: 0, restants: 0 };
  if (!ligne || ligne.statut === 'preparee') {
    // Composée au dernier moment : promos et stock du jour J.
    const contenu = await choisirContenu(semaine);
    const { sujet } = await construireLettre(contenu, semaine, 'fr');
    const { data } = await supabaseAdmin.from('newsletter_hebdo').upsert({
      semaine, statut: 'en_cours', sujet, contenu,
      envoi_debut_at: ligne?.envoi_debut_at || new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'semaine' }).select('*').single();
    ligne = data;
  }

  const debut = Date.now();
  const deja = new Set((await toutes(() => supabaseAdmin.from('newsletter_hebdo_envois').select('email').eq('semaine', semaine)))
    .map((r: any) => r.email));
  const aEnvoyer = (await abonnes()).filter(a => !deja.has(a.email));

  const cfg = await getWhiteLabelConfig();
  const from = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';
  const envoi = await envoyeurGroupe(cfg);
  let envoyes = 0, echecs = 0, i = 0;
  // Le contenu ne dépend que de la langue : composé une fois par langue.
  const parLangue = new Map<LangueClient, Awaited<ReturnType<typeof construireLettre>>>();
  try {
    for (; i < aEnvoyer.length; i++) {
      if (Date.now() - debut > BUDGET_MS) break;
      const a = aEnvoyer[i];
      // La prise : un second passage simultané ne réécrit pas à la même adresse.
      const { error: pris } = await supabaseAdmin.from('newsletter_hebdo_envois').insert({ semaine, email: a.email });
      if (pris) continue;
      try {
        if (!parLangue.has(a.lang)) parLangue.set(a.lang, await construireLettre(ligne.contenu, semaine, a.lang));
        const { sujet, html, headers } = await rendreLettre(ligne.contenu, semaine, a.lang, a.email, '', parLangue.get(a.lang));
        await envoi.envoyer({ from, to: a.email, subject: sujet, html, headers });
        envoyes++;
      } catch (e: any) {
        echecs++;
        await supabaseAdmin.from('newsletter_hebdo_envois').update({ erreur: String(e?.message || e).slice(0, 300) })
          .eq('semaine', semaine).eq('email', a.email);
      }
    }
  } finally { envoi.fermer(); }

  const restants = aEnvoyer.length - i;
  await supabaseAdmin.from('newsletter_hebdo').update({
    nb_envoyes: (ligne.nb_envoyes || 0) + envoyes, nb_echecs: (ligne.nb_echecs || 0) + echecs,
    ...(restants === 0 ? { statut: 'envoyee', envoi_fin_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  }).eq('semaine', semaine);
  return { etat: restants === 0 ? 'envoyee' : 'en_cours', envoyes, echecs, restants };
}

/** Réglage « newsletter automatique » (company_settings.newsletter_auto).
 *  Absent = migration 064 pas encore passée : rien ne part (les tables manquent). */
export async function newsletterActive(): Promise<boolean> {
  const { data } = await supabaseAdmin.from('company_settings').select('value').eq('key', 'newsletter_auto').maybeSingle();
  return !!data && String(data.value) !== '0';
}
