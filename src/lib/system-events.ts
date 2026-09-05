// Couche 2 du report d'erreur : les erreurs MÉTIER qu'on anticipe.
//
// À appeler dans un `catch` là où un échec est prévisible et actionnable :
// webhook Stripe qui échoue, email qui ne part pas, étiquette transporteur
// impossible. Ça fait deux choses, et ne throw JAMAIS (logger une erreur ne
// doit jamais casser le flux qui l'a rencontrée) :
//
//   1. écrit la ligne complète dans `system_events` de l'instance (détail +
//      commande concernée) → tu la retrouves en base, requêtable ;
//   2. envoie une copie SANS donnée client à Sentry, taguée par instance →
//      tu es alerté au niveau de la flotte sans sortir la donnée de la boutique.
//
// Pour les erreurs IMPRÉVUES (exceptions, crashs), ne rien faire : Sentry les
// capture déjà tout seul via instrumentation.ts et global-error.tsx.
import * as Sentry from '@sentry/nextjs';
import { supabaseAdmin } from './supabase';

export type SystemEventLevel = 'error' | 'warn' | 'info';

export interface SystemEventInput {
  /** D'où vient l'erreur, en kebab-case stable : 'stripe-webhook', 'email-send', 'mondial-relay'. */
  source: string;
  /** Message lisible, court. */
  message: string;
  level?: SystemEventLevel;
  /** Commande concernée, si applicable. */
  orderNumber?: string;
  /** Détails techniques libres (réponse d'API, id, etc.). Reste en base, PAS envoyé à Sentry. */
  context?: Record<string, unknown>;
  /** L'erreur d'origine, si tu en as une (sa stack part vers Sentry). */
  error?: unknown;
}

export async function logSystemEvent(input: SystemEventInput): Promise<void> {
  const level: SystemEventLevel = input.level ?? 'error';
  const fingerprint = `${input.source}:${input.message}`.slice(0, 200);

  // 1) Trace complète en base (best-effort — n'interrompt jamais l'appelant)
  try {
    await supabaseAdmin.from('system_events').insert({
      level,
      source: input.source,
      message: input.message,
      order_number: input.orderNumber ?? null,
      fingerprint,
      context: {
        ...(input.context ?? {}),
        ...(input.error ? { error_message: errText(input.error) } : {}),
      },
    });
  } catch (e) {
    // Si même l'écriture en base échoue, au moins la console et Sentry restent.
    console.error('[system-events] insert échoué:', e);
  }

  // 2) Alerte transverse Sentry — message seul + tags, aucune donnée client
  try {
    Sentry.withScope((scope) => {
      scope.setLevel(level === 'warn' ? 'warning' : level);
      scope.setTag('source', input.source);
      scope.setFingerprint([fingerprint]);
      if (input.orderNumber) scope.setTag('order', input.orderNumber);
      if (input.error) {
        Sentry.captureException(input.error);
      } else {
        Sentry.captureMessage(`[${input.source}] ${input.message}`);
      }
    });
  } catch {
    /* Sentry absent (pas de DSN) → no-op, déjà tracé en base et console. */
  }

  console.error(`[${input.source}] ${input.message}`, input.orderNumber ? `(commande ${input.orderNumber})` : '');
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
