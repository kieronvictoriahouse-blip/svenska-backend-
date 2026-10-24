/* ═══════════════════════════════════════════════════════════════
   PHOTO RÉDUITE AVANT L'ENVOI (navigateur)

   Vercel refuse tout corps de requête au-delà de ~4,5 Mo, avant même
   que /api/upload ne s'exécute (réponse 413 en texte brut) ; la route
   elle-même s'arrête à 4 Mo. Or une photo prise au téléphone — le
   bouton « Prendre une photo » des écrans mobiles — pèse couramment
   4 à 10 Mo : l'envoi échouait, souvent sans aucun message.

   On réduit donc dans le navigateur ce qui dépasse 3,5 Mo : 2000 px
   au plus sur le grand côté, JPEG 85 (WebP pour une image à
   transparence, si le navigateur sait l'encoder). Le serveur allège
   ensuite à 1600 px comme avant (lib/optimiser-image). Toute erreur
   rend le fichier d'origine : l'envoi décidera.
   ═══════════════════════════════════════════════════════════════ */

const SEUIL = 3.5 * 1024 * 1024;
const COTE = 2000;

export async function reduirePhoto(file: File): Promise<File> {
  if (!file || !file.type.startsWith('image/') || file.type === 'image/gif' || file.size <= SEUIL) return file;
  try {
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const k = Math.min(1, COTE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    img.close?.();
    const alpha = file.type === 'image/png' || file.type === 'image/webp';
    const type = alpha ? 'image/webp' : 'image/jpeg';
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, type, 0.85));
    // Navigateur sans encodeur WebP : il rend du PNG, souvent plus lourd — on garde l'original.
    if (!blob || blob.type !== type || blob.size >= file.size) return file;
    const nom = file.name.replace(/\.[^.]+$/, '') + (alpha ? '.webp' : '.jpg');
    return new File([blob], nom, { type });
  } catch {
    return file;
  }
}

/** Message d'erreur lisible d'une réponse d'envoi, JSON ou non (413 de Vercel). */
export async function erreurEnvoi(res: Response): Promise<string> {
  const d = await res.json().catch(() => null);
  if (d && d.error) return String(d.error);
  if (res.status === 413) return 'Fichier trop lourd (4 Mo au plus).';
  return `Envoi impossible (erreur ${res.status}).`;
}
