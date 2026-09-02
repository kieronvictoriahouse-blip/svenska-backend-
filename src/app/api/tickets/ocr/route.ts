import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { parseReceiptText } from '@/lib/ticket-ocr-parse';

/* ═══════════════════════════════════════════════════════════════
   OCR D'UN TICKET DE CAISSE

   Deux moteurs, par ordre de priorité :

   1. OCR.space — GRATUIT, activé par défaut. Rend du texte brut ;
      on le reconstruit en lignes via parseReceiptText. Fonctionne dès
      maintenant avec la clé de démonstration « helloworld », mais
      celle-ci est très bridée : pour un usage réel, crée une clé
      gratuite sur https://ocr.space/ocrapi et pose OCR_SPACE_API_KEY.

   2. Mindee (MINDEE_API_KEY) — payant, optionnel. Son modèle
      « expense receipt » rend directement des lignes structurées
      (quantité, prix unitaire), donc plus fiable si tu l'actives.

   Aucune ligne n'est inventée : si rien n'est lisible, la route le dit
   et l'écran bascule sur la saisie rapide.
   ═══════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type OcrLine = { label: string; qty: number; unit_price: number };

/* ── Mindee : lignes structurées ──────────────────────────────── */
async function runMindee(imageUrls: string[], key: string) {
  const lines: OcrLine[] = [];
  let totalOcr = 0;

  for (const url of imageUrls) {
    // Mindee attend le fichier lui-même (image ou PDF), pas une URL.
    const src = await fetch(url);
    if (!src.ok) throw new Error(`Fichier introuvable (${src.status})`);
    const blob = await src.blob();
    const isPdf = (blob.type || '').includes('pdf') || url.toLowerCase().endsWith('.pdf');

    const form = new FormData();
    form.append('document', blob, isPdf ? 'ticket.pdf' : 'ticket.jpg');

    const res = await fetch(
      'https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict',
      { method: 'POST', headers: { Authorization: `Token ${key}` }, body: form },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`OCR Mindee refusé (${res.status}) ${txt.slice(0, 160)}`);
    }

    const d = await res.json();
    const pred = d?.document?.inference?.prediction;
    if (!pred) continue;

    totalOcr += Number(pred.total_amount?.value) || 0;
    for (const it of (pred.line_items || [])) {
      const label = String(it.description || '').trim();
      if (!label) continue;
      const qty = Number(it.quantity) || 1;
      const total = Number(it.total_amount) || 0;
      const unit = Number(it.unit_price) || (qty > 0 ? total / qty : 0);
      lines.push({ label, qty, unit_price: Math.round(unit * 100) / 100 });
    }
  }

  return { lines, total_ocr: Math.round(totalOcr * 100) / 100 };
}

/* ── OCR.space : texte brut → parseur ─────────────────────────── */
async function runOcrSpace(imageUrls: string[], key: string, lang: string) {
  const lines: OcrLine[] = [];
  let total: number | null = null;

  for (const url of imageUrls) {
    const isPdf = url.toLowerCase().endsWith('.pdf');
    const form = new FormData();
    form.append('url', url);
    form.append('language', lang);        // 'swe' (å ä ö) ou 'fre' (é è ç)
    form.append('isTable', 'true');       // préserve l'alignement des colonnes
    form.append('scale', 'true');         // améliore les photos peu nettes
    form.append('OCREngine', '1');        // moteur 1 : gère la langue suédoise
    if (isPdf) form.append('filetype', 'PDF');

    const res = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: key },
      body: form,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`OCR.space refusé (${res.status}) ${txt.slice(0, 160)}`);
    }

    const d = await res.json();
    if (d?.IsErroredOnProcessing) {
      const msg = Array.isArray(d.ErrorMessage) ? d.ErrorMessage.join(' ') : (d.ErrorMessage || 'erreur OCR');
      throw new Error(String(msg).slice(0, 200));
    }

    const text = (d?.ParsedResults || []).map((r: any) => r?.ParsedText || '').join('\n');
    const parsed = parseReceiptText(text);
    lines.push(...parsed.lines);
    if (total == null && parsed.total_ocr != null) total = parsed.total_ocr;
  }

  return { lines, total_ocr: total };
}

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { image_urls, lang } = await req.json().catch(() => ({} as any));
  if (!Array.isArray(image_urls) || !image_urls.length) {
    return NextResponse.json({ error: 'Aucune image fournie' }, { status: 400 });
  }
  // Langue OCR : 'fre' pour un ticket français, 'swe' par défaut (Suède).
  const ocrLang = lang === 'fre' ? 'fre' : 'swe';

  const mindeeKey = process.env.MINDEE_API_KEY;
  // OCR.space est gratuit : à défaut de clé dédiée, on retombe sur la clé
  // de démonstration publique « helloworld » pour que ça marche tout de suite.
  const ocrSpaceKey = process.env.OCR_SPACE_API_KEY || 'helloworld';

  try {
    const result = mindeeKey
      ? await runMindee(image_urls, mindeeKey)
      : await runOcrSpace(image_urls, ocrSpaceKey, ocrLang);

    if (!result.lines.length) {
      return NextResponse.json({
        unavailable: true,
        error: 'Aucune ligne lisible sur ce ticket — reprends la photo de face, bien éclairée, ou saisis à la main.',
      });
    }

    return NextResponse.json({
      lines: result.lines,
      total_ocr: result.total_ocr,
      engine: mindeeKey ? 'mindee' : 'ocr.space',
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Lecture impossible : ${e?.message || 'erreur inconnue'}` }, { status: 502 });
  }
}
