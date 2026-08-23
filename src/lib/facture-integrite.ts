import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   INTÉGRITÉ DES FACTURES — chaînage cryptographique

   Une facture émise est une pièce comptable : elle ne se modifie pas,
   elle se corrige par avoir. Le back-office l'interdit déjà par ses
   routes, mais une interdiction logicielle se contourne — par la base
   directement, par un bug, par un futur développeur pressé.

   Le chaînage rend l'altération VISIBLE au lieu de l'empêcher :
   chaque pièce porte l'empreinte de son contenu ET celle de la pièce
   précédente. Toucher une facture du passé casse toutes les empreintes
   qui suivent, et `verifierChaine` le voit en une passe.

   C'est le principe d'inaltérabilité de l'art. 286-I-3° bis du CGI
   (logiciels de caisse). La franchise en base (art. 293 B) en dispense
   aujourd'hui — mais la dispense tombe avec la franchise, et un
   historique inaltérable ne se reconstruit pas rétroactivement : il
   faut avoir chaîné depuis le début.

   ── Ce qui est scellé ────────────────────────────────────────────
   Le CONTENU FACTURÉ : numéro, date, identités, lignes, montants,
   mention légale. PAS le cycle de vie (statut, paiement, note) : une
   facture qui passe de « envoyée » à « payée » reste la même pièce.
   ═══════════════════════════════════════════════════════════════ */

export const GENESIS = 'GENESIS';

/** Champs couverts par l'empreinte — l'ordre fait partie du contrat. */
const CHAMPS_SCELLES = [
  'number', 'date',
  'client_name', 'client_email', 'client_address',
  'seller_name', 'seller_siret',
  'total_ht', 'total_tva', 'total_ttc',
  'legal_mention',
] as const;

/**
 * Sérialisation canonique : mêmes données → même chaîne, toujours.
 * Les montants sont figés à deux décimales (12 et 12.0 et "12.00"
 * doivent donner la même empreinte), les lignes ne gardent que ce qui
 * est facturé (désignation, quantité, prix — pas l'image).
 */
export function canonique(inv: any): string {
  const lignes = (() => {
    try {
      const l = typeof inv.lines === 'string' ? JSON.parse(inv.lines) : (inv.lines || []);
      return (Array.isArray(l) ? l : []).map((x: any) => ({
        d: String(x.desc || x.name || ''),
        q: Number(x.qty) || 0,
        p: (Number(x.price) || 0).toFixed(2),
      }));
    } catch { return []; }
  })();

  const base: Record<string, string> = {};
  for (const c of CHAMPS_SCELLES) {
    const v = (inv as any)[c];
    base[c] = ['total_ht', 'total_tva', 'total_ttc'].includes(c)
      ? (Number(v) || 0).toFixed(2)
      : String(v ?? '');
  }
  return JSON.stringify({ ...base, lignes });
}

export const empreinte = (contenu: string, precedente: string): string =>
  createHash('sha256').update(precedente + '\n' + contenu, 'utf8').digest('hex');

/** Dernière empreinte de la chaîne — le point d'accroche du suivant. */
export async function dernierMaillon(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('invoices')
    .select('chain_hash')
    .not('chain_hash', 'is', null)
    .order('finalized_at', { ascending: false })
    .limit(1);
  return data?.[0]?.chain_hash || GENESIS;
}

/**
 * Scelle une facture fraîchement créée.
 *
 * Appelé immédiatement après l'insertion, jamais plus tard : entre la
 * création et le scellement, la pièce n'est pas encore protégée. Une
 * écriture concurrente peut accrocher deux pièces au même maillon —
 * la garde `is('chain_hash', null)` transforme ce cas en re-tentative
 * plutôt qu'en fourche silencieuse de la chaîne.
 */
export async function scellerFacture(invoiceId: string): Promise<{ hash: string } | null> {
  for (let essai = 0; essai < 5; essai++) {
    const { data: inv } = await supabaseAdmin
      .from('invoices').select('*').eq('id', invoiceId).single();
    if (!inv) return null;
    if (inv.chain_hash) return { hash: inv.chain_hash };   // déjà scellée

    const prev = await dernierMaillon();
    const hash = empreinte(canonique(inv), prev);

    /* Deux gardes : la pièce n'a pas été scellée entre-temps, ET
       personne d'autre ne s'est accroché au même maillon. */
    const { data: dejaPris } = await supabaseAdmin
      .from('invoices').select('id').eq('chain_prev', prev).limit(1);
    if (dejaPris && dejaPris.length) continue;             // maillon pris : relire

    const { data: maj } = await supabaseAdmin
      .from('invoices')
      .update({ chain_hash: hash, chain_prev: prev, finalized_at: new Date().toISOString() })
      .eq('id', invoiceId)
      .is('chain_hash', null)
      .select('id');
    if (maj && maj.length) return { hash };
  }
  console.error('[facture-integrite] scellement impossible après 5 essais', invoiceId);
  return null;
}

/**
 * Vérifie toute la chaîne. Lecture seule.
 * Retourne les maillons cassés : contenu altéré (l'empreinte ne
 * correspond plus) ou chaîne rompue (le prev ne pointe sur rien).
 */
export async function verifierChaine(): Promise<{
  total: number;
  scellees: number;
  alterees: Array<{ number: string; attendu: string; trouve: string }>;
  rompues: Array<{ number: string; prev: string }>;
}> {
  const { data: toutes } = await supabaseAdmin
    .from('invoices').select('*')
    .not('chain_hash', 'is', null)
    .order('finalized_at', { ascending: true });

  const alterees: Array<{ number: string; attendu: string; trouve: string }> = [];
  const rompues: Array<{ number: string; prev: string }> = [];
  const vues = new Set<string>([GENESIS]);

  for (const inv of toutes || []) {
    const attendu = empreinte(canonique(inv), inv.chain_prev);
    if (attendu !== inv.chain_hash) {
      alterees.push({ number: inv.number, attendu, trouve: inv.chain_hash });
    }
    if (!vues.has(inv.chain_prev)) {
      rompues.push({ number: inv.number, prev: inv.chain_prev });
    }
    vues.add(inv.chain_hash);
  }

  const { count } = await supabaseAdmin
    .from('invoices').select('id', { count: 'exact', head: true });

  return { total: count || 0, scellees: (toutes || []).length, alterees, rompues };
}
