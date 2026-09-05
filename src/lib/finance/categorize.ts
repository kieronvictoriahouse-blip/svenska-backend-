// ─────────────────────────────────────────────────────────────────────
//  Moteur de catégorisation assistée
//  « Le système propose, l'humaine confirme. »
//
//  Applique les accounting_rules (contreparties connues, mots-clés) à une
//  ligne bancaire et renvoie une proposition avec score de confiance.
//  Chaque correction humaine crée/renforce une règle (apprentissage).
// ─────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/lib/supabase';
import { categoryDef, type Sens } from './pcg';

export interface Rule {
  id: string;
  match_type: 'label_contains' | 'counterparty' | 'amount' | 'regex';
  pattern: string;
  direction: Sens | null;
  category: string;
  account_code: string | null;
  is_personal: boolean;
  priority: number;
  hits: number;
  source: string;
}

export interface Proposal {
  category: string;
  account_code: string;
  confidence: number;      // 0-100
  is_personal: boolean;
  ruleId: string | null;
}

let _rulesCache: { rules: Rule[]; exp: number } | null = null;

export async function loadRules(force = false): Promise<Rule[]> {
  if (!force && _rulesCache && _rulesCache.exp > Date.now()) return _rulesCache.rules;
  const { data } = await supabaseAdmin
    .from('accounting_rules')
    .select('*')
    .order('priority', { ascending: false });
  const rules = (data || []) as Rule[];
  _rulesCache = { rules, exp: Date.now() + 30_000 };
  return rules;
}

export function invalidateRulesCache() { _rulesCache = null; }

/** Propose une catégorie pour une ligne (label + sens + montant). */
export function proposeCategory(
  rules: Rule[],
  opts: { label: string; direction: Sens; amount: number },
): Proposal {
  const label = (opts.label || '').toUpperCase();
  let best: { rule: Rule; score: number } | null = null;

  for (const r of rules) {
    if (r.direction && r.direction !== opts.direction) continue;
    let matched = false;
    let base = 0;
    const pat = (r.pattern || '').toUpperCase();
    if (!pat) continue;
    switch (r.match_type) {
      case 'label_contains':
      case 'counterparty':
        if (label.includes(pat)) { matched = true; base = 78; }
        break;
      case 'regex':
        try { if (new RegExp(r.pattern, 'i').test(opts.label)) { matched = true; base = 80; } } catch { /* motif invalide */ }
        break;
      case 'amount':
        if (Math.abs(Math.abs(opts.amount) - Math.abs(parseFloat(r.pattern) || -1)) < 0.005) { matched = true; base = 70; }
        break;
    }
    if (!matched) continue;
    // Confiance = base + bonus de priorité + bonus d'apprentissage (hits).
    const score = Math.min(99, base + Math.min(12, r.priority / 8) + Math.min(9, r.hits));
    if (!best || score > best.score) best = { rule: r, score };
  }

  if (best) {
    const def = categoryDef(best.rule.category);
    return {
      category: best.rule.category,
      account_code: best.rule.account_code || def.account,
      confidence: Math.round(best.score),
      is_personal: best.rule.is_personal || !!def.personal,
      ruleId: best.rule.id,
    };
  }

  // Aucune règle : repli neutre, faible confiance.
  const fallback = opts.direction === 'in' ? 'vente' : 'autre';
  const def = categoryDef(fallback);
  return { category: fallback, account_code: def.account, confidence: 45, is_personal: false, ruleId: null };
}

/** Apprend d'une correction : renforce la règle existante ou en crée une. */
export async function learnFromCorrection(opts: {
  label: string;
  direction: Sens;
  category: string;
  account_code: string;
  is_personal: boolean;
  ruleId?: string | null;
}): Promise<void> {
  // Motif = mot le plus significatif du libellé (> 3 lettres), en MAJ.
  const token = (opts.label || '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(w => w.length >= 4 && !/^\d+$/.test(w))
    .sort((a, b) => b.length - a.length)[0];

  if (opts.ruleId) {
    // La proposition venait déjà d'une règle et a été confirmée/corrigée.
    const { data: r } = await supabaseAdmin.from('accounting_rules').select('category, hits').eq('id', opts.ruleId).maybeSingle();
    if (r && r.category === opts.category) {
      await supabaseAdmin.from('accounting_rules').update({ hits: (r.hits || 0) + 1 }).eq('id', opts.ruleId);
      invalidateRulesCache();
      return;
    }
  }
  if (!token) return;

  const { data: existing } = await supabaseAdmin
    .from('accounting_rules')
    .select('id, hits, category')
    .eq('match_type', 'label_contains')
    .eq('pattern', token)
    .eq('category', opts.category)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin.from('accounting_rules').update({ hits: (existing.hits || 0) + 1 }).eq('id', existing.id);
  } else {
    await supabaseAdmin.from('accounting_rules').insert({
      match_type: 'label_contains',
      pattern: token,
      direction: opts.direction,
      category: opts.category,
      account_code: opts.account_code,
      is_personal: opts.is_personal,
      priority: 30,
      hits: 1,
      source: 'learned',
    });
  }
  invalidateRulesCache();
}
