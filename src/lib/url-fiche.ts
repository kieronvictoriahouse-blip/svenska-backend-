/* Adresses vues par le client dans les e-mails : fiche produit et photos.
   Mêmes règles que le site (js/app.js : sdProductUrl, sdThumb). */

const SUPA_MEDIA = /^https?:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/svenska-media\//i;

/** Slug de la fiche : celui figé en base (063) s'il existe, sinon calculé depuis le nom. */
export function slugProduit(p: any): string {
  const fige = String(p?.slug || '');
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}$/.test(fige)) return fige;
  const base = String(p?.name_fr || 'produit').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base}-${String(p?.id || '').slice(0, 8)}`;
}

/** Photo servie par le site, redimensionnée (`/media-w/<largeur>/…`) ; '' si inutilisable. */
export function imageProduit(url: unknown, site: string, largeur = 300): string {
  const u = String(url || '');
  if (SUPA_MEDIA.test(u)) return u.replace(SUPA_MEDIA, `${site}/media-w/${largeur}/`);
  return /^https:\/\//.test(u) ? u : '';
}
