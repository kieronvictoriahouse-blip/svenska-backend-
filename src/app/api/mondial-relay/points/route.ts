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

    // Recalcul des vraies distances et filtrage géographique
    // On prend le point avec la plus petite distance MR comme centre de référence
    const withCoords = points.filter(p => p.lat && p.lng && !isNaN(parseFloat(p.lat)));
    if (withCoords.length > 0) {
      withCoords.sort((a, b) => Number(a.distance || 999) - Number(b.distance || 999));
      const ref = withCoords[0];
      const refLat = parseFloat(ref.lat);
      const refLng = parseFloat(ref.lng);

      const filtered = points.filter(p => {
        const lat = parseFloat(p.lat);
        const lng = parseFloat(p.lng);
        if (isNaN(lat) || isNaN(lng)) return true;
        const realKm = haversineKm(refLat, refLng, lat, lng);
        p.distance = String(Math.round(realKm * 10) / 10);
        return realKm <= 25; // Max 25km de rayon réel
      });
      // Trier par distance croissante
      filtered.sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0));
      return NextResponse.json({ points: filtered });
    }

    return NextResponse.json({ points });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
