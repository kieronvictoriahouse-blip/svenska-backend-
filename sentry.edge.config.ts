// Sentry — runtime edge (middleware.ts, routes en runtime edge).
// Mêmes règles que sentry.server.config.ts : no-op sans DSN, tag par instance.
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  initialScope: {
    tags: { instance: process.env.SHOPFLOW_INSTANCE || 'dev' },
  },
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
});
