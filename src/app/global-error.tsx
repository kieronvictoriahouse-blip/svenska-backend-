'use client';

// Filet de sécurité React : si un écran plante au rendu (erreur non prévue
// dans un composant), Next.js affiche ce composant à la place de l'écran blanc.
// On en profite pour envoyer l'erreur à Sentry avant d'afficher un message
// propre au client.
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
          Une erreur est survenue
        </h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          Le problème a été signalé automatiquement. Vous pouvez réessayer.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: '0.6rem 1.2rem',
            border: 'none',
            borderRadius: '8px',
            background: '#111',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
