import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: 'URL manquante' }, { status: 400 });

  let html: string;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'sv-SE,sv;q=0.9,fr;q=0.8,en;q=0.7',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err: any) {
    return NextResponse.json({ error: `Page inaccessible : ${err.message}` }, { status: 400 });
  }

  // ── Extract structured data before cleaning ──────────────────────
  // JSON-LD (most reliable source for product data)
  const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const jsonLdBlocks = jsonLdMatches.map(m => {
    try { return JSON.stringify(JSON.parse(m.replace(/<[^>]+>/g, ''))); } catch { return ''; }
  }).filter(Boolean).join('\n');

  // og:image and other meta images
  const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)?.[1] || '';
  const twitterImage = html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]+)"/i)?.[1] || '';

  // Extract image URLs — absolute AND relative (Santa Maria and many sites use relative paths)
  const baseOrigin = new URL(url).origin;
  const toAbsolute = (u: string) =>
    u.startsWith('http') ? u : `${baseOrigin}${u.startsWith('/') ? '' : '/'}${u}`;

  // Absolute URLs
  const absoluteMatches = html.match(/https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/gi) || [];
  // Relative URLs from src/data-src attributes
  const relativeMatches = [...html.matchAll(/(?:src|data-src)=["']([^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)/gi)]
    .map(m => toAbsolute(m[1]));

  const isWebp = (u: string) => /\.webp(\?|$)/i.test(u);
  const isNoise = (u: string) => u.includes('icon') || u.includes('logo') || u.includes('sprite') || u.includes('paulig') || u.includes('kundo');
  const jpgVariant = (u: string) => u.replace(/\.webp(\?|$)/i, (_: string, s: string) => '.jpg' + (s || ''));

  const candidates = [
    ...(ogImage ? [toAbsolute(ogImage)] : []),
    ...(twitterImage ? [toAbsolute(twitterImage)] : []),
    ...relativeMatches.filter(u => !isNoise(u)),
    ...absoluteMatches.map(toAbsolute).filter(u => !isNoise(u)),
  ];

  // For each WebP URL insert a .jpg attempt before it
  const expanded: string[] = [];
  for (const u of candidates) {
    if (isWebp(u)) {
      expanded.push(jpgVariant(u));
      expanded.push(u);
    } else {
      expanded.push(u);
    }
  }
  const imageUrls = Array.from(new Set(expanded)).slice(0, 12);

  // Clean HTML — remove noise but keep text content
  const cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{3,}/g, '\n')
    .trim()
    .slice(0, 24000);

  // ── Call Claude ──────────────────────────────────────────────────
  let product: any;
  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `Tu es un expert en import de produits pour une épicerie premium nordique & britannique.

Analyse ces données d'une page produit et extrais TOUT ce que tu trouves, en JSON strict (sans markdown).

DONNÉES STRUCTURÉES (JSON-LD, très fiables) :
${jsonLdBlocks || '(aucune)'}

TEXTE DE LA PAGE :
${cleaned}

Retourne ce JSON exact (remplis chaque champ au maximum, laisse chaîne vide si vraiment introuvable) :
{
  "name_sv": "nom original en suédois (ou anglais si site anglais)",
  "name_fr": "nom traduit naturellement en français, appétissant",
  "name_en": "name in English",
  "subtitle_sv": "accroche courte en suédois, 8 mots max",
  "subtitle_fr": "accroche courte en français, 8 mots max, style épicerie fine",
  "subtitle_en": "short tagline in English, 8 words max",
  "desc_sv": "description 3-4 phrases en suédois (langue originale si page suédoise)",
  "desc_fr": "description 3-4 phrases en français, ton éditorial premium, parle du goût/usage/origine",
  "desc_en": "3-4 sentence description in English, premium editorial tone",
  "ingredients_sv": "liste complète des ingrédients en suédois (texte original si disponible)",
  "ingredients_fr": "liste complète des ingrédients traduite en français",
  "ingredients_en": "complete ingredients list in English",
  "allergens_sv": "allergènes en suédois ex: Innehåller: gluten, mjölk",
  "allergens_fr": "allergènes en français ex: Contient : gluten, lait",
  "allergens_en": "allergens in English ex: Contains: gluten, milk",
  "storage_sv": "conseils de conservation en suédois",
  "storage_fr": "conseils de conservation en français",
  "storage_en": "storage instructions in English",
  "usage_sv": "suggestions d'utilisation en suédois",
  "usage_fr": "suggestions d'utilisation en français (recette, occasion, accord)",
  "usage_en": "usage suggestions in English",
  "nutrition": {
    "energie": "valeur en kcal/kJ",
    "graisses": "g",
    "dont_satures": "g",
    "glucides": "g",
    "dont_sucres": "g",
    "fibres": "g",
    "proteines": "g",
    "sel": "g",
    "portion": "taille de la portion"
  },
  "weight": "poids/volume ex: 24g, 250ml, 12x30g (texte tel que sur l'emballage)",
  "price": 0.0,
  "brand": "marque du produit",
  "category": "une seule valeur parmi: Épices, Biscuits, Confitures, Boissons, Céréales, Snacks, Condiments, Autre",
  "labels": [],
  "origin_sv": "ursprungsland på svenska",
  "origin_fr": "pays d'origine en français",
  "origin_en": "country of origin in English",
  "emoji": "un seul emoji représentant ce produit",
  "is_new": true,
  "is_bestseller": false
}

Règles :
- price = prix de vente suggéré EUR pour épicerie premium (marge x2.5 sur prix import estimé). Si prix visible sur page, utilise-le comme base.
- labels = parmi ["Vegan", "Bio", "Sans gluten", "Sans lactose", "Halal", "Kosher"] uniquement si certifié explicitement
- Pour desc_fr : ne jamais commencer par "Ce produit", parle du goût, de l'expérience, de l'usage
- nutrition : mets chaîne vide "" si valeur non trouvée, ne pas inventer`,
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON non trouvé dans la réponse Claude');
    product = JSON.parse(jsonMatch[0]);
  } catch (err: any) {
    return NextResponse.json({ error: `Extraction échouée : ${err.message}` }, { status: 500 });
  }

  product.image_urls = imageUrls;
  product.source_url = url;

  const { data: cats } = await supabaseAdmin.from('categories').select('id, name_fr, slug');

  return NextResponse.json({ product, categories: cats || [] });
}
