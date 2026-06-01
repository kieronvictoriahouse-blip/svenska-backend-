import { NextRequest, NextResponse } from 'next/server';
import { mrHash, mrSoap, mrParseXml } from '@/lib/mondial-relay';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cp = searchParams.get('cp') || '';
  const pays = searchParams.get('pays') || 'FR';
  const ville = searchParams.get('ville') || '';

  if (!cp && !ville) {
    return NextResponse.json({ error: 'cp ou ville requis' }, { status: 400 });
  }

  const enseigne = process.env.MONDIAL_RELAY_ENSEIGNE || 'CC23X5KI';
  const privateKey = process.env.MONDIAL_RELAY_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: 'MONDIAL_RELAY_KEY non configuré dans les variables d\'environnement Vercel', points: [] }, { status: 500 });
  }

  const f: Record<string, string> = {
    Enseigne: enseigne,
    Pays: pays,
    NumPointRelais: '',
    Ville: ville,
    CP: cp,
    Latitude: '',
    Longitude: '',
    Taille: '',
    Poids: '',
    Action: '',
    DelaiEnvoi: '0',
    RayonRecherche: '20',
    TypeActivite: '',
    NACE: '',
  };

  const hashValues = [
    f.Enseigne, f.Pays, f.NumPointRelais, f.Ville, f.CP,
    f.Latitude, f.Longitude, f.Taille, f.Poids, f.Action,
    f.DelaiEnvoi, f.RayonRecherche, f.TypeActivite, f.NACE,
  ];
  f.Security = mrHash(hashValues, privateKey);

  try {
    const xml = await mrSoap('WSI3_PointRelais_Recherche', f);
    const stat = mrParseXml(xml, 'STAT');

    if (stat !== '0') {
      return NextResponse.json({ error: `MR STAT=${stat}`, points: [] }, { status: 400 });
    }

    const points: any[] = [];
    const ptRegex = /<PointRelais_Details>([\s\S]*?)<\/PointRelais_Details>/g;
    let match;
    while ((match = ptRegex.exec(xml)) !== null) {
      const inner = match[1];
      const get = (tag: string) => mrParseXml(inner, tag);
      points.push({
        id: get('Num'),
        name: get('LgAdr1'),
        adresse: [get('LgAdr3'), get('LgAdr4')].filter(Boolean).join(', '),
        ville: get('Ville'),
        cp: get('CP'),
        pays: get('Pays'),
        lat: get('Latitude').replace(',', '.'),
        lng: get('Longitude').replace(',', '.'),
        distance: (function() {
          const raw = Number(get('Distance') || '0');
          if (!raw) return '';
          // MR renvoie la distance en mètres → convertir en km arrondi à 1 décimale
          const km = Math.round(raw / 1000 * 10) / 10;
          console.log('[MR distance] raw=' + raw + ' → ' + km + 'km');
          return String(km);
        })(),
      });
    }

    return NextResponse.json({ points });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
