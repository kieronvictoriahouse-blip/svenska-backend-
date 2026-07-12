import { supabaseAdmin } from './supabase';

const BUCKET       = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'svenska-media';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const MAX_BYTES    = 8 * 1024 * 1024; // 8 MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
};

/** True si l'URL pointe déjà sur notre propre Supabase Storage (rien à rapatrier). */
export function isSelfHosted(url: string): boolean {
  if (!url || !SUPABASE_URL) return false;
  return url.startsWith(SUPABASE_URL) || url.includes('/storage/v1/object/public/');
}

/**
 * Télécharge une image externe et la ré-héberge dans notre bucket Supabase.
 * Retourne l'URL publique permanente, ou null en cas d'échec (image morte,
 * type invalide, trop lourde, réseau…). Une URL déjà self-hosted est renvoyée
 * telle quelle. C'est ce qui évite les liens morts type olw.se qui renumérote
 * ses médias WordPress à chaque refresh.
 */
export async function rehostImage(srcUrl: string, folder = 'products'): Promise<string | null> {
  if (!srcUrl || typeof srcUrl !== 'string' || !srcUrl.startsWith('http')) return null;
  if (isSelfHosted(srcUrl)) return srcUrl;

  let contentType = '';
  let buffer: ArrayBuffer;
  try {
    const res = await fetch(srcUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,*/*',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return null;
    buffer = await res.arrayBuffer();
  } catch {
    return null;
  }

  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;

  const ext = EXT_BY_MIME[contentType] || 'jpg';
  let base = 'img';
  try {
    const path = new URL(srcUrl).pathname;
    base = (path.split('/').pop() || 'img')
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 40) || 'img';
  } catch { /* garde 'img' */ }

  const filename = `${folder}/${base}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType, upsert: false });
  if (upErr) return null;

  const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(filename);

  // Enregistrement best-effort dans la media library (n'échoue jamais le rapatriement)
  try {
    await supabaseAdmin.from('media').insert({
      filename: filename.split('/').pop(),
      url: publicUrl,
      size: buffer.byteLength,
      mime_type: contentType,
      alt_text: '',
    });
  } catch { /* ignore */ }

  return publicUrl;
}
