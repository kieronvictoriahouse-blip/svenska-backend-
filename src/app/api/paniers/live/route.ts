import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/* ═══════════════════════════════════════════════════════════════
   PANIER EN COURS — instantané envoyé par le site (public)

   POST { sid, items: [{ id, qty, name, price, photo }], page, lang, mobile }

   Le site l'envoie à chaque changement du panier et à chaque page vue
   tant que le panier n'est pas vide (« dernière activité »). Anonyme :
   un identifiant aléatoire du navigateur, rien qui désigne la personne.

   Route publique, donc défensive : taille bornée, champs tronqués, total
   recalculé ici (affichage seulement — /api/checkout reste la seule
   autorité sur les prix). Une erreur ne remonte jamais au site : le
   panier du client ne doit pas dépendre de ce suivi.
   ═══════════════════════════════════════════════════════════════ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const ok = () => NextResponse.json({ ok: true }, { headers: CORS });

export async function POST(req: NextRequest) {
  try {
    const brut = await req.text();
    if (brut.length > 20_000) return ok();
    const b = JSON.parse(brut || '{}');

    const sid = String(b.sid || '');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(sid)) return ok();

    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60).map((i: any) => ({
      id: String(i?.id || '').slice(0, 64),
      qty: Math.max(0, Math.min(999, Math.trunc(Number(i?.qty) || 0))),
      name: String(i?.name || '').slice(0, 120),
      price: Math.max(0, Math.min(10_000, Number(i?.price) || 0)),
      photo: typeof i?.photo === 'string' && /^(https?:\/\/|\/)/.test(i.photo) ? i.photo.slice(0, 300) : null,
    })).filter((i: any) => i.id && i.qty > 0);

    const nb = items.reduce((s: number, i: any) => s + i.qty, 0);
    const total = Math.round(items.reduce((s: number, i: any) => s + i.qty * i.price, 0) * 100) / 100;

    /* Un panier vide n'est enregistré que s'il existait déjà (le client
       vient de le vider) : un visiteur sans panier ne crée rien. */
    if (!items.length) {
      await supabaseAdmin.from('live_carts')
        .update({ items: [], nb: 0, total: 0, updated_at: new Date().toISOString() })
        .eq('sid', sid);
      return ok();
    }

    await supabaseAdmin.from('live_carts').upsert({
      sid, items, nb, total,
      page: String(b.page || '').slice(0, 120) || null,
      lang: ['fr', 'en', 'sv'].includes(b.lang) ? b.lang : null,
      mobile: typeof b.mobile === 'boolean' ? b.mobile : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sid' });
  } catch {
    /* table absente (migration 069 pas encore passée), JSON invalide… */
  }
  return ok();
}
