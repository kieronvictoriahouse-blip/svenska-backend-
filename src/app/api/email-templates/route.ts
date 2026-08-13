import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { loadDefault, loadOverrides, renderSource, EmailTemplate } from '@/lib/email-templates';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   ÉDITION DES GABARITS

   Le fichier livré reste la référence ; la base ne stocke que ce qui
   a été modifié. Supprimer la ligne, c'est revenir au modèle d'origine.

   Un gabarit est refusé s'il ne rend pas proprement sur un jeu de test :
   une balise oubliée partirait telle quelle chez un client, et ça ne se
   rattrape pas.
   ═══════════════════════════════════════════════════════════════ */

export const TEMPLATES: Array<{ key: EmailTemplate; label: string; variables: string[] }> = [
  { key: 'email-confirmation-commande', label: 'Confirmation de commande',
    variables: ['prenom', 'client', 'numero', 'sous_total', 'livraison', 'total', 'adresse_html', 'lignes[].nom', 'lignes[].qte', 'lignes[].pu', 'lignes[].montant'] },
  { key: 'email-facture', label: 'Facture',
    variables: ['prenom', 'client', 'numero', 'numero_facture', 'sous_total', 'livraison', 'total', 'adresse_html', 'lignes[]'] },
  { key: 'email-avoir-remboursement', label: 'Avoir / remboursement',
    variables: ['prenom', 'client', 'numero_avoir', 'numero_facture', 'total', 'lignes[].nom', 'lignes[].qte', 'lignes[].montant', 'lignes[].motif'] },
  { key: 'email-message-libre', label: 'Rupture & remplacement',
    variables: ['prenom', 'numero', 'surtitre', 'titre', 'corps', 'article', 'article_ref', 'article_qte', 'article_pu', 'article_montant', 'base_lien', 'lien_rembourser', 'lien_attendre', 'options[].nom', 'options[].note', 'options[].prix', 'options[].ecart', 'options[].lien'] },
  { key: 'email-expedition', label: 'Expédition', variables: ['prenom', 'numero'] },
  { key: 'email-colis-disponible', label: 'Colis disponible', variables: ['prenom', 'numero'] },
];

/** Jeu de test : sert à vérifier qu'un gabarit rend sans balise résiduelle. */
const ECHANTILLON: Record<string, any> = {
  prenom: 'Camille', client: 'Camille Rousseau', numero: 'SD-0104',
  numero_facture: 'FAC-2026-0044', numero_avoir: 'AV-2026-0003',
  sous_total: '23,30 €', livraison: '4,90 €', total: '28,20 €',
  adresse_html: '8 avenue Wilson<br />63122 Ceyrat',
  surtitre: 'COMMANDE N° SD-0104', titre: 'Un article en rupture', corps: 'Texte du message.',
  article: 'Lingonsylt 400 g', article_ref: 'SC-1058', article_qte: '1',
  article_pu: '6,20 €', article_montant: '6,20 €',
  base_lien: 'https://exemple.test/api/remplacement',
  lien_rembourser: 'token=X&choix=rembourser', lien_attendre: 'token=X&choix=attendre',
  note_ecart: "L'écart est pour nous.",
  lignes: [{ nom: 'Fromage suédois', qte: '2', pu: '8,90 €', montant: '17,80 €', motif: 'Article cassé' }],
  options: [{ nom: 'Lingonsylt 200 g', note: 'format plus petit', prix: '3,90 €', ecart: '− 2,30 €', lien: 'token=X&choix=p1' }],
};

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const over = await loadOverrides(true);
  return NextResponse.json({
    templates: TEMPLATES.map(t => ({
      ...t,
      defaut: loadDefault(t.key),
      html: over[t.key]?.html || loadDefault(t.key),
      subject: over[t.key]?.subject || '',
      modifie: !!over[t.key],
    })),
  });
}

export async function PUT(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { key, html, subject } = await req.json().catch(() => ({}));
  if (!TEMPLATES.some(t => t.key === key)) {
    return NextResponse.json({ error: 'Gabarit inconnu' }, { status: 400 });
  }
  if (typeof html !== 'string' || html.trim().length < 50) {
    return NextResponse.json({ error: 'Contenu vide ou trop court' }, { status: 400 });
  }

  /* Contrôle avant enregistrement : c'est exactement ce test qui a
     rattrapé un nom d'article resté en dur dans l'avoir. */
  const rendu = renderSource(html, ECHANTILLON);
  const restes = Array.from(new Set((rendu.match(/\{\{[^}]*\}\}/g) || [])));
  if (restes.length) {
    return NextResponse.json({
      error: `Ces balises ne sont pas reconnues et partiraient telles quelles au client : ${restes.join(', ')}`,
    }, { status: 400 });
  }
  if (/<!--#(each|if)/.test(rendu)) {
    return NextResponse.json({
      error: 'Un bloc #each ou #if n’est pas refermé — vérifie les commentaires <!--/each--> et <!--/if-->.',
    }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('email_templates').upsert({
    key, html, subject: subject || null,
    updated_at: new Date().toISOString(),
    updated_by: (user as any)?.email || null,
  }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await loadOverrides(true);
  return NextResponse.json({ ok: true });
}

/** Retour au modèle livré : on supprime la surcharge, rien d'autre. */
export async function DELETE(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const key = new URL(req.url).searchParams.get('key') || '';
  const { error } = await supabaseAdmin.from('email_templates').delete().eq('key', key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await loadOverrides(true);
  return NextResponse.json({ ok: true, html: loadDefault(key as EmailTemplate) });
}

/** Prévisualisation d'un brouillon, sans l'enregistrer. */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { html } = await req.json().catch(() => ({}));
  if (typeof html !== 'string') return NextResponse.json({ error: 'Contenu manquant' }, { status: 400 });
  return new NextResponse(renderSource(html, ECHANTILLON), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
