import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || 'svenska-media';
const MAX_SIZE_MB = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

// ─── POST /api/upload ─────────────────────────────────────────────
// Upload une image vers Supabase Storage
// multipart/form-data: file (File), folder (string optionnel)
export async function POST(req: NextRequest) {
  // Auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
  }

  // Parse multipart
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const folder = (formData.get('folder') as string) || 'products';
  const altText = (formData.get('alt_text') as string) || '';

  if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });

  // Validation type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({
      error: `Type non accepté. Types autorisés : ${ALLOWED_TYPES.join(', ')}`
    }, { status: 400 });
  }

  // Validation taille
  const sizeMB = file.size / 1024 / 1024;
  if (sizeMB > MAX_SIZE_MB) {
    return NextResponse.json({
      error: `Fichier trop lourd (${sizeMB.toFixed(1)} MB). Maximum ${MAX_SIZE_MB} MB.`
    }, { status: 400 });
  }

  // Génération nom unique
  const ext       = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const slug      = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 40);
  const timestamp = Date.now();
  const filename  = `${folder}/${slug}-${timestamp}.${ext}`;

  // Upload vers Supabase Storage
  const buffer = await file.arrayBuffer();
  const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // URL publique
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(filename);

  // Enregistrement en base media library
  const { data: mediaRecord } = await supabaseAdmin
    .from('media')
    .insert({
      filename: file.name,
      url: publicUrl,
      size: file.size,
      mime_type: file.type,
      alt_text: altText,
    })
    .select()
    .single();

  return NextResponse.json({
    success: true,
    url: publicUrl,
    filename,
    media: mediaRecord,
  }, { status: 201 });
}

// ─── GET /api/upload ──────────────────────────────────────────────
// Liste tous les médias uploadés
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '50');

  const { data, error } = await supabaseAdmin
    .from('media')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ media: data, total: data?.length ?? 0 });
}

// ─── DELETE /api/upload ───────────────────────────────────────────
// Supprime un fichier du Storage + la ligne media
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: 'Token invalide' }, { status: 401 });

  const { mediaId, storagePath } = await req.json();

  if (storagePath) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
  }
  if (mediaId) {
    await supabaseAdmin.from('media').delete().eq('id', mediaId);
  }

  return NextResponse.json({ success: true });
}
