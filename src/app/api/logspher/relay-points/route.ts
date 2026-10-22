import { NextRequest, NextResponse } from 'next/server';
import {
  lireAvecDelai, langueRelais, MESSAGES_RELAIS, DELAI_MS,
  normaliserHoraires, rechercherPointsMondialRelay,
} from '@/lib/points-relais';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const API_URL = process.env.LOGSPHER_API_URL || 'https://upelgo.com';

/* ═══════════════════════════════════════════════════════════════
   POINTS RELAIS — le transporteur le moins cher du pays, et lui seul

   Un point relais appartient à un transporteur : on ne dépose pas un
   colis Mondial Relay dans un point Chronopost. Le choix du point et
   celui du transporteur sont donc le même choix.

   Cette route demande d'abord à UGO quelles offres existent vers la
   destination (multi-rate), retient la MOINS CHÈRE, puis ne propose
   que les points de ce transporteur-là. Sans cette règle, le client
   pouvait choisir un point Chronopost pour l'Italie — étiquette à
   17,51 € HT — alors que la boutique ne lui facture que 9,90 €.

   Relevé du 14/09/2026, colis de 600 g depuis Étoile-sur-Rhône :
     France   Mondial Relay 4,36 €   (Chronopost 11,20 €)
     Belgique Shop2Shop     4,72 €   (Mondial Relay 5,53 €)
     Italie   Shop2Shop     6,59 €   (Mondial Relay 7,88 €)
     Suède    Shop2Shop    11,22 €   (Mondial Relay : aucun point)

   Si le moins cher n'a pas de point relais sur place, on descend à
   l'offre suivante plutôt que de renvoyer une liste vide.

   Chaque appel amont est borné à 6 s. Si UGO ne répond pas pour la
   France (l'essentiel des commandes), on interroge Mondial Relay en
   direct. Rien du tout : 200 { points: [], erreur } — un message court
   dans la langue du panier (`lang` = fr | en | sv), le détail en log.
   ═══════════════════════════════════════════════════════════════ */

const NOMS_TRANSPORTEURS: Record<string, string> = {
  MONDIALRELAY:  'Mondial Relay',
  CHRONOPOSTS2S: 'Chronopost Shop2Shop',
};

/* Seuls ces deux reseaux sont autorises : ce sont les seuls dont le
   tarif reste sous ce que la boutique facture (4,90 EUR France,
   9,90 EUR Europe). Chronopost classique est volontairement exclu —
   son offre « Chrono Classic Dropoff » est aussi un depot en relais,
   mais a 10,63 EUR vers la Belgique et 17,51 EUR vers l'Italie : la
   laisser apparaitre reviendrait a vendre a perte des qu'un client
   choisit ce point-la. */
const RESEAUX_AUTORISES = (process.env.LOGSPHER_RESEAUX_RELAIS || 'MONDIALRELAY,CHRONOPOSTS2S')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

function getApiKey() {
  const key = process.env.LOGSPHER_API_KEY;
  if (!key) throw new Error('LOGSPHER_API_KEY manquante');
  return key;
}

async function lsFetch(path: string, options: RequestInit = {}) {
  let r;
  try {
    r = await lireAvecDelai(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (e: any) {
    throw new Error(e?.name === 'AbortError' ? `LogSpher ${path} → délai de ${DELAI_MS} ms dépassé` : (e?.message || String(e)));
  }
  if (!r.ok) throw new Error(`LogSpher ${path} → ${r.status}: ${r.texte?.slice(0, 200)}`);
  return JSON.parse(r.texte);
}

/* UUID UGO du réseau Mondial Relay, retenu au passage du multi-rate :
   le repli direct sur Mondial Relay (UGO muet) en a besoin pour que
   l'étiquette parte chez le bon transporteur. Variable d'env facultative
   pour l'avoir même sur une instance froide ; sans elle ni mémoire, les
   points partent sans carrier_uuid et l'étiquette retombe sur le
   multi-rate, comme pour les commandes d'avant la migration 051. */
let uuidMondialRelay: string | null = process.env.LOGSPHER_MONDIALRELAY_UUID || null;

/** Points Mondial Relay au format du panier, transporteur complété. */
function pointsMondialRelay(points: any[], uuid: string | null) {
  return points.map((p: any) => ({ ...p, carrier_name: 'Mondial Relay', carrier_uuid: uuid }));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  /* Le panier envoyait `pays`/`ville` à l'ancienne route Mondial Relay :
     on accepte les deux écritures pour ne casser aucun appel en vol. */
  const cp      = (searchParams.get('cp') || '').trim();
  const city    = (searchParams.get('city') || searchParams.get('ville') || '').trim();
  const country = (searchParams.get('country') || searchParams.get('pays') || 'FR').toUpperCase();
  const poidsKg = Math.max(0.1, parseFloat(searchParams.get('poids') || '') || 0.8);
  const lang    = langueRelais(searchParams.get('lang'));
  const vide    = (cle: keyof typeof MESSAGES_RELAIS) =>
    NextResponse.json({ points: [], erreur: MESSAGES_RELAIS[cle][lang] }, { headers: CORS });

  if (!cp && !city) {
    return NextResponse.json({ error: 'cp ou ville requis', points: [], erreur: MESSAGES_RELAIS.requis[lang] }, { status: 400, headers: CORS });
  }

  const demain = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  // Pannes amont rencontrées : « indisponible » plutôt que « aucun point ».
  let pannes = 0;

  /* Mondial Relay en direct, au format du panier (null si rien). */
  let mrEssaye = false;
  const essayerMondialRelay = async (uuid: string | null) => {
    mrEssaye = true;
    const r = await rechercherPointsMondialRelay({ cp, pays: country, ville: city });
    if (!r.ok) {
      if (r.panne !== 'adresse') pannes++;
      console.warn('[relay-points] Mondial Relay direct :', r.panne, r.detail);
      return null;
    }
    return r.points.length ? pointsMondialRelay(r.points, uuid) : null;
  };

  /* ── 1. Quelles offres existent vers cette destination ? ── */
  let offres: any[] = [];
  let multiRateOk = false;
  try {
    const tarifs = await lsFetch('/api/carrier/multi-rate', {
      method: 'POST',
      body: JSON.stringify({
        order_id: 'relais',
        shipment: { id: 1, type: 2, shipment_date: demain, delivery_type: 'DELIVERY_TO_COLLECTION_POINT' },
        ship_from: {
          pro: true,
          country_code: (process.env.EXPEDITEUR_PAYS || 'FR').toUpperCase(),
          postcode: process.env.EXPEDITEUR_CP || '26800',
          city: process.env.EXPEDITEUR_VILLE || 'Etoile-sur-Rhone',
        },
        ship_to: { pro: false, country_code: country, postcode: cp, city: city || cp },
        parcels: [{ number: 1, weight: poidsKg, volumetric_weight: poidsKg, x: 25, y: 18, z: 10 }],
      }),
    });
    offres = (tarifs.offers || [])
      .filter((o: any) => RESEAUX_AUTORISES.includes(String(o.carrier_name || '').toUpperCase()))
      .filter((o: any) => o.delivery_to_collection_point !== false)
      .sort((a: any, b: any) => (a.price_te ?? 1e9) - (b.price_te ?? 1e9));
    multiRateOk = true;
    const mr = offres.find((o: any) => String(o.carrier_name || '').toUpperCase() === 'MONDIALRELAY');
    if (mr?.carrier_id) uuidMondialRelay = mr.carrier_id;
  } catch (e: any) {
    pannes++;
    console.warn('[relay-points] multi-rate indisponible :', e?.message);
  }

  if (!offres.length) {
    /* France : UGO muet ou sans offre, on demande directement à Mondial
       Relay — le réseau retenu pour la France de toute façon. */
    if (country === 'FR') {
      const points = await essayerMondialRelay(uuidMondialRelay);
      if (points) {
        return NextResponse.json({
          points, carrier_name: 'Mondial Relay', carrier_uuid: uuidMondialRelay,
          price_te: null, transit_time: null,
        }, { headers: CORS });
      }
      return vide(pannes ? 'indisponible' : 'aucunPoint');
    }
    return vide(multiRateOk ? 'aucunTransporteur' : 'indisponible');
  }

  /* ── 2. Les points du moins cher ; on descend s'il n'en a pas ──

     Les deux reseaux ne se cherchent pas de la meme facon, et le panier
     ne connait que le code postal du client :
       — Shop2Shop accepte le code postal seul via UGO (il le geocode :
         75017 -> PARIS, 11122 -> STOCKHOLM).
       — Mondial Relay exige un vrai nom de ville sur UGO et renvoie 0
         point sans lui. Sa propre API SOAP, elle, travaille au code
         postal — c'est celle que le panier utilisait avant. On la garde
         pour lui plutot que de reclamer la ville au client. */
  const essayes: string[] = [];
  for (const offre of offres.slice(0, 3)) {
    const uuid = offre.carrier_id;
    if (!uuid || essayes.includes(uuid)) continue;
    essayes.push(uuid);
    const reseau = String(offre.carrier_name || '').toUpperCase();

    try {
      let locations: any[];

      if (reseau === 'MONDIALRELAY') {
        // Déjà au format du panier : on complète seulement le transporteur.
        const points = await essayerMondialRelay(uuid);
        if (!points) continue;
        return NextResponse.json({
          points,
          carrier_name: 'Mondial Relay',
          carrier_uuid: uuid,
          price_te: offre.price_te ?? null,
          transit_time: offre.transit_time ?? null,
        }, { headers: CORS });
      }

      const data = await lsFetch(`/api/carrier/${uuid}/dropoff-locations`, {
        method: 'POST',
        body: JSON.stringify({
          /* `city` ne peut pas etre vide : l'API repond 400. A defaut du
             nom de ville, le code postal suffit a Shop2Shop. */
          address: city || cp,
          city: city || cp,
          postcode: cp,
          country_code: country,
        }),
      });
      locations = data.locations || [];
      if (!locations.length) continue;

      const nom = NOMS_TRANSPORTEURS[offre.carrier_name] || offre.carrier_name || 'Point relais';
      const points = locations.map((loc: any) => {
        /* UGO compte en METRES, l'API Mondial Relay en kilometres — et
           le panier ajoute « km » aux deux. Un point a 3,7 km s'affichait
           donc « 3692 km ». On ramene tout en kilometres, une decimale. */
        const metres = Number(loc.distance || 0);
        const dist = metres ? Math.round(metres / 100) / 10 : 0;
        // Horaires ramenés à [{ jour, plages }] — forme amont non garantie.
        const horaires = normaliserHoraires(loc.opening_hours ?? loc.hours ?? loc.hours_formatted ?? loc.schedule);
        return {
          id:           String(loc.location_id || loc.dropoff_location_id || ''),
          name:         loc.name || '',
          adresse:      loc.address1 || '',
          ville:        loc.city || '',
          cp:           loc.postcode || '',
          pays:         loc.country_code || country,
          carrier_name: nom,
          carrier_uuid: uuid,
          distance:     dist ? String(dist) : undefined,
          hours:        loc.hours_formatted || undefined,
          ...(horaires.length ? { horaires } : {}),
        };
      });

      return NextResponse.json({
        points,
        carrier_name: nom,
        carrier_uuid: uuid,
        price_te: offre.price_te ?? null,
        transit_time: offre.transit_time ?? null,
      }, { headers: CORS });
    } catch (e: any) {
      pannes++;
      console.warn('[relay-points] points indisponibles pour', uuid, ':', e?.message);
    }
  }

  // France : dernier recours, Mondial Relay en direct s'il n'a pas été essayé.
  if (country === 'FR' && !mrEssaye) {
    const points = await essayerMondialRelay(uuidMondialRelay);
    if (points) {
      return NextResponse.json({
        points, carrier_name: 'Mondial Relay', carrier_uuid: uuidMondialRelay,
        price_te: null, transit_time: null,
      }, { headers: CORS });
    }
  }

  return vide(pannes ? 'indisponible' : 'aucunPoint');
}
