import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   HAUT DE LA PAGE D'ACCUEIL — image fixe ou carrousel

   GET  /api/hero          public : ce que la vitrine doit afficher
                           aujourd'hui (diapositives visibles seulement).
   GET  /api/hero?admin=1  admin  : toutes les diapositives, y compris
                           masquées, programmées ou terminées.
   PUT  /api/hero          admin  : publie l'état complet de l'écran
                           (réglages + liste ordonnée). Une diapositive
                           absente de la liste est supprimée.

   Réglages dans cms_home (hero_mode, hero_interval, hero_image) pour
   que l'image fixe reste celle de « Textes d'accueil ». Diapositives
   dans home_slides (migration 058).
   ═══════════════════════════════════════════════════════════════ */

const LANGS = ['fr', 'en', 'sv'] as const;
const TEXTS = ['alt', 'eyebrow', 'title', 'subtitle', 'cta_label'] as const;
const KINDS = ['default', 'custom', 'image'] as const;
const MAX_LEN: Record<(typeof TEXTS)[number], number> = { alt: 200, eyebrow: 80, title: 160, subtitle: 400, cta_label: 40 };

const INTERVAL_MIN = 3;
const INTERVAL_MAX = 20;
const INTERVAL_DEFAULT = 5;
const MAX_SLIDES = 12;

const PUBLIC_COLUMNS = [
  'id', 'kind', 'image_url', 'image_mobile_url', 'link_url', 'starts_on', 'ends_on',
  ...TEXTS.flatMap(f => LANGS.map(l => `${f}_${l}`)),
].join(',');

/** Date du jour à Paris : une promo « jusqu'au 31 » doit tenir jusqu'à
 *  minuit heure française, pas jusqu'à 1 h du matin UTC. */
function todayParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function isVisible(s: any, today: string): boolean {
  if (!s.is_active) return false;
  if (s.starts_on && today < String(s.starts_on).slice(0, 10)) return false;
  if (s.ends_on && today > String(s.ends_on).slice(0, 10)) return false;
  return true;
}

async function readSettings() {
  const { data } = await supabaseAdmin.from('cms_home')
    .select('key, value_fr').in('key', ['hero_mode', 'hero_interval', 'hero_image']);
  const v = Object.fromEntries((data || []).map((r: any) => [r.key, r.value_fr || '']));
  const n = parseInt(v.hero_interval, 10);
  return {
    mode: v.hero_mode === 'carousel' ? 'carousel' : 'image',
    interval: Number.isFinite(n) ? Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, n)) : INTERVAL_DEFAULT,
    image: v.hero_image || '',
  };
}

export async function GET(req: NextRequest) {
  const admin = new URL(req.url).searchParams.get('admin') === '1';
  if (admin && !await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const settings = await readSettings();
  const { data, error } = await supabaseAdmin.from('home_slides')
    .select(admin ? '*' : `${PUBLIC_COLUMNS},is_active`)
    .order('sort_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = todayParis();
  if (admin) {
    return NextResponse.json({ ...settings, today, slides: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const slides = (data || []).filter((s: any) => isVisible(s, today)).map(({ is_active, ...s }: any) => s);
  return NextResponse.json({ ...settings, slides });
}

/* ── Validation d'une diapositive envoyée par l'écran ─────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Lien du bouton : page du site (« boutique.html?cat=… », « /recettes »),
 *  ancre ou adresse http(s). Tout autre schéma (javascript:, data:…) est refusé. */
function cleanLink(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:\/\//i.test(s)) return null;
  return s.slice(0, 500);
}

function cleanImage(v: unknown): string {
  const s = String(v ?? '').trim();
  return /^(https?:\/\/|\/)/i.test(s) ? s.slice(0, 1000) : '';
}

function cleanDay(v: unknown): string | null {
  const s = String(v ?? '').slice(0, 10);
  return DAY.test(s) ? s : null;
}

function normaliseSlide(raw: any, i: number): { row?: Record<string, any>; error?: string } {
  const n = i + 1;
  const kind = KINDS.includes(raw?.kind) ? raw.kind : 'default';
  const image_url = cleanImage(raw?.image_url);
  if (!image_url) return { error: `Diapositive ${n} : image manquante ou adresse invalide.` };

  const row: Record<string, any> = {
    sort_order: i,
    is_active: raw?.is_active !== false,
    kind,
    image_url,
    image_mobile_url: cleanImage(raw?.image_mobile_url) || null,
    link_url: cleanLink(raw?.link_url),
    starts_on: cleanDay(raw?.starts_on),
    ends_on: cleanDay(raw?.ends_on),
    updated_at: new Date().toISOString(),
  };
  for (const f of TEXTS) for (const l of LANGS) {
    const s = String(raw?.[`${f}_${l}`] ?? '').trim().slice(0, MAX_LEN[f]);
    row[`${f}_${l}`] = s || null;
  }
  if (row.starts_on && row.ends_on && row.starts_on > row.ends_on) {
    return { error: `Diapositive ${n} : la date de fin précède la date de début.` };
  }
  if (kind === 'custom' && !LANGS.some(l => row[`title_${l}`])) {
    return { error: `Diapositive ${n} : un texte propre demande au moins un titre.` };
  }
  if (typeof raw?.id === 'string' && UUID.test(raw.id)) row.id = raw.id;
  return { row };
}

export async function PUT(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.slides)) return NextResponse.json({ error: 'slides[] requis' }, { status: 400 });
  if (body.slides.length > MAX_SLIDES) {
    return NextResponse.json({ error: `${MAX_SLIDES} diapositives au maximum.` }, { status: 400 });
  }

  const rows: Record<string, any>[] = [];
  for (let i = 0; i < body.slides.length; i++) {
    const { row, error } = normaliseSlide(body.slides[i], i);
    if (error) return NextResponse.json({ error }, { status: 400 });
    rows.push(row!);
  }

  // Réglages — l'image fixe s'écrit dans les trois langues, comme sur « Textes d'accueil ».
  const mode = body.mode === 'carousel' ? 'carousel' : 'image';
  const n = parseInt(body.interval, 10);
  const interval = Number.isFinite(n) ? Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, n)) : INTERVAL_DEFAULT;
  const now = new Date().toISOString();
  const settings: Record<string, any>[] = [
    { key: 'hero_mode', label: 'Hero – Affichage (image | carousel)', type: 'setting', value_fr: mode, value_sv: mode, value_en: mode, updated_at: now },
    { key: 'hero_interval', label: 'Hero – Délai du carrousel (s)', type: 'setting', value_fr: String(interval), value_sv: String(interval), value_en: String(interval), updated_at: now },
  ];
  if (typeof body.image === 'string') {
    const img = body.image.trim() ? cleanImage(body.image) : '';
    if (body.image.trim() && !img) return NextResponse.json({ error: 'Image fixe : adresse invalide.' }, { status: 400 });
    settings.push({ key: 'hero_image', label: 'Hero – Photo de fond', type: 'image', value_fr: img, value_sv: img, value_en: img, updated_at: now });
  }
  const { error: sErr } = await supabaseAdmin.from('cms_home').upsert(settings, { onConflict: 'key' });
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  // Diapositives : mise à jour des connues, création des nouvelles, puis
  // suppression de celles retirées de la liste.
  const { data: existing, error: eErr } = await supabaseAdmin.from('home_slides').select('id');
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  const known = new Set((existing || []).map((r: any) => r.id));

  const keep: string[] = [];
  for (const row of rows) {
    if (row.id && known.has(row.id)) {
      const { id, ...upd } = row;
      const { error } = await supabaseAdmin.from('home_slides').update(upd).eq('id', id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      keep.push(id);
    } else {
      const { id: _ignore, ...ins } = row;
      const { data, error } = await supabaseAdmin.from('home_slides').insert(ins).select('id').single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      keep.push(data.id);
    }
  }
  const gone = Array.from(known).filter(id => !keep.includes(id));
  if (gone.length) {
    const { error } = await supabaseAdmin.from('home_slides').delete().in('id', gone);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const fresh = await readSettings();
  const { data: slides } = await supabaseAdmin.from('home_slides').select('*').order('sort_order', { ascending: true });
  return NextResponse.json({ ...fresh, today: todayParis(), slides: slides || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
