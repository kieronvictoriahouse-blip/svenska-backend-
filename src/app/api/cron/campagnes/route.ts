import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getWhiteLabelConfig } from '@/lib/email-send';
import { envoyerCampagne } from '@/lib/campagne-envoi';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/* ═══════════════════════════════════════════════════════════════
   CAMPAGNES PROGRAMMÉES — chaque matin à 08:00 UTC (9 h / 10 h Paris)

   Envoie les campagnes email au statut « scheduled » dont la date
   (scheduled_at) est passée. Une campagne programmée interrompue
   (« paused », budget de temps) reprend au passage suivant, sans
   renvoyer à ceux qui l'ont déjà reçue (email_events).
   ═══════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: dues } = await supabaseAdmin.from('marketing_campaigns')
    .select('id, name')
    .eq('type', 'email')
    .in('status', ['scheduled', 'paused'])
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at');
  if (!dues?.length) return NextResponse.json({ ok: true, envoyees: 0 });

  const cfg = await getWhiteLabelConfig();
  const fromEmail = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || '';
  const resultats: any[] = [];
  for (const c of dues) {
    try {
      const r = await envoyerCampagne({ campaign_id: c.id, cfg, fromEmail });
      resultats.push({ campagne: c.name, ...r.body });
      if (r.body?.interrompu) break;     // plus de temps : la suite au prochain passage
    } catch (e: any) {
      console.error('[cron/campagnes]', c.name, e?.message);
      resultats.push({ campagne: c.name, error: e?.message || 'erreur' });
    }
  }
  return NextResponse.json({ ok: true, resultats });
}
