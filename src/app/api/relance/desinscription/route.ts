import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { signatureEmail } from '@/lib/relance-panier';

export const dynamic = 'force-dynamic';

/* Désinscription — lien signé présent dans chaque relance de panier et
   chaque email de newsletter (`t=n`). Un clic suffit, sans compte ni
   confirmation : c'est ce que la loi exige, et c'est ce qu'on attend
   d'un email correct.

   Une seule liste d'opposition (email_optouts) : relances et newsletter
   la respectent toutes les deux.

   POST : le « se désinscrire » en un clic des messageries (en-têtes
   List-Unsubscribe / List-Unsubscribe-Post, RFC 8058). Mêmes paramètres
   signés dans l'URL ; la messagerie n'attend qu'un 200. */
const page = (titre: string, texte: string, status = 200) => new NextResponse(
  `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre}</title></head>
<body style="margin:0;background:#F1EEE9;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:520px;margin:48px auto;background:#FDFBF5;border-top:6px solid #44573D;padding:36px 32px;text-align:center;">
<div style="font-family:Georgia,serif;font-size:26px;color:#44573D;">Swedish Cravings</div>
<div style="font-family:Georgia,serif;font-size:22px;color:#1F231C;margin-top:24px;">${titre}</div>
<p style="font-size:15px;line-height:24px;color:#5F5A4E;">${texte}</p>
<a href="https://www.swedishcravings.fr" style="display:inline-block;margin-top:12px;background:#44573D;color:#FDFBF5;text-decoration:none;padding:12px 26px;font-size:13px;letter-spacing:1.2px;font-weight:bold;">RETOUR À LA BOUTIQUE</a>
</div></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
);

/** Enregistre l'opposition si la signature est bonne. null = lien invalide. */
async function desinscrire(q: URLSearchParams): Promise<{ email: string; newsletter: boolean } | null> {
  const email = String(q.get('e') || '').trim().toLowerCase();
  const sig = String(q.get('s') || '');
  if (!email || sig !== signatureEmail(email)) return null;
  const newsletter = q.get('t') === 'n';
  await supabaseAdmin.from('email_optouts')
    .upsert({ email, source: newsletter ? 'newsletter' : 'relance_panier' }, { onConflict: 'email', ignoreDuplicates: true });
  return { email, newsletter };
}

export async function GET(req: NextRequest) {
  const r = await desinscrire(req.nextUrl.searchParams);
  if (!r) {
    return page('Lien invalide', 'Ce lien de désinscription est incomplet. Répondez simplement à l’un de nos emails et nous vous retirons à la main.', 400);
  }
  const safe = r.email.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return r.newsletter
    ? page('C’est noté',
      `Vous ne recevrez plus notre newsletter à l’adresse <strong>${safe}</strong>. Vos confirmations de commande continueront bien sûr d’arriver.`)
    : page('C’est noté',
      `Vous ne recevrez plus de rappels de panier à l’adresse <strong>${safe}</strong>. Vos confirmations de commande continueront bien sûr d’arriver.`);
}

export async function POST(req: NextRequest) {
  const r = await desinscrire(req.nextUrl.searchParams);
  if (!r) return NextResponse.json({ error: 'Lien invalide' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
