import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { rehostImage, isSelfHosted } from '@/lib/rehost-image';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ─── Auth ─────────────────────────────────────────────────────────
async function requireAuth(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  return user;
}

// Exécute des tâches async avec une concurrence bornée
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

type Row = { id: string; name_fr: string; image_url: string | null; extra_images: unknown };

async function fetchExternal(): Promise<Row[]> {
  const { data } = await supabaseAdmin
    .from('products')
    .select('id, name_fr, image_url, extra_images')
    .order('sort_order', { ascending: true });
  const rows = (data || []) as Row[];
  // On ne garde que les produits dont l'image principale OU une image de galerie
  // est externe (non self-hosted).
  return rows.filter(r => {
    const main = typeof r.image_url === 'string' && r.image_url && !isSelfHosted(r.image_url);
    const extras = Array.isArray(r.extra_images)
      && (r.extra_images as string[]).some(u => typeof u === 'string' && u && !isSelfHosted(u));
    return main || extras;
  });
}

// ─── GET — état des lieux (dry-run, ne modifie rien) ──────────────
export async function GET(req: NextRequest) {
  if (!(await requireAuth(req))) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const rows = await fetchExternal();

  // Teste la joignabilité de l'image principale externe de chaque produit
  const checked = await mapLimit(rows, 6, async (r) => {
    let status = 0;
    const url = r.image_url || '';
    if (url && !isSelfHosted(url)) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*,*/*' },
          signal: AbortSignal.timeout(10000),
        });
        status = res.status;
      } catch { status = -1; }
    }
    return {
      id: r.id,
      name: r.name_fr,
      image_url: url,
      main_status: status,           // 200 = OK, 404 = mort, -1 = injoignable
      main_alive: status >= 200 && status < 400,
    };
  });

  const dead = checked.filter(c => c.image_url && !c.main_alive);
  return NextResponse.json({
    total_external: rows.length,
    dead_count: dead.length,
    dead,                            // produits à re-scraper (image déjà 404)
    products: checked,
  });
}

// ─── POST — rapatrie réellement les images dans le Storage ────────
export async function POST(req: NextRequest) {
  if (!(await requireAuth(req))) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const rows = await fetchExternal();

  const results = await mapLimit(rows, 4, async (r) => {
    let changed = false;
    const update: Record<string, unknown> = {};

    // Image principale
    if (typeof r.image_url === 'string' && r.image_url && !isSelfHosted(r.image_url)) {
      const rehosted = await rehostImage(r.image_url);
      if (rehosted) { update.image_url = rehosted; changed = true; }
    }

    // Galerie
    if (Array.isArray(r.extra_images) && r.extra_images.length > 0) {
      const extras = r.extra_images as string[];
      let extrasChanged = false;
      const newExtras = await mapLimit(extras, 3, async (u) => {
        if (typeof u !== 'string' || !u || isSelfHosted(u)) return u;
        const rehosted = await rehostImage(u);
        if (rehosted) { extrasChanged = true; return rehosted; }
        return u; // garde l'original si le rapatriement échoue
      });
      if (extrasChanged) { update.extra_images = newExtras; changed = true; }
    }

    if (changed) {
      await supabaseAdmin.from('products').update(update).eq('id', r.id);
    }

    const mainStillExternal =
      typeof (update.image_url ?? r.image_url) === 'string' &&
      !isSelfHosted((update.image_url ?? r.image_url) as string) &&
      !!(update.image_url ?? r.image_url);

    return { id: r.id, name: r.name_fr, rehosted: changed, main_still_external: mainStillExternal };
  });

  const rehostedCount = results.filter(r => r.rehosted).length;
  const failed        = results.filter(r => r.main_still_external); // image morte → à re-scraper

  return NextResponse.json({
    message: `${rehostedCount}/${rows.length} produits rapatriés. ${failed.length} image(s) principale(s) toujours externe(s) (probablement 404 → à re-scraper).`,
    rehosted: rehostedCount,
    total_external: rows.length,
    failed,
    results,
  });
}
