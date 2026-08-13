import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

/* ═══════════════════════════════════════════════════════════════
   OCR D'UN TICKET DE CAISSE

   La reconnaissance demande un service tiers (Mindee « receipt »,
   Google Vision, Textract). Aucun n'est configuré par défaut : plutôt
   que d'inventer des lignes, cette route le dit franchement et l'écran
   bascule sur la saisie rapide.

   Pour l'activer : MINDEE_API_KEY dans les variables d'environnement.
   Mindee est le plus adapté ici — son modèle « expense receipt » rend
   directement les lignes avec quantité et prix unitaire, là où Vision
   ne renvoie que du texte brut à re-parser.
   ═══════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { image_urls } = await req.json().catch(() => ({} as any));
  if (!Array.isArray(image_urls) || !image_urls.length) {
    return NextResponse.json({ error: 'Aucune image fournie' }, { status: 400 });
  }

  const key = process.env.MINDEE_API_KEY;
  if (!key) {
    return NextResponse.json({
      unavailable: true,
      error: "OCR non configuré — la photo est bien archivée, saisis les lignes en mode « Saisie rapide ». "
           + "Pour activer la lecture automatique, ajoute MINDEE_API_KEY.",
    });
  }

  try {
    const lines: Array<{ label: string; qty: number; unit_price: number }> = [];
    let totalOcr = 0;

    for (const url of image_urls) {
      const form = new FormData();
      form.append('document', url);

      const res = await fetch(
        'https://api.mindee.net/v1/products/mindee/expense_receipts/v5/predict',
        { method: 'POST', headers: { Authorization: `Token ${key}` }, body: form },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return NextResponse.json({ error: `OCR refusé (${res.status}) ${txt.slice(0, 160)}` }, { status: 502 });
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

    if (!lines.length) {
      return NextResponse.json({
        unavailable: true,
        error: 'Aucune ligne lisible sur cette photo — reprends-la de face, bien éclairée, ou saisis à la main.',
      });
    }

    return NextResponse.json({ lines, total_ocr: Math.round(totalOcr * 100) / 100 });
  } catch (e: any) {
    return NextResponse.json({ error: `Lecture impossible : ${e?.message || 'erreur inconnue'}` }, { status: 500 });
  }
}
