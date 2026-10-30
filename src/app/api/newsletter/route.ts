import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { BOUTIQUE_DEFAUT, boutiqueDeRequete } from '@/lib/boutique';

// Inscription newsletter — PUBLIC (pas d'auth). Enregistre l'email dans le CRM (contacts)
// pour qu'il soit exploitable par le module Marketing (campagnes).
//
// Un abonné = un contact portant l'étiquette « newsletter » (les plus anciens
// portent seulement company = 'Inscrit newsletter' ; les deux sont reconnus
// par l'envoi de campagne, cf. /api/email).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/* Garde-fou anti-rafale, par instance (même principe que /api/contact) :
   sans lui, un robot pouvait remplir la liste d'adresses de tiers, qui
   auraient ensuite reçu les campagnes sans jamais s'être inscrites. */
const recents = new Map<string, number[]>();
function tropDInscriptions(ip: string): boolean {
  const now = Date.now();
  const liste = (recents.get(ip) || []).filter(t => now - t < 10 * 60_000);
  liste.push(now);
  recents.set(ip, liste);
  return liste.length > 5;
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  // Piège à robots : champ invisible rempli → on fait semblant d'accepter.
  if (typeof body.website === 'string' && body.website.trim()) {
    return NextResponse.json({ ok: true }, { headers: CORS });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const emailOk = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!emailOk) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400, headers: CORS });
  }

  // Langue du site au moment de l'inscription : la newsletter part dans cette langue.
  const lang = ['fr', 'en', 'sv'].includes(body.lang) ? body.lang : null;

  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'inconnu';
  if (tropDInscriptions(ip)) {
    return NextResponse.json({ error: 'Trop de tentatives, réessayez plus tard' }, { status: 429, headers: CORS });
  }

  /* Une nouvelle inscription vaut nouveau consentement : une
     désinscription NEWSLETTER antérieure est levée. Une opposition aux
     relances de panier, elle, reste (ce n'est pas le même accord). */
  /* email_optouts n'a pas encore de boutique : une inscription sur une
     autre vitrine ne doit pas lever l'opposition donnée à Swedish Cravings. */
  const b = boutiqueDeRequete(req);
  if (b === BOUTIQUE_DEFAUT) {
    await supabaseAdmin.from('email_optouts').delete().eq('email', email).eq('source', 'newsletter');
  }

  /* Anti-doublon : si l'email existe déjà, on le marque abonné (idempotent).
     Dans la boutique de la vitrine seulement : s'inscrire chez l'une ne
     doit pas abonner à la newsletter de l'autre. */
  const { data: existing, error: exErr } = await supabaseAdmin
    .from('contacts')
    .select('id, tags, is_active')
    .eq('email', email)
    .eq('boutique_id', b)
    .limit(1);

  // Recherche ratée : on n'insère pas un doublon à l'aveugle.
  if (exErr) {
    console.error('[newsletter] recherche contact :', exErr.message);
    return NextResponse.json({ error: 'Inscription impossible' }, { status: 500, headers: CORS });
  }

  if (existing && existing.length > 0) {
    /* Un client déjà présent dans le CRM qui s'inscrit était ignoré :
       « déjà inscrit » sans rien marquer, il ne recevait jamais la
       newsletter. */
    const c = existing[0];
    const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
    if (!tags.includes('newsletter') || c.is_active === false || lang) {
      await supabaseAdmin.from('contacts').update({
        tags: Array.from(new Set([...tags, 'newsletter'])),
        is_active: true,
        ...(lang ? { lang } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', c.id);
    }
    return NextResponse.json({ ok: true, already: true }, { headers: CORS });
  }

  const { error } = await supabaseAdmin.from('contacts').insert({
    email,
    type: 'client',
    company: 'Inscrit newsletter',
    tags: ['newsletter'],
    ...(lang ? { lang } : {}),
    first_name: '',
    last_name: '',
    updated_at: new Date().toISOString(),
    // Swedish Cravings : le défaut de la base suffit, comme avant.
    ...(b !== BOUTIQUE_DEFAUT ? { boutique_id: b } : {}),
  });

  if (error) {
    console.error('[newsletter] inscription impossible :', error.message);
    return NextResponse.json({ error: 'Inscription impossible' }, { status: 500, headers: CORS });
  }
  return NextResponse.json({ ok: true }, { headers: CORS });
}
