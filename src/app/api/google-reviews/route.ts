import { NextResponse } from 'next/server';

const API_KEY  = process.env.GOOGLE_PLACES_API_KEY;
const PLACE_ID = process.env.GOOGLE_PLACE_ID;

// Cache en mémoire 1 h
let _cache: { data: unknown; at: number } | null = null;
const TTL = 60 * 60 * 1000;

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!API_KEY || !PLACE_ID) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  if (_cache && Date.now() - _cache.at < TTL) {
    return NextResponse.json(_cache.data, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${PLACE_ID}` +
    `&fields=reviews,rating,user_ratings_total` +
    `&reviews_sort=newest` +
    `&language=fr` +
    `&key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json({ error: 'google_error' }, { status: 502 });
  }

  const json = await res.json();
  if (json.status !== 'OK') {
    return NextResponse.json({ error: json.status }, { status: 502 });
  }

  const result = {
    rating: json.result?.rating ?? null,
    total:  json.result?.user_ratings_total ?? null,
    reviews: (json.result?.reviews ?? []).map((r: {
      author_name: string;
      rating: number;
      text: string;
      relative_time_description: string;
      profile_photo_url?: string;
    }) => ({
      author:  r.author_name,
      rating:  r.rating,
      text:    r.text,
      date:    r.relative_time_description,
      photo:   r.profile_photo_url || null,
    })),
  };

  _cache = { data: result, at: Date.now() };

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
