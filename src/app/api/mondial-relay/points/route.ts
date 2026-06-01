import { NextRequest, NextResponse } from 'next/server';
import { mrHash, mrSoap, mrParseXml } from '@/lib/mondial-relay';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cp = searchParams.get('cp') || '';
  const pays = searchParams.get('pays') || 'FR';
  const ville = searchParams.get('ville') || '';

  if (!cp && !ville) {
    return NextResponse.json({ error: 'cp ou ville requis' }, { status: 400 });
  }

  // Normaliser le code postal selon le pays
  // Portugal : XXXX-XXX → MR attend XXXX (4 premiers chiffres)
  // Autres : supprimer tirets et espaces
  const cpNorm = pays === 'PT'
    ? cp.split('-')[0].trim()
    : cp.replace(/[-\s]/g, '');

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
    CP: cpNorm,
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
        adresse: [get('LgAdr3'), get('LgAdr4')].filter(v => v && v.toUpperCase() !== 'NULL').join(', '),
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

    // Calcul du centroïde médian de TOUS les points (robuste aux outliers)
    const withCoords = points.filter(p => p.lat && p.lng && !isNaN(parseFloat(p.lat)));
    if (withCoords.length > 1) {
      const sortedLats = [...withCoords].map(p => parseFloat(p.lat)).sort((a, b) => a - b);
      const sortedLngs = [...withCoords].map(p => parseFloat(p.lng)).sort((a, b) => a - b);
      const mid = Math.floor(sortedLats.length / 2);
      const refLat = sortedLats[mid];
      const refLng = sortedLngs[mid];

      // Recalculer les distances et filtrer à 30km max du centroïde
      const result = points
        .map(p => {
          const lat = parseFloat(p.lat);
          const lng = parseFloat(p.lng);
          if (isNaN(lat) || isNaN(lng)) return { ...p, _dist: 999 };
          const d = haversineKm(refLat, refLng, lat, lng);
          return { ...p, distance: String(Math.round(d * 10) / 10), _dist: d };
        })
        .filter(p => p._dist <= 30)
        .sort((a, b) => a._dist - b._dist)
        .map(({ _dist, ...p }) => p);

      return NextResponse.json({ points: result });
    }

    return NextResponse.json({ points });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
