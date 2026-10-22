import { mrHash, mrSoap, mrParseXml } from '@/lib/mondial-relay';

/* ═══════════════════════════════════════════════════════════════
   POINTS RELAIS — OUTILS COMMUNS

   Partagés par /api/logspher/relay-points (le panier) et
   /api/mondial-relay/points :
     · un délai maximal par appel amont — un transporteur qui ne répond
       pas laissait le panier tourner sans fin, client compris ;
     · des messages courts dans la langue du client quand rien ne vient ;
     · les horaires d'ouverture, ramenés à une seule forme :
       [{ jour: 'lun', plages: ['09:00-12:00', '14:00-19:00'] }, …]
       (jours fermés omis) ;
     · la recherche Mondial Relay en direct, au code postal.
   ═══════════════════════════════════════════════════════════════ */

/** Délai maximal d'un appel amont (UGO, Mondial Relay). */
export const DELAI_MS = 6000;

export type LangueRelais = 'fr' | 'en' | 'sv';
export const langueRelais = (v: unknown): LangueRelais =>
  v === 'en' || v === 'sv' ? v : 'fr';

export const MESSAGES_RELAIS = {
  requis:            { fr: 'Indiquez un code postal.', en: 'Please enter a postcode.', sv: 'Ange ett postnummer.' },
  indisponible:      { fr: 'Recherche des points relais momentanément indisponible. Réessayez dans un instant.', en: 'Relay point search is temporarily unavailable. Please try again in a moment.', sv: 'Sökningen efter utlämningsställen är tillfälligt otillgänglig. Försök igen om en stund.' },
  aucunTransporteur: { fr: 'Aucun transporteur ne livre cette destination en point relais.', en: 'No carrier delivers to a relay point at this destination.', sv: 'Ingen transportör levererar till utlämningsställe på den här destinationen.' },
  aucunPoint:        { fr: 'Aucun point relais trouvé autour de cette adresse.', en: 'No relay point found near this address.', sv: 'Inga utlämningsställen hittades i närheten.' },
};

/** fetch borné dans le temps, corps lu compris. Lève une erreur au-delà. */
export async function lireAvecDelai(url: string, init: RequestInit = {}, ms = DELAI_MS) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const texte = await res.text();
    return { ok: res.ok, status: res.status, texte };
  } finally {
    clearTimeout(minuteur);
  }
}

/* ── Horaires ─────────────────────────────────────────────────── */

export type Jour = 'lun' | 'mar' | 'mer' | 'jeu' | 'ven' | 'sam' | 'dim';
export type Horaire = { jour: Jour; plages: string[] };
const JOURS: Jour[] = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];

// Trois premières lettres du jour, en anglais, français et suédois.
const ABREV_JOURS: Record<string, Jour> = {
  mon: 'lun', tue: 'mar', wed: 'mer', thu: 'jeu', fri: 'ven', sat: 'sam', sun: 'dim',
  lun: 'lun', mar: 'mar', mer: 'mer', jeu: 'jeu', ven: 'ven', sam: 'sam', dim: 'dim',
  'mån': 'lun', tis: 'mar', ons: 'mer', tor: 'jeu', fre: 'ven', 'lör': 'sam', 'sön': 'dim',
};

function jourDe(v: unknown): Jour | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (/^\d$/.test(s)) {
    const n = Number(s);                       // 1 = lundi (ISO), 0 ou 7 = dimanche
    return n >= 1 && n <= 7 ? JOURS[n - 1] : n === 0 ? 'dim' : null;
  }
  return ABREV_JOURS[s.slice(0, 3)] || null;
}

/** « 9:00 », « 0900 », « 09h00 », « 09:00:00 » → « 09:00 ». */
function heure(v: unknown): string | null {
  const m = String(v ?? '').trim().match(/^(\d{1,2})[:hH.]?(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 24 || Number(m[2]) > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

const PAIRES: Array<[string, string]> = [
  ['open', 'close'], ['opening', 'closing'], ['opens', 'closes'], ['start', 'end'], ['from', 'to'],
  ['open_am', 'close_am'], ['open_pm', 'close_pm'], ['am_open', 'am_close'], ['pm_open', 'pm_close'],
  ['morning_open', 'morning_close'], ['afternoon_open', 'afternoon_close'], ['debut', 'fin'],
];

/** Plages d'une valeur amont : chaîne, objet {open, close}, ou liste de ceux-ci. */
function plagesDe(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.reduce<string[]>((acc, x) => acc.concat(plagesDe(x)), []);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: string[] = [];
    for (const [a, b] of PAIRES) {
      const de = heure(o[a]), fin = heure(o[b]);
      if (de && fin && de !== fin) out.push(`${de}-${fin}`);
    }
    if (out.length) return out;
    return plagesDe(o.slots ?? o.periods ?? o.ranges ?? o.hours ?? o.plages ?? o.opening_hours ?? null);
  }
  const out: string[] = [];
  const re = /(\d{1,2}[:hH.]?\d{2})\s*(?:-|–|à|to)\s*(\d{1,2}[:hH.]?\d{2})/g;
  const s = String(v);
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const de = heure(m[1]), fin = heure(m[2]);
    if (de && fin && de !== fin) out.push(`${de}-${fin}`);
  }
  return out;
}

/**
 * Horaires d'un point UGO, quelle que soit leur forme : liste d'objets
 * portant un jour, objet indexé par jour, ou texte « Lun 09:00-12:00 ;
 * Mar … ». Ce qu'on ne sait pas lire est ignoré — liste vide alors.
 */
export function normaliserHoraires(brut: unknown): Horaire[] {
  const parJour: Partial<Record<Jour, string[]>> = {};
  const ajouter = (j: Jour | null, plages: string[]) => {
    if (!j || !plages.length) return;
    const deja = parJour[j] || [];
    parJour[j] = deja.concat(plages.filter(p => !deja.includes(p)));
  };

  if (Array.isArray(brut)) {
    for (const e of brut) {
      if (!e || typeof e !== 'object') continue;
      const o = e as Record<string, unknown>;
      ajouter(jourDe(o.day ?? o.jour ?? o.weekday ?? o.day_of_week ?? o.dayOfWeek ?? o.day_name), plagesDe(o));
    }
  } else if (brut && typeof brut === 'object') {
    for (const [cle, v] of Object.entries(brut as Record<string, unknown>)) ajouter(jourDe(cle), plagesDe(v));
  } else if (typeof brut === 'string') {
    for (const morceau of brut.split(/[\n;|]+/)) {
      const m = morceau.trim().match(/^([A-Za-zÀ-ÿ]+)\.?\s*:?\s*(.*)$/);
      if (m) ajouter(jourDe(m[1]), plagesDe(m[2]));
    }
  }
  return JOURS.filter(j => parJour[j]?.length).map(j => ({ jour: j, plages: parJour[j] as string[] }));
}

/* Mondial Relay : <Horaires_Lundi><string>0900</string><string>1200</string>
   <string>1400</string><string>1900</string></Horaires_Lundi> — deux plages
   par jour, « 0000 » pour une plage fermée. */
const BALISES_MR: Array<[string, Jour]> = [
  ['Horaires_Lundi', 'lun'], ['Horaires_Mardi', 'mar'], ['Horaires_Mercredi', 'mer'],
  ['Horaires_Jeudi', 'jeu'], ['Horaires_Vendredi', 'ven'], ['Horaires_Samedi', 'sam'],
  ['Horaires_Dimanche', 'dim'],
];

export function horairesMondialRelay(xmlPoint: string): Horaire[] {
  const out: Horaire[] = [];
  for (const [balise, jour] of BALISES_MR) {
    const bloc = mrParseXml(xmlPoint, balise);
    if (!bloc) continue;
    const t: string[] = [];
    const re = /<string>\s*(\d{4})\s*<\/string>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(bloc))) t.push(m[1]);
    const plages: string[] = [];
    for (let i = 0; i + 1 < t.length; i += 2) {
      if (t[i] === '0000' && t[i + 1] === '0000') continue;
      plages.push(`${t[i].slice(0, 2)}:${t[i].slice(2)}-${t[i + 1].slice(0, 2)}:${t[i + 1].slice(2)}`);
    }
    if (plages.length) out.push({ jour, plages });
  }
  return out;
}

/* ── Mondial Relay en direct ─────────────────────────────────── */

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

/* panne : 'adresse' = code postal ou ville non reconnus (STAT 9) — le
   client peut corriger ; les autres sont de notre côté ou du leur. */
export type ResultatMondialRelay =
  | { ok: true; points: any[] }
  | { ok: false; panne: 'adresse' | 'config' | 'stat' | 'reseau'; detail: string };

/**
 * Points Mondial Relay autour d'un code postal (API SOAP, qui travaille
 * au CP — UGO, lui, réclame un vrai nom de ville). Format des points :
 * celui du panier, + `horaires` quand Mondial Relay les donne.
 */
export async function rechercherPointsMondialRelay(q: { cp: string; pays: string; ville?: string }): Promise<ResultatMondialRelay> {
  const pays = (q.pays || 'FR').toUpperCase();
  const cp = q.cp || '';
  const ville = q.ville || '';

  // Normaliser le code postal selon le pays
  const cpNorm = pays === 'PT'
    ? cp.split('-')[0].trim()
    : cp.replace(/[-\s]/g, '');

  const enseigne = process.env.MONDIAL_RELAY_ENSEIGNE || 'CC23X5KI';
  const privateKey = process.env.MONDIAL_RELAY_KEY;
  if (!privateKey) return { ok: false, panne: 'config', detail: 'MONDIAL_RELAY_KEY non configuré' };

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

  let xml: string;
  try {
    xml = await mrSoap('WSI3_PointRelais_Recherche', f, DELAI_MS);
  } catch (e: any) {
    return { ok: false, panne: 'reseau', detail: e?.name === 'AbortError' ? `délai de ${DELAI_MS} ms dépassé` : (e?.message || String(e)) };
  }
  const stat = mrParseXml(xml, 'STAT');
  if (stat !== '0') return { ok: false, panne: stat === '9' ? 'adresse' : 'stat', detail: `MR STAT=${stat}` };

  const points: any[] = [];
  const ptRegex = /<PointRelais_Details>([\s\S]*?)<\/PointRelais_Details>/g;
  let match;
  while ((match = ptRegex.exec(xml)) !== null) {
    const inner = match[1];
    const get = (tag: string) => mrParseXml(inner, tag);
    const horaires = horairesMondialRelay(inner);
    points.push({
      id:      get('Num'),
      name:    get('LgAdr1'),
      adresse: [get('LgAdr3'), get('LgAdr4')].filter(v => v && v.toUpperCase() !== 'NULL').join(', '),
      ville:   get('Ville'),
      cp:      get('CP'),
      pays:    get('Pays'),
      lat:     get('Latitude').replace(',', '.'),
      lng:     get('Longitude').replace(',', '.'),
      ...(horaires.length ? { horaires } : {}),
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

    return { ok: true, points: result };
  }

  return { ok: true, points: preFiltered };
}
