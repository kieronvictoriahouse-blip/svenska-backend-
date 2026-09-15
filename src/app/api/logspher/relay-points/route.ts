import { NextRequest, NextResponse } from 'next/server';

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
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LogSpher ${path} → ${res.status}: ${text?.slice(0, 200)}`);
  return JSON.parse(text);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  /* Le panier envoyait `pays`/`ville` à l'ancienne route Mondial Relay :
     on accepte les deux écritures pour ne casser aucun appel en vol. */
  const cp      = (searchParams.get('cp') || '').trim();
  const city    = (searchParams.get('city') || searchParams.get('ville') || '').trim();
  const country = (searchParams.get('country') || searchParams.get('pays') || 'FR').toUpperCase();
  const poidsKg = Math.max(0.1, parseFloat(searchParams.get('poids') || '') || 0.8);

  if (!cp && !city) {
    return NextResponse.json({ error: 'cp ou ville requis' }, { status: 400, headers: CORS });
  }

  const demain = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  /* ── 1. Quelles offres existent vers cette destination ? ── */
  let offres: any[] = [];
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
  } catch (e: any) {
    console.warn('[relay-points] multi-rate indisponible :', e?.message);
  }

  if (!offres.length) {
    return NextResponse.json(
      { points: [], erreur: 'Aucun transporteur ne dessert cette destination en point relais.' },
      { headers: CORS });
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
  const origine = new URL(req.url).origin;
  const essayes: string[] = [];
  for (const offre of offres.slice(0, 3)) {
    const uuid = offre.carrier_id;
    if (!uuid || essayes.includes(uuid)) continue;
    essayes.push(uuid);
    const reseau = String(offre.carrier_name || '').toUpperCase();

    try {
      let locations: any[];

      if (reseau === 'MONDIALRELAY') {
        const res = await fetch(
          `${origine}/api/mondial-relay/points?cp=${encodeURIComponent(cp)}&pays=${encodeURIComponent(country)}`
          + (city ? `&ville=${encodeURIComponent(city)}` : ''));
        const pts = res.ok ? await res.json() : null;
        const bruts = Array.isArray(pts) ? pts : (pts?.points || []);
        /* Cette route renvoie deja le format du panier : on ne remappe
           pas, on complete seulement le transporteur. */
        if (!bruts.length) continue;
        return NextResponse.json({
          points: bruts.map((p: any) => ({
            ...p,
            carrier_name: 'Mondial Relay',
            carrier_uuid: uuid,
          })),
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
      console.warn('[relay-points] points indisponibles pour', uuid, ':', e?.message);
    }
  }

  return NextResponse.json(
    { points: [], erreur: 'Aucun point relais trouvé autour de cette adresse.' },
    { headers: CORS });
}
