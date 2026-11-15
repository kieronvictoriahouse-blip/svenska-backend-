import { supabaseAdmin } from '@/lib/supabase';
import { BOUTIQUE_DEFAUT } from '@/lib/boutique';

/* ═══════════════════════════════════════════════════════════════
   Inscription à la newsletter — logique unique

   Utilisée par le formulaire du site (/api/newsletter) et par le
   paiement, quand le client a coché « recevoir les nouveautés » dans le
   panier (metadata newsletter=1 de la session Stripe).

   Un abonné = un contact portant l'étiquette « newsletter », dans la
   boutique de la vitrine. Une nouvelle inscription vaut nouveau
   consentement : la désinscription NEWSLETTER antérieure est levée (pas
   l'opposition aux relances de panier, qui est un autre accord).
   ═══════════════════════════════════════════════════════════════ */
export async function inscrireNewsletter(
  emailBrut: string,
  { lang, boutique = BOUTIQUE_DEFAUT, nom }: { lang?: string | null; boutique?: string; nom?: string } = {},
): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  const email = String(emailBrut || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'Email invalide' };
  const l = lang && ['fr', 'en', 'sv'].includes(lang) ? lang : null;

  /* email_optouts n'a pas encore de boutique : une inscription sur une
     autre vitrine ne doit pas lever l'opposition donnée à Swedish Cravings. */
  if (boutique === BOUTIQUE_DEFAUT) {
    await supabaseAdmin.from('email_optouts').delete().eq('email', email).eq('source', 'newsletter');
  }

  const { data: existing, error: exErr } = await supabaseAdmin
    .from('contacts').select('id, tags, is_active')
    .eq('email', email).eq('boutique_id', boutique).limit(1);
  // Recherche ratée : on n'insère pas un doublon à l'aveugle.
  if (exErr) return { ok: false, error: exErr.message };

  if (existing && existing.length > 0) {
    const c = existing[0];
    const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
    if (!tags.includes('newsletter') || c.is_active === false || l) {
      await supabaseAdmin.from('contacts').update({
        tags: Array.from(new Set([...tags, 'newsletter'])),
        is_active: true,
        ...(l ? { lang: l } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', c.id);
    }
    return { ok: true, already: true };
  }

  const [prenom, ...reste] = String(nom || '').trim().split(/\s+/);
  const { error } = await supabaseAdmin.from('contacts').insert({
    email,
    type: 'client',
    company: 'Inscrit newsletter',
    tags: ['newsletter'],
    ...(l ? { lang: l } : {}),
    first_name: prenom || '',
    last_name: reste.join(' '),
    updated_at: new Date().toISOString(),
    // Swedish Cravings : le défaut de la base suffit, comme avant.
    ...(boutique !== BOUTIQUE_DEFAUT ? { boutique_id: boutique } : {}),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
