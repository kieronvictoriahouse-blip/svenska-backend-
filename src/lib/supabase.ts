import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client public — utilisé côté navigateur et dans les API routes lecture
export const supabase = createClient(supabaseUrl, supabaseAnon);

// Client admin — utilisé dans les API routes écriture (jamais exposé au front)
export const supabaseAdmin = createClient(supabaseUrl, supabaseService, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Types TypeScript
export type Product = {
  id: string;
  category_id: string | null;
  name_sv: string; name_fr: string; name_en: string;
  subtitle_sv?: string; subtitle_fr?: string; subtitle_en?: string;
  desc_sv?: string; desc_fr?: string; desc_en?: string;
  price: number;
  weight?: string;
  origin_sv?: string; origin_fr?: string; origin_en?: string;
  image_url?: string;
  badge?: 'badge-new' | 'badge-pop' | 'badge-org' | 'badge-must' | null;
  is_bestseller: boolean;
  is_new: boolean;
  is_active: boolean;
  rating: number;
  reviews_count: number;
  tags: string[];
  usage_sv?: string; usage_fr?: string; usage_en?: string;
  ingredients_sv?: string; ingredients_fr?: string; ingredients_en?: string;
  storage_sv?: string; storage_fr?: string; storage_en?: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  categories?: Category;
  product_variants?: ProductVariant[];
};

export type ProductVariant = {
  id: string;
  product_id: string;
  label: string;
  price: number;
  is_default: boolean;
  sort_order: number;
};

export type Category = {
  id: string;
  slug: string;
  emoji: string;
  name_sv: string; name_fr: string; name_en: string;
  sort_order: number;
  is_active: boolean;
};

export type HomepageSection = {
  id: string;
  key: string;
  title_sv?: string; title_fr?: string; title_en?: string;
  subtitle_sv?: string; subtitle_fr?: string; subtitle_en?: string;
  body_sv?: string; body_fr?: string; body_en?: string;
  image_url?: string;
  cta_label_sv?: string; cta_label_fr?: string; cta_label_en?: string;
  cta_url?: string;
  is_active: boolean;
  sort_order: number;
};

export type MediaItem = {
  id: string;
  filename: string;
  url: string;
  size?: number;
  mime_type?: string;
  alt_text?: string;
  uploaded_at: string;
};
