import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail, getWhiteLabelConfig, baseTemplate } from '@/lib/email-send';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/* ═══════════════════════════════════════════════════════════════
   SURVEILLANCE QUOTIDIENNE DU STOCK

   Le 13/08/2026, products.stock avait dérivé de +77 unités sur 22
   produits sans que rien ne le signale. Les causes sont corrigées ;
   ce cron est le filet qui garantit qu'un retour de la panne se voit
   le lendemain plutôt que dans quatre mois.

   Il ALERTE, et il n'écrit rien. Il a réparé, dans une version
   précédente : il rejouait la déduction d'une commande payée sans
   mouvement. Cette réparation est devenue fausse le jour où le stock
   a cessé d'être déduit au paiement — une commande payée sans
   mouvement est désormais l'état NORMAL, pas une panne. Pire, les
   mouvements d'expédition ne portent pas d'order_id : le cron ne les
   voyait pas et aurait redéduit les 43 commandes déjà expédiées.

   Un filet qui écrit de lui-même finit par écrire à tort. Celui-ci
   se contente de montrer, et laisse la main.
   ═══════════════════════════════════════════════════════════════ */

const J = (v: any): any[] => {
  try { return typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []); }
  catch { return []; }
};

/** Commandes réelles : hors test, hors exclues des stats, hors annulées. */
const isReal = (o: any) => !o.is_test && !o.exclude_from_stats && o.status !== 'cancelled';

/* Mise en service du journal (migration 031 + alignement CTRL-2026-08-13).
   AVANT cette date, aucune vente n'a laissé de mouvement : l'absence de
   mouvement n'y prouve donc rien, et rejouer la déduction la compterait
   une SECONDE fois — le stock de ces commandes a déjà été soldé par
   l'alignement du 13/08. La réparation ne regarde que l'après. */
const DEBUT_JOURNAL = Date.parse('2026-08-13T00:00:00Z');

/* Statuts pour lesquels tout ou partie du carton est parti. C'est le
   seul moment où le stock physique bouge. */
const PARTIES = ['shipped', 'delivered', 'partial'];

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET non configuré — définir la variable dans Vercel' }, { status: 500 });
  }

  const [{ data: products }, { data: orders }, { data: receptions }, { data: moves }] = await Promise.all([
    supabaseAdmin.from('products').select('id, name_fr, stock, track_stock'),
    supabaseAdmin.from('orders').select('id, order_number, status, lines, shipped_qty, created_at, is_test, exclude_from_stats'),
    supabaseAdmin.from('receptions').select('id, status, lines'),
    /* Le filtre order_id a sauté : une sortie d'expédition n'en porte
       pas, elle s'identifie par sa référence. Le garder revenait à ne
       jamais voir les mouvements qu'on cherche. */
    supabaseAdmin.from('stock_movements').select('product_id, order_id, reference'),
  ]);

  const byId = Object.fromEntries((products || []).map(p => [p.id, p]));

  /* ── 1. Détection : marchandise partie sans sortie de stock ───── */
  // Fenêtre : 30 jours glissants, jamais avant la mise en service du
  // journal (voir DEBUT_JOURNAL).
  const depuis = Math.max(Date.now() - 30 * 86400000, DEBUT_JOURNAL);

  /* Une expédition écrit `picking` avec le numéro de commande en
     référence — pas d'order_id. C'est par là qu'il faut la chercher. */
  const sorties = new Set(
    (moves || []).filter(m => m.reference).map(m => String(m.reference))
  );

  const sansSortie: Array<{ commande: string; statut: string }> = [];
  for (const o of orders || []) {
    if (!isReal(o)) continue;
    if (!PARTIES.includes(o.status)) continue;            // rien n'est encore parti
    if (+new Date(o.created_at) < depuis) continue;
    if (sorties.has(o.order_number)) continue;
    sansSortie.push({ commande: o.order_number, statut: o.status });
  }

  /* ── 2. Contrôle : théorique vs base ──────────────────────────── */
  const recu: Record<string, number> = {};
  for (const r of receptions || []) {
    if (r.status === 'cancelled') continue;
    for (const l of J(r.lines)) {
      const q = Number(l.received_qty != null ? l.received_qty : l.qty) || 0;
      if (l.product_id && q) recu[l.product_id] = (recu[l.product_id] || 0) + q;
    }
  }

  /* Le théorique compte ce qui est SORTI, pas ce qui est commandé :
     `stock` désigne le rayon, et la marchandise d'une commande payée y
     est encore. Compter le commandé rendrait chaque commande en
     attente d'expédition en faux écart. */
  const vendu: Record<string, number> = {};
  for (const o of orders || []) {
    if (!isReal(o)) continue;
    const envoye = (o as any).shipped_qty || null;
    for (const l of J(o.lines)) {
      if (!l.product_id) continue;
      /* Expédition partielle : shipped_qty fait foi. Commande expédiée
         avant que cette colonne existe : tout est parti. Sinon : rien. */
      const q = envoye
        ? Number(envoye[l.product_id]) || 0
        : (PARTIES.includes(o.status) ? Number(l.qty) || 0 : 0);
      if (q) vendu[l.product_id] = (vendu[l.product_id] || 0) + q;
    }
  }

  // Le stock a pu changer pendant la réparation : relecture.
  const { data: apres } = await supabaseAdmin.from('products').select('id, name_fr, stock');
  const stockDe = (id: string) => Number((apres || []).find(p => p.id === id)?.stock) || 0;

  const ecarts: Array<{ produit: string; recu: number; vendu: number; theorique: number; base: number; ecart: number }> = [];
  const negatifs: Array<{ produit: string; stock: number }> = [];
  const venduSansReception: Array<{ produit: string; vendu: number; stock: number }> = [];

  for (const p of products || []) {
    const base = stockDe(p.id);
    if (base < 0) negatifs.push({ produit: p.name_fr, stock: base });

    const r = recu[p.id] || 0, v = vendu[p.id] || 0;
    if (r === 0) {
      if (v > 0) venduSansReception.push({ produit: p.name_fr, vendu: v, stock: base });
      continue;                                            // théorique non calculable
    }
    const theorique = r - v;
    if (base !== theorique) {
      ecarts.push({ produit: p.name_fr, recu: r, vendu: v, theorique, base, ecart: base - theorique });
    }
  }
  ecarts.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart));

  const rapport = {
    date: new Date().toISOString().slice(0, 10),
    sans_sortie: sansSortie, ecarts, negatifs, vendu_sans_reception: venduSansReception,
  };

  /* ── 3. Alerte ────────────────────────────────────────────────── */
  // Rien à signaler = pas d'email. Une alerte quotidienne systématique
  // ne serait plus lue au bout d'une semaine.
  const aSignaler = ecarts.length || negatifs.length || sansSortie.length;
  if (!aSignaler) return NextResponse.json({ ok: true, rien_a_signaler: true, ...rapport });

  try {
    const cfg = await getWhiteLabelConfig();
    // Alerte interne : elle part vers la boutique, pas vers un client.
    const dest = cfg.contact_email || cfg.shop_email || cfg.smtp_user || process.env.RESEND_FROM;
    const from = cfg.smtp_from || process.env.SMTP_FROM || process.env.RESEND_FROM || dest;
    if (dest && from) {
      const ligne = (t: string, v: string) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #F1EDE7;font-size:13px">${t}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #F1EDE7;font-size:13px;text-align:right">${v}</td></tr>`;

      let html = '';
      if (sansSortie.length) {
        html += `<p style="font-size:14px;color:#B03A2E"><strong>${sansSortie.length} commande(s) expédiée(s) sans sortie de stock</strong> — la marchandise est partie mais le rayon n'a pas été décrémenté. À reprendre depuis l'écran de préparation.</p><table style="width:100%;border-collapse:collapse">`;
        for (const r of sansSortie) html += ligne(r.commande, r.statut);
        html += '</table>';
      }
      if (ecarts.length) {
        html += `<p style="font-size:14px"><strong>${ecarts.length} produit(s) en écart</strong> entre le stock affiché et le théorique (reçu − vendu). Rien n'a été modifié : à trancher depuis Stocks › Contrôle.</p><table style="width:100%;border-collapse:collapse">`;
        for (const e of ecarts.slice(0, 20)) {
          html += ligne(e.produit, `${e.base} affiché · ${e.theorique} théorique · ${e.ecart > 0 ? '+' : ''}${e.ecart}`);
        }
        html += '</table>';
      }
      if (negatifs.length) {
        html += `<p style="font-size:14px"><strong>${negatifs.length} produit(s) en stock négatif</strong> — vendus au-delà de ce qui a été réceptionné.</p><table style="width:100%;border-collapse:collapse">`;
        for (const n of negatifs) html += ligne(n.produit, String(n.stock));
        html += '</table>';
      }
      if (venduSansReception.length) {
        html += `<p style="font-size:13px;color:#8B7E72">${venduSansReception.length} produit(s) vendus sans jamais avoir été entrés par une réception : leur stock ne peut pas être recalculé, seul un comptage physique fait foi.</p>`;
      }

      await sendEmail({
        from,
        to: dest,
        subject: `Contrôle du stock — ${ecarts.length} écart(s), ${sansSortie.length} sortie(s) manquante(s)`,
        html: baseTemplate(html, 'Contrôle quotidien du stock', cfg),
      }, cfg);
    }
  } catch (e) {
    console.error('[cron/stock-audit] alerte non envoyée:', e);
  }

  return NextResponse.json({ ok: true, ...rapport });
}
