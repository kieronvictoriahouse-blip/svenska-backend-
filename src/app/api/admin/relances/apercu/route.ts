import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { composerRelance, offreDeLaSemaine, Rang } from '@/lib/relance-panier';
import { urlVitrine } from '@/lib/urls-instance';
import type { LangueClient } from '@/lib/langue-client';

export const dynamic = 'force-dynamic';

/* Aperçu de l'email de relance, tel qu'il partirait pour une semaine
   donnée : l'équipe voit le rendu exact (charte, offre, langue) avant
   que le moindre client ne le reçoive. Panier d'exemple : les trois
   derniers produits actifs du catalogue. Aucun envoi, aucune écriture. */
export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const rang: Rang = q.get('rang') === '2' ? 2 : 1;
  const lang = (['fr', 'en', 'sv'].includes(q.get('lang') || '') ? q.get('lang') : 'fr') as LangueClient;
  const semaine = q.get('semaine');
  const quand = semaine ? new Date(semaine + 'T12:00:00Z') : new Date();

  const { data: produits } = await supabaseAdmin
    .from('products').select('id, name_fr, name_en, name_sv, price, image_url')
    .eq('is_active', true).not('image_url', 'is', null)
    .order('updated_at', { ascending: false }).limit(3);
  const lignesBrutes = (produits || []).map((p, i) => ({
    product_id: p.id, name: p.name_fr, name_en: p.name_en, name_sv: p.name_sv,
    qty: i === 0 ? 2 : 1, price: Number(p.price) || 0, image_url: p.image_url,
  }));

  const front = await urlVitrine();
  const offre = await offreDeLaSemaine(rang, quand);
  const { sujet, html } = await composerRelance({
    lignesBrutes, prenom: 'Victoria', lang, rang, offre, front,
    lienPanier: `${front}/panier.html`, lienDesinscription: '#',
  });

  if (q.get('format') === 'json') return NextResponse.json({ sujet, offre });
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Sujet': encodeURIComponent(sujet) } });
}
