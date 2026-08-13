import fs from 'fs';
import path from 'path';

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

const cache = new Map<string, string>();

function load(name: EmailTemplate): string {
  const hit = cache.get(name);
  if (hit) return hit;
  const raw = fs.readFileSync(path.join(DIR, `${name}.html`), 'utf8');
  cache.set(name, raw);
  return raw;
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
export function renderEmail(
  name: EmailTemplate,
  ctx: Record<string, any>,
  baseUrl = process.env.NEXT_PUBLIC_FRONT_URL || 'https://www.swedishcravings.fr',
): string {
  let html = load(name);

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
