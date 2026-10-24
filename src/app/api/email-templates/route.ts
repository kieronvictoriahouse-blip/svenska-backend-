import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { loadDefault, loadOverrides, renderSource, EmailTemplate } from '@/lib/email-templates';
import { TEMPLATES } from '@/lib/email-catalog';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   ÉDITION DES GABARITS

   Le fichier livré reste la référence ; la base ne stocke que ce qui
   a été modifié. Supprimer la ligne, c'est revenir au modèle d'origine.

   Un gabarit est refusé s'il ne rend pas proprement sur un jeu de test :
   une balise oubliée partirait telle quelle chez un client, et ça ne se
   rattrape pas.
   ═══════════════════════════════════════════════════════════════ */

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
  domicile: true, lien_avis: 'https://g.page/r/exemple/review',
};

/* Cet écran édite la version FRANÇAISE (les surcharges sont indexées
   `cle@langue` par lib/email-templates). Le GET cherchait `cle` seule :
   une personnalisation enregistrée n'était jamais relue — l'éditeur
   montrait le modèle d'origine, « Revenir au modèle » n'apparaissait
   jamais, et la sauvegarde suivante repartait du modèle. */
const LANGUE = 'fr';

const MARQUE = ['boutique', 'boutique_email', 'boutique_url', 'boutique_domaine', 'atelier_ville', 'boutique_adresse', 'boutique_siret'];

/** Noms de balises d'un gabarit : {{ x }}, {{{ x }}}, blocs #each / #if. */
const nomsDe = (html: string) => {
  const s = new Set(Array.from(html.matchAll(/\{\{\{?\s*([\w.]+)\s*\}?\}\}/g)).map(m => m[1].split('.')[0]));
  for (const m of Array.from(html.matchAll(/<!--#(?:each|if)\s+!?(\w+)-->/g))) s.add(m[1]);
  return s;
};

/** Ce que le code fournit vraiment à un gabarit : le catalogue, la marque,
 *  et toute balise des modèles livrés (fr/en/sv) — le catalogue seul est
 *  incomplet. */
function variablesConnues(key: EmailTemplate): Set<string> {
  const ok = new Set(MARQUE);
  for (const v of TEMPLATES.find(t => t.key === key)?.variables || []) {
    const [base, champ] = v.split('[].');
    ok.add(base.replace('[]', ''));
    if (champ) ok.add(champ);
  }
  for (const l of ['fr', 'en', 'sv'] as const) {
    try { nomsDe(loadDefault(key, l)).forEach(n => ok.add(n)); } catch { /* langue absente */ }
  }
  return ok;
}

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const over = await loadOverrides(true);
  return NextResponse.json({
    templates: TEMPLATES.map(t => {
      const o = over[`${t.key}@${LANGUE}`];
      return {
        ...t,
        defaut: loadDefault(t.key),
        html: o?.html || loadDefault(t.key),
        subject: o?.subject || '',
        modifie: !!o,
      };
    }),
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
  const { contexteMarque } = await import('@/lib/email-templates');
  const rendu = renderSource(html, { ...(await contexteMarque()), ...ECHANTILLON });
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
  /* Une variable mal orthographiée ({{ prenon }}) se rendait vide, sans
     aucune alerte : le contrôle ci-dessus ne voyait que les balises
     malformées. On compare maintenant aux variables réellement fournies. */
  const connues = variablesConnues(key);
  const inconnues = Array.from(nomsDe(`${html}\n${subject || ''}`)).filter(n => !connues.has(n));
  if (inconnues.length) {
    return NextResponse.json({
      error: `Variable(s) inconnue(s) pour ce gabarit, elles partiraient vides : ${inconnues.map(n => `{{ ${n} }}`).join(', ')}`,
    }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('email_templates').upsert({
    key, lang: LANGUE, html, subject: subject || null,
    updated_at: new Date().toISOString(),
    updated_by: (user as any)?.email || null,
  }, { onConflict: 'key,lang' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await loadOverrides(true);
  return NextResponse.json({ ok: true });
}

/** Retour au modèle livré : on supprime la surcharge française, rien
 *  d'autre — pas les versions anglaise et suédoise personnalisées. */
export async function DELETE(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const key = new URL(req.url).searchParams.get('key') || '';
  if (!TEMPLATES.some(t => t.key === key)) return NextResponse.json({ error: 'Gabarit inconnu' }, { status: 400 });
  const { error } = await supabaseAdmin.from('email_templates').delete().eq('key', key).eq('lang', LANGUE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await loadOverrides(true);
  return NextResponse.json({ ok: true, html: loadDefault(key as EmailTemplate) });
}

/** Prévisualisation d'un brouillon, sans l'enregistrer. */
export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const { html } = await req.json().catch(() => ({}));
  if (typeof html !== 'string') return NextResponse.json({ error: 'Contenu manquant' }, { status: 400 });
  return new NextResponse(renderSource(html, { ...(await (await import('@/lib/email-templates')).contexteMarque()), ...ECHANTILLON }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
