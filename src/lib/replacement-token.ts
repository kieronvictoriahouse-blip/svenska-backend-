import crypto from 'crypto';

/* ═══════════════════════════════════════════════════════════════
   JETONS DU PARCOURS DE REMPLACEMENT

   Le client clique depuis sa boîte mail, sans être connecté : le lien
   EST l'authentification. D'où trois règles non négociables.

   1. Le jeton est signé. Un identifiant devinable dans l'URL laisserait
      n'importe qui ouvrir — et modifier — la commande d'un autre.
   2. Il expire. Un lien qui traîne dans une boîte mail des mois plus
      tard ne doit plus rien pouvoir déclencher.
   3. Il ne porte aucun montant. Le prix affiché dans l'email est
      informatif ; seul le catalogue fait foi au moment du clic.
      Sinon il suffirait de bricoler l'URL pour se faire rembourser
      ce qu'on veut.
   ═══════════════════════════════════════════════════════════════ */

const TTL_JOURS = 30;

function secret(): string {
  const s = process.env.REPLACEMENT_SECRET || process.env.ADMIN_JWT_SECRET;
  if (!s) throw new Error('REPLACEMENT_SECRET non configuré — le parcours de remplacement ne peut pas signer ses liens');
  return s;
}

const b64 = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64 = (s: string) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export type ChoicePayload = {
  /** Identifiant de la ligne en rupture (table order_line_choices). */
  cid: string;
  /** Commande, pour éviter toute confusion de rattachement. */
  oid: string;
  /** Expiration, en secondes epoch. */
  exp: number;
};

export function signChoice(cid: string, oid: string, now = Date.now()): string {
  const payload: ChoicePayload = {
    cid, oid,
    exp: Math.floor(now / 1000) + TTL_JOURS * 86400,
  };
  const body = b64(JSON.stringify(payload));
  const sig = b64(crypto.createHmac('sha256', secret()).update(body).digest());
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: ChoicePayload }
  | { ok: false; raison: 'malforme' | 'signature' | 'expire' };

export function verifyChoice(token: string): VerifyResult {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return { ok: false, raison: 'malforme' };
  const [body, sig] = parts;

  const attendu = crypto.createHmac('sha256', secret()).update(body).digest();
  const recu = unb64(sig);
  // Comparaison à temps constant : une comparaison naïve fuit la signature
  // octet par octet.
  if (recu.length !== attendu.length || !crypto.timingSafeEqual(recu, attendu)) {
    return { ok: false, raison: 'signature' };
  }

  let payload: ChoicePayload;
  try { payload = JSON.parse(unb64(body).toString('utf8')); }
  catch { return { ok: false, raison: 'malforme' }; }

  if (!payload?.cid || !payload?.oid) return { ok: false, raison: 'malforme' };
  if (!payload.exp || payload.exp * 1000 < Date.now()) return { ok: false, raison: 'expire' };

  return { ok: true, payload };
}
