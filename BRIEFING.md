# Svenska Delikatessen — Back-end : Briefing technique complet
*Document de passation · À coller en début de conversation Claude*

---

## 🎯 Contexte du projet

**Projet :** Svenska Delikatessen — épicerie suédoise en ligne (projet familial de la femme de Kieron, qui est suédoise).

**Ce qui existe déjà :**
- **Front-end** : site multi-pages HTML/JS vanilla (index, boutique, produit, contact, a-propos) déployé sur **Netlify** → `thriving-pony-1275a9.netlify.app`
- **Back-end** : dossier `svenska-backend/` — Next.js 14 + Supabase — **créé mais pas encore déployé**
- **Supabase** : compte existant (Kieron le connaît via RentaCalc). À configurer pour ce projet.

---

## 🏗️ Architecture back-end créée

### Stack
- **Framework** : Next.js 14 (App Router, TypeScript)
- **BDD** : Supabase PostgreSQL
- **Storage** : Supabase Storage (bucket `svenska-media`, public)
- **Auth** : Supabase Auth (email + password, admin uniquement)
- **Port dev** : 3001 (pour ne pas conflter avec d'autres projets)

### Structure des fichiers
```
svenska-backend/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout
│   │   ├── globals.css                   # CSS complet du dashboard admin
│   │   ├── login/page.tsx                # Page de login admin
│   │   └── admin/
│   │       ├── layout.tsx                # Layout sidebar admin (auth guard)
│   │       ├── page.tsx                  # Dashboard — KPIs + tableau produits
│   │       ├── produits/
│   │       │   ├── page.tsx              # Liste produits (search, filtres, toggle actif)
│   │       │   └── [id]/page.tsx         # Formulaire création/édition produit (= "nouveau" ou UUID)
│   │       ├── categories/page.tsx       # Gestion catégories
│   │       ├── homepage/page.tsx         # Éditeur page d'accueil (sections + bestsellers + nouveautés)
│   │       └── medias/page.tsx           # Médiathèque (upload drag&drop, copier URL, supprimer)
│   │
│   └── lib/
│       └── supabase.ts                   # Clients Supabase (public + admin) + types TypeScript
│
├── src/app/api/
│   ├── auth/login/route.ts               # POST /api/auth/login, GET (vérif token)
│   ├── products/
│   │   ├── route.ts                      # GET (public, filtres) · POST (admin, créer)
│   │   └── [id]/route.ts                 # GET (public) · PUT (admin) · DELETE (soft delete)
│   ├── categories/route.ts               # GET (public) · POST (admin)
│   ├── homepage/route.ts                 # GET (public, tout) · PUT (admin, section)
│   └── upload/route.ts                   # POST (upload Storage) · GET (liste médias) · DELETE
│
├── supabase/migrations/
│   └── 001_initial_schema.sql            # 🔑 TOUT le schéma à coller dans Supabase SQL Editor
│
├── package.json
├── next.config.js                        # Headers CORS pour le front Netlify
├── tsconfig.json
├── .gitignore
└── .env.local.example                    # Variables d'environnement à remplir
```

---

## 🗄️ Schéma base de données

### Tables principales
| Table | Rôle |
|-------|------|
| `categories` | Catégories produits (10 créées) |
| `products` | Produits (trilingue sv/fr/en, image, badge, variants, tags) |
| `product_variants` | Conditionnements par produit (50g, 100g, Kit…) |
| `homepage_sections` | Contenu éditorial des sections home (hero, bands…) |
| `homepage_featured` | Produits mis en avant en home |
| `media` | Bibliothèque des images uploadées |
| `admin_profiles` | Profil admin (lié à auth.users Supabase) |

### Row Level Security
- **Lecture** : publique pour produits, catégories, homepage_sections
- **Écriture** : `authenticated` uniquement (admin connecté)

### Bucket Storage
- Nom : `svenska-media`
- Accès : public en lecture, authentifié en écriture
- Dossiers : `products/` (images produits), `library/` (médiathèque générale)

---

## 🔌 API REST — Documentation complète

Base URL : `https://svenska-backend.vercel.app` (ou `http://localhost:3001` en dev)

### Auth
```
POST /api/auth/login
Body: { email, password }
Retour: { user, access_token, refresh_token, expires_at }

GET /api/auth/login
Header: Authorization: Bearer <token>
Retour: { user } ou 401
```

### Produits (lecture publique)
```
GET /api/products
Params: ?cat=epices&bestseller=true&new=true&limit=20&search=cardamome
Retour: { products: [...], total: N }

GET /api/products/:id
Retour: { product: { ...fields, categories, product_variants } }
```

### Produits (admin — Bearer token requis)
```
POST /api/products
Body: { name_fr*, price*, category_id, name_sv, name_en, subtitle_*, desc_*, 
        origin_*, usage_*, ingredients_*, storage_*, image_url, badge, tags[],
        is_bestseller, is_new, is_active, rating, reviews_count, sort_order,
        variants: [{ label, price }] }
Retour: { product } 201

PUT /api/products/:id
Body: (tous les champs optionnels, + variants pour remplacer)
Retour: { product }

DELETE /api/products/:id  ← Soft delete (is_active = false)
Retour: { message: 'Produit désactivé' }
```

### Catégories
```
GET /api/categories → { categories: [...] }
POST /api/categories (admin) → { category }
```

### Homepage
```
GET /api/homepage
Retour: { sections, bestsellers, new_arrivals, snacks }

PUT /api/homepage (admin)
Body: { key: 'hero', title_fr: '...', body_fr: '...', ... }
```

### Upload
```
POST /api/upload (admin, multipart/form-data)
Fields: file (File), folder ('products'|'library'), alt_text (string)
Retour: { url, filename, media }

GET /api/upload?limit=50 (admin)
Retour: { media: [...] }

DELETE /api/upload (admin)
Body: { mediaId, storagePath }
```

---

## 🔗 Intégration avec le front Netlify

Le front HTML doit appeler les API du back-end pour charger les données dynamiquement (plutôt que le tableau JS statique actuel).

### Exemple d'intégration dans `app.js` du front :
```javascript
const API_BASE = 'https://svenska-backend.vercel.app';

async function loadProducts() {
  const res = await fetch(`${API_BASE}/api/products`);
  const { products } = await res.json();
  // Remplace le tableau PRODUCTS[] statique
  return products.map(adaptProduct);
}

// Adapter le format API → format attendu par le front
function adaptProduct(p) {
  return {
    id:          p.id,
    cat:         p.categories?.slug || '',
    badge:       p.badge || '',
    rating:      p.rating,
    reviews:     p.reviews_count,
    photo:       p.image_url || '',
    name:        { sv: p.name_sv, fr: p.name_fr, en: p.name_en },
    subtitle:    { sv: p.subtitle_sv, fr: p.subtitle_fr, en: p.subtitle_en },
    origin:      { sv: p.origin_sv, fr: p.origin_fr, en: p.origin_en },
    desc:        { sv: p.desc_sv, fr: p.desc_fr, en: p.desc_en },
    price:       p.price,
    weight:      p.weight,
    tags:        p.tags || [],
    variants:    (p.product_variants || []).map(v => ({ label: v.label, price: v.price })),
    bestseller:  p.is_bestseller,
    isNew:       p.is_new,
    usage:       { sv: p.usage_sv, fr: p.usage_fr, en: p.usage_en },
    ingredients: { sv: p.ingredients_sv, fr: p.ingredients_fr, en: p.ingredients_en },
    storage:     { sv: p.storage_sv, fr: p.storage_fr, en: p.storage_en },
  };
}
```

---

## 🚀 Guide de déploiement — Étapes dans l'ordre

### 1️⃣ Supabase — Créer le projet
1. Aller sur `supabase.com` → New project
2. Nommer : `svenska-delikatessen`
3. Région : `eu-west-1` (Ireland) ou proche de la France
4. Copier **Project URL** et **anon key** (Settings > API)

### 2️⃣ Supabase — Créer le schéma
1. Supabase > SQL Editor > New query
2. Coller le contenu de `supabase/migrations/001_initial_schema.sql`
3. Cliquer **Run** → doit afficher "Success"

### 3️⃣ Supabase — Créer le bucket Storage
1. Supabase > Storage > New bucket
2. Nom : `svenska-media`
3. ✅ Public bucket
4. Dans l'onglet **Policies**, ajouter :
   - `SELECT` → for everyone
   - `INSERT` → for authenticated users
   - `DELETE` → for authenticated users

### 4️⃣ Supabase — Créer le compte admin
1. Supabase > Authentication > Users > Invite user
2. Email : `kieron@svenska-delikatessen.com` (ou l'email voulu)
3. Un mail est envoyé pour définir le mot de passe

### 5️⃣ Variables d'environnement
Créer `.env.local` à la racine de `svenska-backend/` :
```env
NEXT_PUBLIC_SUPABASE_URL=https://XXXXXXXXXXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=svenska-media
ADMIN_EMAIL=kieron@svenska-delikatessen.com
NEXT_PUBLIC_APP_URL=http://localhost:3001
NEXT_PUBLIC_FRONT_URL=https://thriving-pony-1275a9.netlify.app
```

### 6️⃣ Test local
```bash
cd svenska-backend
npm install
npm run dev
# → http://localhost:3001/login
```

### 7️⃣ Déploiement Vercel
```bash
# Option A — CLI Vercel
npm i -g vercel
vercel login
vercel --prod

# Option B — GitHub + Vercel
# Push le dossier sur GitHub → connecter sur vercel.com
# Ajouter les env vars dans Vercel > Settings > Environment Variables
```

### 8️⃣ Activer les CORS pour le front Netlify
Dans `next.config.js`, la wildcard `*` est déjà en place.
Pour plus de sécurité, remplacer `*` par l'URL exacte Netlify.

---

## 📋 Ce qui reste à faire (prochaines étapes)

### Court terme
- [ ] **Déploiement Vercel** du back-end
- [ ] **Migration données** : scripter l'import des 36 produits existants (JS → Supabase)
- [ ] **Connexion front ↔ back** : remplacer le tableau PRODUCTS[] statique par appels API
- [ ] **Snipcart** ou paiement : intégrer dans le front pour les commandes

### Moyen terme
- [ ] **Import produits en masse** via CSV dans l'admin
- [ ] **Gestion commandes** (si volume justifie)
- [ ] **Domaine custom** : `svenska-delikatessen.fr`
- [ ] **CGV + mentions légales** (obligatoire pour boutique FR)

### À implémenter dans le back-end
- [ ] Route `/api/products` — tri par popularité réelle
- [ ] Duplication produit
- [ ] Export CSV produits
- [ ] Historique modifications (audit log)
- [ ] Gestion des stocks (champ `stock_qty` à ajouter)

---

## 🎨 Design system du dashboard admin

- **Couleurs** : identique au front (moss `#3E5238`, copper `#9E5A3C`)
- **Font** : Jost (UI) + Cormorant Garamond (titres)
- **Sidebar** : fond `#1C2028` (midnight), 260px largeur
- **Cards** : fond blanc, border `#D8CEBC` (linen)

---

## 🔑 Credentials & accès

| Service | URL |
|---------|-----|
| Dashboard admin | `http://localhost:3001/admin` (dev) ou `https://svenska-backend.vercel.app/admin` |
| Supabase | `https://supabase.com/dashboard` |
| Front Netlify | `https://thriving-pony-1275a9.netlify.app` |
| GitHub back-end | À créer |

---

## 🐛 Points d'attention

1. **SUPABASE_SERVICE_ROLE_KEY** : ne JAMAIS exposer côté client. Uniquement dans les API routes Next.js.
2. **RLS activé** sur toutes les tables — vérifier que les policies sont bien appliquées.
3. **Token Supabase expire** après 1h. Le front-end admin gère le refresh automatiquement via Supabase client. Mais l'implémentation actuelle stocke juste le `access_token` en localStorage — à améliorer avec un refresh token flow.
4. **CORS** : la config actuelle accepte `*` — à restreindre au domaine Netlify en production.
5. **Images** : le front utilise encore des URLs Unsplash en fallback — les remplacer par de vraies photos produits dans Supabase Storage.

---

*Document généré automatiquement · Svenska Delikatessen · Back-end v1 · Avril 2026*
