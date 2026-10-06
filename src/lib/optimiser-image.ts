/* ═══════════════════════════════════════════════════════════════
   OPTIMISATION DES IMAGES À L'ENVOI

   Origine : la panne du 01/10/2026. Le quota gratuit de bande passante
   Supabase (5 Go/mois) a sauté parce que les photos produits étaient
   stockées telles qu'envoyées — jusqu'à 6,4 Mo pièce — et resservies à
   chaque vue. Une boutique ne doit plus jamais stocker une image brute.

   Règle : 1600 px maximum sur le grand côté (assez pour un zoom de
   fiche produit en écran Retina), JPEG qualité 82 — ou WebP si l'image
   a de la transparence, pour la garder. On ne remplace l'original que
   si le résultat est plus léger. Toute erreur (format exotique, sharp
   indisponible) laisse passer l'original : un envoi ne doit jamais
   échouer à cause de l'optimisation.
   ═══════════════════════════════════════════════════════════════ */

const COTE_MAX = 1600;
const QUALITE = 82;
/** En dessous, une image déjà petite n'est pas retouchée. */
const DEJA_LEGERE = 300 * 1024;

const OPTIMISABLES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif']);

export type ImageOptimisee = { buffer: Buffer; mime: string; ext: string; avant: number; apres: number };

export async function optimiserImage(entree: ArrayBuffer | Buffer, mime: string): Promise<ImageOptimisee> {
  const original = Buffer.isBuffer(entree) ? entree : Buffer.from(entree);
  const ext0 = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const tel = { buffer: original, mime, ext: ext0, avant: original.length, apres: original.length };
  if (!OPTIMISABLES.has(mime)) return tel;

  try {
    const sharp = (await import('sharp')).default;
    const img = sharp(original, { failOn: 'none' }).rotate();          // applique l'orientation EXIF
    const meta = await img.metadata();
    const grand = Math.max(meta.width || 0, meta.height || 0);
    if (grand <= COTE_MAX && original.length <= DEJA_LEGERE) return tel;

    const redim = img.resize({ width: COTE_MAX, height: COTE_MAX, fit: 'inside', withoutEnlargement: true });
    const avecAlpha = !!meta.hasAlpha;
    const sortie = avecAlpha
      ? await redim.webp({ quality: QUALITE }).toBuffer()
      : await redim.jpeg({ quality: QUALITE, mozjpeg: true }).toBuffer();

    if (sortie.length >= original.length) return tel;
    return {
      buffer: sortie,
      mime: avecAlpha ? 'image/webp' : 'image/jpeg',
      ext: avecAlpha ? 'webp' : 'jpg',
      avant: original.length,
      apres: sortie.length,
    };
  } catch (e: any) {
    console.warn('[optimiserImage] original conservé :', e?.message || e);
    return tel;
  }
}
