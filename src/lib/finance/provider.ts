// ─────────────────────────────────────────────────────────────────────
//  Sélection de l'agrégateur bancaire actif (par instance SaaS).
//  Priorité : Bridge > GoCardless. L'import OFX/CSV reste toujours dispo.
// ─────────────────────────────────────────────────────────────────────
import { bridgeConfigured } from './bridge';
import { gocardlessConfigured } from './gocardless';

export type BankProvider = 'bridge' | 'gocardless' | 'none';

export function activeProvider(): BankProvider {
  const forced = process.env.BANK_PROVIDER as BankProvider | undefined;
  if (forced === 'bridge' && bridgeConfigured()) return 'bridge';
  if (forced === 'gocardless' && gocardlessConfigured()) return 'gocardless';
  if (bridgeConfigured()) return 'bridge';
  if (gocardlessConfigured()) return 'gocardless';
  return 'none';
}

/** Identifiant end-user stable de l'instance (SaaS : une instance = un user). */
export function instanceUserId(): string {
  return process.env.SHOPFLOW_INSTANCE || 'sc-main';
}

/** L'agrégateur gère-t-il lui-même le choix de la banque (pas de picker) ? */
export function providerHandlesPicker(p: BankProvider): boolean {
  return p === 'bridge';
}
