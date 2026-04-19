import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: 'URL manquante' }, { status: 400 });

  // Fetch the page
  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8,sv;q=0.7',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err: any) {
    return NextResponse.json({ error: `Page inaccessible : ${err.message}` }, { status: 400 });
  }

  // Strip scripts/styles, keep text content — reduce tokens
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .slice(0, 28000);

  // Extract image URLs from raw HTML before cleaning
  const imgMatches = html.match(/https?:\/\/[^"'\s]+\.(jpg|jpeg|png|webp)[^"'\s]*/gi) || [];
  const imageUrls = Array.from(new Set(imgMatches)).slice(0, 8);

  // Call Claude to extract + translate
  let product: any;
  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Tu es un expert en extraction de données produits pour une épicerie premium nordique & britannique.

Analyse ce HTML et extrais les données produit en JSON strict (aucun markdown, aucune explication).

Format attendu :
{
  "name_sv": "nom original (suédois/anglais si disponible, sinon vide)",
  "name_fr": "nom traduit en français, naturel et appétissant",
  "name_en": "name in English",
  "subtitle_fr": "accroche courte en français, 8 mots max, style épicerie fine",
  "desc_fr": "description 2-3 phrases en français, ton éditorial premium, donne envie",
  "desc_en": "2-3 sentence description in English, premium editorial tone",
  "ingredients_fr": "liste ingrédients traduite en français (si trouvée)",
  "weight": 0,
  "price": 0.0,
  "category": "une seule valeur parmi: Épices, Biscuits, Confitures, Boissons, Céréales, Snacks, Condiments, Autre",
  "labels": [],
  "origin_fr": "pays d'origine en français",
  "origin_en": "country of origin in English",
  "emoji": "un seul emoji représentant ce produit",
  "is_bestseller": false,
  "is_new": true
}

Règles :
- weight = poids en grammes (entier), 0 si inconnu
- price = prix de vente suggéré en EUR pour une épicerie premium parisienne (marque x2.5 sur prix fournisseur estimé)
- labels = tableau parmi ["Vegan", "Bio", "Sans gluten", "Sans lactose"] uniquement si certifié dans le HTML
- desc_fr : parle du goût, de l'usage, de l'origine — jamais de "ce produit est..."

HTML :
${cleaned}`,
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON non trouvé dans la réponse');
    product = JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    return NextResponse.json({ error: `Extraction échouée : ${err.message}` }, { status: 500 });
  }

  // Attach found image URLs
  product.image_urls = imageUrls;
  product.source_url = url;

  // Load categories for the frontend selector
  const { data: cats } = await supabaseAdmin.from('categories').select('id, name_fr, slug');

  return NextResponse.json({ product, categories: cats || [] });
}
