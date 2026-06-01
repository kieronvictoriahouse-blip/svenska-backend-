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

// Départements adjacents France — permet les recherches aux frontières de département
const FR_ADJACENT: Record<string, string[]> = {
  '01': ['38','39','69','71','73','74'],
  '02': ['08','51','59','60','77','80'],
  '03': ['15','42','43','63','71'],
  '04': ['05','06','13','83','84'],
  '05': ['04','07','26','38','73'],
  '06': ['04','83'],
  '07': ['03','15','26','30','43','48','63','69'],
  '08': ['02','51','55','57','59','60'],
  '09': ['11','12','31','65','66'],
  '10': ['21','51','52','77','89'],
  '11': ['09','12','30','31','34','66'],
  '12': ['09','11','15','30','34','46','48'],
  '13': ['04','83','84'],
  '14': ['27','50','61','76'],
  '15': ['03','07','12','43','48','63'],
  '16': ['17','19','23','24','79','86','87'],
  '17': ['16','24','33','79'],
  '18': ['03','23','36','41','45','58'],
  '19': ['15','16','23','24','46','63','87'],
  '21': ['10','39','52','58','70','71','89'],
  '22': ['29','35','56'],
  '23': ['03','15','16','19','36','63','87'],
  '24': ['16','17','19','33','40','46','47','87'],
  '25': ['21','39','68','70','90'],
  '26': ['01','05','07','38','84'],
  '27': ['14','28','60','76','78'],
  '28': ['27','37','41','45','61','78'],
  '29': ['22','56'],
  '30': ['07','11','12','13','34','48','84'],
  '31': ['09','11','32','65','81','82'],
  '32': ['31','33','40','47','64','65','82'],
  '33': ['17','24','32','40','47'],
  '34': ['11','12','30','81'],
  '35': ['22','44','49','50','53','56'],
  '36': ['18','23','37','41','86','87'],
  '37': ['28','36','41','49','72','86'],
  '38': ['01','05','07','26','69','73'],
  '39': ['01','21','25','70','71'],
  '40': ['24','32','33','47','64'],
  '41': ['18','28','36','37','45','72'],
  '42': ['01','03','07','43','63','69','71'],
  '43': ['03','07','12','15','42','48','63'],
  '44': ['35','49','56','85'],
  '45': ['18','28','36','41','58','77','89'],
  '46': ['12','15','19','24','47','82'],
  '47': ['24','32','33','40','46','82'],
  '48': ['07','12','15','30','34','43'],
  '49': ['37','44','53','72','79','85','86'],
  '50': ['14','35','53','61'],
  '51': ['02','08','10','52','55','77'],
  '52': ['10','21','51','54','55','70'],
  '53': ['35','49','50','61','72'],
  '54': ['52','55','57','67','88'],
  '55': ['08','51','52','54','57'],
  '56': ['22','29','35','44'],
  '57': ['08','52','54','55','67','88'],
  '58': ['18','21','45','71','89'],
  '59': ['02','08','60','62','80'],
  '60': ['02','27','59','76','77','78','80','95'],
  '61': ['14','27','28','41','50','53','72'],
  '62': ['59','76','80'],
  '63': ['03','07','15','19','23','42','43'],
  '64': ['32','40','65'],
  '65': ['09','31','32','64'],
  '66': ['09','11'],
  '67': ['52','54','57','68','88'],
  '68': ['25','67','70','88','90'],
  '69': ['01','03','07','38','42','71'],
  '70': ['21','25','39','52','67','68','88','90'],
  '71': ['01','03','21','39','42','58','69'],
  '72': ['28','37','41','49','50','53','61'],
  '73': ['01','05','38','74'],
  '74': ['01','73'],
  '75': ['77','78','91','92','93','94','95'],
  '76': ['14','27','60','62','80'],
  '77': ['02','10','27','45','51','60','75','78','89','91'],
  '78': ['27','28','60','75','77','91','92','95'],
  '79': ['16','17','37','49','85','86'],
  '80': ['02','59','60','62','76'],
  '81': ['11','12','30','31','34','46','82'],
  '82': ['31','32','46','47','81'],
  '83': ['04','06','13'],
  '84': ['04','13','26','30'],
  '85': ['44','49','79'],
  '86': ['16','36','37','49','79','87'],
  '87': ['16','19','23','36','63','86'],
  '88': ['54','57','67','68','70'],
  '89': ['10','21','45','58','77'],
  '90': ['25','68','70'],
  '91': ['75','77','78','94','95'],
  '92': ['75','78','91','94','95'],
  '93': ['75','94','95'],
  '94': ['75','77','91','92','93'],
  '95': ['60','75','78','91','92','93'],
};

function isAllowedFR(searchDep: string, resultDep: string): boolean {
  if (searchDep === resultDep) return true;
  const adj = FR_ADJACENT[searchDep];
  return adj ? adj.includes(resultDep) : true;
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
  const cpNorm = pays === 'PT'
    ? cp.split('-')[0].trim()
    : cp.replace(/[-\s]/g, '');

  const enseigne = process.env.MONDIAL_RELAY_ENSEIGNE || 'CC23X5KI';
  const privateKey = process.env.MONDIAL_RELAY_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: 'MONDIAL_RELAY_KEY non configuré', points: [] }, { status: 500 });
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
        id:      get('Num'),
        name:    get('LgAdr1'),
        adresse: [get('LgAdr3'), get('LgAdr4')].filter(v => v && v.toUpperCase() !== 'NULL').join(', '),
        ville:   get('Ville'),
        cp:      get('CP'),
        pays:    get('Pays'),
        lat:     get('Latitude').replace(',', '.'),
        lng:     get('Longitude').replace(',', '.'),
      });
    }

    // Filtre 1 (France uniquement) : exclure les départements non adjacents
    // Gère les mauvaises coordonnées MR en se basant sur le CP réel
    const searchDep = cpNorm.slice(0, 2);
    const preFiltered = pays !== 'FR'
      ? points
      : points.filter(p => {
          if (!p.cp) return true;
          const resultDep = p.cp.replace(/[-\s]/g, '').slice(0, 2);
          return isAllowedFR(searchDep, resultDep);
        });

    // Filtre 2 : haversine depuis le centroïde médian des points pré-filtrés
    const withCoords = preFiltered.filter(p => p.lat && !isNaN(parseFloat(p.lat)));
    if (withCoords.length > 0) {
      const sortedLats = withCoords.map(p => parseFloat(p.lat)).sort((a, b) => a - b);
      const sortedLngs = withCoords.map(p => parseFloat(p.lng)).sort((a, b) => a - b);
      const mid = Math.floor(sortedLats.length / 2);
      const refLat = sortedLats[mid];
      const refLng = sortedLngs[mid];

      const result = preFiltered
        .map(p => {
          const lat = parseFloat(p.lat);
          const lng = parseFloat(p.lng);
          const d = isNaN(lat) ? 999 : haversineKm(refLat, refLng, lat, lng);
          return { ...p, distance: String(Math.round(d * 10) / 10), _dist: d };
        })
        .filter(p => p._dist <= 30)
        .sort((a, b) => a._dist - b._dist)
        .map(({ _dist, ...p }) => p);

      return NextResponse.json({ points: result });
    }

    return NextResponse.json({ points: preFiltered });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
