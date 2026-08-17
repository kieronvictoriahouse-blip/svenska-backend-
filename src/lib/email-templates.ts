import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '@/lib/supabase';
import type { LangueClient } from '@/lib/langue-client';

/* ═══════════════════════════════════════════════════════════════
   GABARITS D'EMAIL

   Les fichiers de src/emails/templates sont les emails du handoff,
   repris tels quels : HTML en tables, styles inline, aucune
   dépendance externe. On ne les redessine pas — on y injecte des
   valeurs.

   Syntaxe volontairement minimale, pour que les fichiers restent
   ouvrables dans un navigateur sans moteur de rendu :
     {{ nom }}                 valeur échappée
     {{{ nom }}}               valeur brute (HTML déjà construit)
     <!--#each lignes-->…<!--/each-->   bloc répété
     <!--#if payee-->…<!--/if-->        bloc conditionnel

   Les balises vivent dans des commentaires HTML : la maquette
   s'affiche toujours correctement avec ses valeurs de démonstration.
   ═══════════════════════════════════════════════════════════════ */

const DIR = path.join(process.cwd(), 'src', 'emails', 'templates');

export type EmailTemplate =
  | 'email-confirmation-commande'
  | 'email-facture'
  | 'email-avoir-remboursement'
  | 'email-message-libre'
  | 'email-expedition'
  | 'email-colis-disponible';

const cacheFichier = new Map<string, string>();

/**
 * Gabarit livre — la reference, jamais modifiee.
 *
 * Les versions traduites vivent a cote sous `<nom>.en.html` et
 * `<nom>.sv.html`. Une version manquante retombe sur le francais : mieux
 * vaut un email lisible dans la mauvaise langue que pas d'email du tout.
 */
export function loadDefault(name: EmailTemplate, lang: LangueClient = 'fr'): string {
  const cle = `${name}.${lang}`;
  const hit = cacheFichier.get(cle);
  if (hit) return hit;

  const candidats = lang === 'fr' ? [`${name}.html`] : [`${name}.${lang}.html`, `${name}.html`];
  for (const f of candidats) {
    const chemin = path.join(DIR, f);
    if (!fs.existsSync(chemin)) continue;
    const raw = fs.readFileSync(chemin, 'utf8');
    cacheFichier.set(cle, raw);
    return raw;
  }
  throw new Error(`Gabarit introuvable : ${name}`);
}

/* Surcharges du back-office, gardees 60 s en memoire : l'envoi d'un email
   ne doit pas provoquer une requete de plus a chaque fois, mais une
   modification doit se voir tout de suite a l'echelle humaine. */
let surcharges: Record<string, { subject?: string; html: string }> = {};
let surchargesAt = 0;

export async function loadOverrides(force = false) {
  if (!force && Date.now() - surchargesAt < 60_000) return surcharges;
  try {
    const { data } = await supabaseAdmin.from('email_templates').select('key, subject, html, lang');
    /* Indexees par `cle@langue` : personnaliser la version francaise ne
       doit pas ecraser la suedoise. Les lignes anterieures a la
       migration 038 n'ont pas de langue — elles valent pour le
       francais, qui etait la seule qui existait. */
    surcharges = Object.fromEntries((data || []).map(r =>
      [`${r.key}@${r.lang || 'fr'}`, { subject: r.subject, html: r.html }]));
    surchargesAt = Date.now();
  } catch {
    /* Table absente ou base injoignable : on continue sur les fichiers.
       Un email doit partir meme si la personnalisation est indisponible. */
  }
  return surcharges;
}

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Remplace les balises d'un fragment avec un contexte donné. */
function interpolate(tpl: string, ctx: Record<string, any>): string {
  return tpl
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => String(get(ctx, k) ?? ''))
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => esc(get(ctx, k)));
}

const get = (ctx: Record<string, any>, key: string) =>
  key.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), ctx);

/**
 * Rend un gabarit.
 *
 * Les images doivent être servies en absolu : un `src` relatif ne
 * s'affiche jamais chez un destinataire. `baseUrl` réécrit donc les
 * sources locales vers le domaine public.
 */
export async function renderEmail(
  name: EmailTemplate,
  ctx: Record<string, any>,
  lang: LangueClient = 'fr',
  baseUrl = process.env.NEXT_PUBLIC_FRONT_URL || 'https://www.swedishcravings.fr',
): Promise<string> {
  const over = await loadOverrides();
  /* Une personnalisation faite dans la langue du client prime ; sinon on
     prend le gabarit livre de cette langue, pas la personnalisation
     francaise — elle porterait le mauvais texte. */
  const html = over[`${name}@${lang}`]?.html || loadDefault(name, lang);
  return renderSource(html, ctx, baseUrl);
}

/** Objet personnalise pour une langue donnee, s'il existe. */
export async function sujetPersonnalise(
  name: EmailTemplate, lang: LangueClient = 'fr',
): Promise<string | null> {
  const over = await loadOverrides();
  return over[`${name}@${lang}`]?.subject?.trim() || null;
}

/** Rend une source donnee — sert aussi a previsualiser un brouillon. */
export function renderSource(
  source: string,
  ctx: Record<string, any>,
  baseUrl = process.env.NEXT_PUBLIC_FRONT_URL || 'https://www.swedishcravings.fr',
): string {
  let html = source;

  // Blocs répétés
  html = html.replace(
    /<!--#each\s+(\w+)-->([\s\S]*?)<!--\/each-->/g,
    (_, key, body) => {
      const items = get(ctx, key);
      if (!Array.isArray(items)) return '';
      return items.map(it => interpolate(body, { ...ctx, ...it })).join('');
    },
  );

  // Blocs conditionnels
  html = html.replace(
    /<!--#if\s+(!?)(\w+)-->([\s\S]*?)<!--\/if-->/g,
    (_, neg, key, body) => {
      const v = get(ctx, key);
      const on = neg ? !v : !!v;
      return on ? body : '';
    },
  );

  html = interpolate(html, ctx);

  // Images : chemins relatifs → URL absolues
  html = html.replace(/src="(?!https?:|cid:|data:)([^"]+)"/g,
    (_, p) => `src="${baseUrl.replace(/\/$/, '')}/emails/${String(p).replace(/^\.?\//, '')}"`);

  return html;
}

/** Version texte grossière, pour le multipart : les clients qui refusent le HTML lisent ça. */
export function toPlainText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|td)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
