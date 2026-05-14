import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { mrHash, mrSoap, mrParseXml, formatMrPhone, trunc, parseAddressCpVille } from '@/lib/mondial-relay';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { order_id, weight_grams, col_rel: colRelInput, liv_rel: livRelInput } = await req.json();
  if (!order_id || !weight_grams) {
    return NextResponse.json({ error: 'order_id et weight_grams requis' }, { status: 400 });
  }

  const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', order_id).single();
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

  const livRel = livRelInput || order.relay_point_id;
  if (!livRel) return NextResponse.json({ error: 'Code point relais de livraison requis' }, { status: 400 });

  const { data: settings } = await supabaseAdmin.from('company_settings').select('key, value');
  const get = (k: string) => (settings as any[])?.find(s => s.key === k)?.value || '';

  const { cp: expeCp, ville: expeVille, street: expeStreet } = parseAddressCpVille(get('address'));
  const colRel = colRelInput || get('mr_col_rel');
  if (!colRel) {
    return NextResponse.json({ error: 'Configurez le code relais de dépôt (mr_col_rel) dans les paramètres' }, { status: 400 });
  }

  const enseigne = process.env.MONDIAL_RELAY_ENSEIGNE || 'CC23X5KI';
  const privateKey = process.env.MONDIAL_RELAY_KEY!;

  const modeCol = get('mr_mode_col') || 'REL';

  const f: Record<string, string> = {
    Enseigne: enseigne,
    ModeCol: modeCol,
    ModeLiv: '24R',
    Expe_Langage: 'FR',
    Expe_Ad1: trunc(get('company') || 'Svenska Cravings', 32),
    Expe_Ad2: '',
    Expe_Ad3: trunc(expeStreet, 32),
    Expe_Ad4: '',
    Expe_Ville: trunc(expeVille, 26),
    Expe_CP: expeCp,
    Expe_Pays: 'FR',
    Expe_Tel1: formatMrPhone(get('phone')),
    Expe_Tel2: '',
    Expe_Mail: '',
    Dest_Langage: 'FR',
    Dest_Ad1: trunc(order.customer_name || '', 32),
    Dest_Ad2: '',
    Dest_Ad3: '',
    Dest_Ad4: '',
    Dest_Ville: '',
    Dest_CP: '',
    Dest_Pays: order.relay_point_pays || 'FR',
    Dest_Tel1: formatMrPhone(order.customer_phone),
    Dest_Tel2: '',
    Dest_Mail: order.customer_email || '',
    Poids: String(Math.round(Number(weight_grams))),
    NbColis: '1',
    CRT_Valeur: '0',
    CRT_Devise: 'EUR',
    Exp_Valeur: '0',
    Exp_Devise: 'EUR',
    COL_Rel_Pays: 'FR',
    COL_Rel: colRel,
    LIV_Rel_Pays: order.relay_point_pays || 'FR',
    LIV_Rel: livRel,
    TAvisage: '',
    TReprise: '',
    Montage: '0',
    TRDV: '',
    Assurance: '0',
    Code_Retour: '',
    Texte: order.order_number || '',
  };

  const hashValues = [
    f.Enseigne, f.ModeCol, f.ModeLiv,
    f.Expe_Langage, f.Expe_Ad1, f.Expe_Ad2, f.Expe_Ad3, f.Expe_Ad4,
    f.Expe_Ville, f.Expe_CP, f.Expe_Pays, f.Expe_Tel1, f.Expe_Tel2, f.Expe_Mail,
    f.Dest_Langage, f.Dest_Ad1, f.Dest_Ad2, f.Dest_Ad3, f.Dest_Ad4,
    f.Dest_Ville, f.Dest_CP, f.Dest_Pays, f.Dest_Tel1, f.Dest_Tel2, f.Dest_Mail,
    f.Poids, f.NbColis, f.CRT_Valeur, f.CRT_Devise, f.Exp_Valeur, f.Exp_Devise,
    f.COL_Rel_Pays, f.COL_Rel, f.LIV_Rel_Pays, f.LIV_Rel,
    f.TAvisage, f.TReprise, f.Montage, f.TRDV, f.Assurance,
    f.Code_Retour, f.Texte,
  ];
  f.Security = mrHash(hashValues, privateKey);

  try {
    const xml = await mrSoap('WSI2_CreationEtiquette', f);
    const stat = mrParseXml(xml, 'STAT');

    if (stat !== '0') {
      return NextResponse.json({ error: `Mondial Relay erreur STAT=${stat}`, details: xml }, { status: 400 });
    }

    const tracking = mrParseXml(xml, 'ExpeditionNum') || mrParseXml(xml, 'NumExpe');
    const labelUrl = mrParseXml(xml, 'URL_Etiquette');

    await supabaseAdmin.from('orders').update({
      tracking_number: tracking,
      mondial_relay_tracking: tracking,
      mondial_relay_label_url: labelUrl,
      status: 'shipped',
    }).eq('id', order_id);

    return NextResponse.json({ tracking, labelUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
