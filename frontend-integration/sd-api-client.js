/**
 * ═══════════════════════════════════════════════════════════════
 * SVENSKA DELIKATESSEN — API Client
 * À inclure dans index.html, boutique.html, produit.html
 *
 * Remplace le tableau PRODUCTS statique par des données dynamiques
 * depuis l'API Next.js (Vercel ou Railway).
 *
 * Usage :
 *   1. Ajouter ce script AVANT app.js dans chaque page HTML
 *   2. Définir SD_API_URL (voir config ci-dessous)
 *   3. Appeler `await SD.loadProducts()` dans initPage()
 * ═══════════════════════════════════════════════════════════════
 */

// ── CONFIG ──────────────────────────────────────────────────────
const SD_API_URL = 'https://votre-backend.vercel.app'; // ← à remplacer

// ── API CLIENT ──────────────────────────────────────────────────
const SD = {

  /** Charge tous les produits depuis l'API et remplace PRODUCTS global */
  async loadProducts({ cat, bestseller, isNew, limit } = {}) {
    const params = new URLSearchParams();
    if (cat)         params.set('cat', cat);
    if (bestseller)  params.set('bestseller', 'true');
    if (isNew)       params.set('new', 'true');
    if (limit)       params.set('limit', limit);

    try {
      const res  = await fetch(`${SD_API_URL}/api/products?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Convertir le format API → format JS du front
      window.PRODUCTS = (data.products || []).map(SD._mapProduct);
      return window.PRODUCTS;
    } catch (err) {
      console.warn('[SD] API indisponible, utilisation des données statiques', err);
      return window.PRODUCTS || [];
    }
  },

  /** Charge la config de la page d'accueil */
  async loadHomepage() {
    try {
      const res  = await fetch(`${SD_API_URL}/api/homepage`);
      const data = await res.json();
      return data;
    } catch (err) {
      console.warn('[SD] Homepage API indisponible', err);
      return null;
    }
  },

  /** Charge un produit seul par ID */
  async loadProduct(id) {
    try {
      const res  = await fetch(`${SD_API_URL}/api/products/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return SD._mapProduct(data.product);
    } catch (err) {
      // Fallback sur le tableau statique
      return window.PRODUCTS?.find(p => String(p.id) === String(id)) || null;
    }
  },

  /** Mappe un produit API vers le format front */
  _mapProduct(p) {
    const catLabel = p.categories ? {
      sv: p.categories.name_sv,
      fr: p.categories.name_fr,
      en: p.categories.name_en,
    } : { sv: p.cat || '', fr: p.cat || '', en: p.cat || '' };

    return {
      id:          p.id,
      cat:         p.categories?.name_fr || '',
      catSlug:     p.categories?.slug    || '',
      badge:       p.badge || null,
      rating:      parseFloat(p.rating) || 4.5,
      reviews:     p.reviews_count || 0,
      photo:       p.image_url || null,

      name:     { sv: p.name_sv,     fr: p.name_fr,     en: p.name_en     },
      subtitle: { sv: p.subtitle_sv, fr: p.subtitle_fr, en: p.subtitle_en },
      desc:     { sv: p.desc_sv,     fr: p.desc_fr,     en: p.desc_en     },
      origin:   { sv: p.origin_sv,   fr: p.origin_fr,   en: p.origin_en   },

      price:    parseFloat(p.price) || 0,
      weight:   p.weight || '',
      tags:     Array.isArray(p.tags) ? p.tags : [],

      variants: p.product_variants?.length
        ? p.product_variants.sort((a, b) => a.sort_order - b.sort_order)
            .map(v => ({ label: v.label, price: parseFloat(v.price) }))
        : [{ label: p.weight || '1 unité', price: parseFloat(p.price) }],

      usage:       { sv: p.usage_sv,       fr: p.usage_fr,       en: p.usage_en       },
      ingredients: { sv: p.ingredients_sv, fr: p.ingredients_fr, en: p.ingredients_en },
      storage:     { sv: p.storage_sv,     fr: p.storage_fr,     en: p.storage_en     },

      bestseller: p.is_bestseller,
      isNew:      p.is_new,
      catLabel,
    };
  },
};

// ── AUTO-INIT ────────────────────────────────────────────────────
// Charge les produits au démarrage — remplace les données statiques
(async function () {
  // Lire le param ?cat depuis l'URL si présent
  const urlCat = new URLSearchParams(window.location.search).get('cat');
  await SD.loadProducts({ cat: urlCat || undefined });
  // Déclencher un événement pour que les pages sachent que les données sont prêtes
  document.dispatchEvent(new CustomEvent('sd:products-loaded'));
})();
