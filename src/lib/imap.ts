import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { supabaseAdmin } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════════════════
   SYNCHRONISATION IMAP — hej@swedishcravings.fr (IONOS)

   IMAP reste la source de vérité ; `inbox_messages` n'en est qu'un
   miroir, pour qu'ouvrir un dossier dans le back-office ne dépende
   pas d'un aller-retour réseau.

   Deux pièges du protocole, traités explicitement :

   — un UID n'est unique QUE dans son dossier. La clé naturelle est
     donc (folder, uid), jamais uid seul.
   — si le serveur change `uidValidity`, tous les UID connus deviennent
     caducs : on repart de zéro pour ce dossier, sinon on rattache des
     messages aux mauvais.

   Le mot de passe ne vit que dans l'environnement. Jamais en base,
   jamais dans un journal.
   ═══════════════════════════════════════════════════════════════ */

const HOST = process.env.IMAP_HOST || 'imap.ionos.fr';
const PORT = Number(process.env.IMAP_PORT || 993);
const USER = process.env.IMAP_USER || 'hej@swedishcravings.fr';

/** Dossiers suivis. IONOS expose les dossiers spéciaux en clair. */
export const DOSSIERS: Record<string, string> = {
  INBOX: 'INBOX',
  Sent: 'Sent',
  Drafts: 'Drafts',
  Trash: 'Trash',
  Junk: 'Junk',
};

function client(): ImapFlow {
  const pass = process.env.IMAP_PASSWORD;
  if (!pass) throw new Error('IMAP_PASSWORD non configuré — la boîte mail ne peut pas se connecter');
  return new ImapFlow({
    host: HOST, port: PORT, secure: true,
    auth: { user: USER, pass },
    logger: false,                 // ne jamais journaliser une session authentifiée
    socketTimeout: 45_000,
  });
}

const texte = (v: unknown) => (typeof v === 'string' ? v : '');

/** Extrait affiché dans la liste : une seule ligne, sans balises. */
function extrait(text?: string, html?: string): string {
  const src = text || String(html || '').replace(/<[^>]+>/g, ' ');
  return src.replace(/\s+/g, ' ').trim().slice(0, 180);
}

/** Devine l'étiquette à partir de l'expéditeur — simple point de départ. */
function etiquette(from: string): string | null {
  const f = from.toLowerCase();
  if (/mondial|relay|colissimo|laposte/.test(f)) return 'Logistique';
  if (/compta|expert|urssaf|impots/.test(f)) return 'Comptabilité';
  if (/stripe|resend|vercel|supabase|google/.test(f)) return null;
  return null;
}

export type SyncResult = {
  folder: string;
  nouveaux: number;
  maj: number;
  total: number;
  erreur?: string;
};

/**
 * Synchronise un dossier.
 *
 * `limite` borne le premier passage : sur une boîte de plusieurs
 * milliers de messages, tout aspirer d'un coup ferait expirer la
 * fonction. Les passages suivants ne lisent que ce qui est nouveau.
 */
export async function syncFolder(folder = 'INBOX', limite = 200): Promise<SyncResult> {
  const c = client();
  const res: SyncResult = { folder, nouveaux: 0, maj: 0, total: 0 };

  try {
    await c.connect();
    const lock = await c.getMailboxLock(folder);
    try {
      const box: any = c.mailbox;
      res.total = Number(box?.exists) || 0;

      const { data: etat } = await supabaseAdmin
        .from('inbox_sync_state').select('*').eq('folder', folder).maybeSingle();

      /* uidValidity a change : les UID connus ne veulent plus rien dire,
         on vide le miroir de ce dossier plutot que de melanger. */
      const validity = Number(box?.uidValidity) || 0;
      const resetNecessaire = etat?.uid_validity && Number(etat.uid_validity) !== validity;
      if (resetNecessaire) {
        await supabaseAdmin.from('inbox_messages').delete().eq('folder', folder);
      }

      const lastUid = resetNecessaire ? 0 : Number(etat?.last_uid) || 0;
      const depuis = lastUid > 0 ? `${lastUid + 1}:*` : `${Math.max(1, res.total - limite + 1)}:*`;

      let maxUid = lastUid;
      for await (const msg of c.fetch(depuis, {
        uid: true, envelope: true, flags: true, source: true, internalDate: true,
      }, { uid: lastUid > 0 })) {
        const uid = Number(msg.uid);
        if (!uid) continue;
        maxUid = Math.max(maxUid, uid);

        const parsed = await simpleParser(msg.source as Buffer);
        const from: any = parsed.from?.value?.[0] || {};
        const flags: Set<string> = (msg.flags as any) || new Set();

        const ligne = {
          folder, uid, uid_validity: validity,
          message_id: texte(parsed.messageId) || null,
          from_name: texte(from.name) || null,
          from_email: texte(from.address).toLowerCase() || null,
          to_emails: (parsed.to as any)?.value?.map((v: any) => v.address).filter(Boolean) || [],
          cc_emails: (parsed.cc as any)?.value?.map((v: any) => v.address).filter(Boolean) || [],
          subject: texte(parsed.subject) || '(sans objet)',
          preview: extrait(parsed.text, parsed.html as string),
          body_html: (parsed.html as string) || null,
          body_text: parsed.text || null,
          attachments: (parsed.attachments || []).map((a: any) => ({
            filename: a.filename, size: a.size, type: a.contentType,
          })),
          seen: flags.has('\\Seen'),
          flagged: flags.has('\\Flagged'),
          answered: flags.has('\\Answered'),
          draft: flags.has('\\Draft'),
          label: etiquette(texte(from.address)),
          sent_at: new Date(parsed.date || msg.internalDate || Date.now()).toISOString(),
          synced_at: new Date().toISOString(),
        };

        const { error } = await supabaseAdmin
          .from('inbox_messages').upsert(ligne, { onConflict: 'folder,uid' });
        if (!error) res.nouveaux++;
      }

      /* Rapprochement metier : un message dont l'expediteur est un client
         connu remonte sur sa fiche. Fait en masse, pas message par message. */
      await rattacherAuxClients(folder);

      await supabaseAdmin.from('inbox_sync_state').upsert({
        folder, uid_validity: validity, last_uid: maxUid,
        last_sync_at: new Date().toISOString(), last_error: null,
      }, { onConflict: 'folder' });
    } finally {
      lock.release();
    }
  } catch (e: any) {
    res.erreur = e?.message || 'Erreur IMAP';
    await supabaseAdmin.from('inbox_sync_state').upsert({
      folder, last_sync_at: new Date().toISOString(), last_error: res.erreur,
    }, { onConflict: 'folder' });
  } finally {
    try { await c.logout(); } catch { /* la session peut deja etre tombee */ }
  }

  return res;
}

/** Relie les messages non rattachés à un client par son adresse. */
async function rattacherAuxClients(folder: string) {
  const { data: orphelins } = await supabaseAdmin
    .from('inbox_messages').select('id, from_email')
    .eq('folder', folder).is('contact_id', null).not('from_email', 'is', null).limit(200);
  if (!orphelins?.length) return;

  const emails = Array.from(new Set(orphelins.map(m => m.from_email)));
  const { data: contacts } = await supabaseAdmin
    .from('contacts').select('id, email').in('email', emails);
  if (!contacts?.length) return;

  const parEmail = Object.fromEntries(contacts.map(c => [String(c.email).toLowerCase(), c.id]));
  for (const m of orphelins) {
    const cid = parEmail[String(m.from_email).toLowerCase()];
    if (cid) await supabaseAdmin.from('inbox_messages').update({ contact_id: cid }).eq('id', m.id);
  }
}

/** Reporte un changement d'état vers le serveur : IMAP fait foi. */
export async function setFlag(folder: string, uid: number, flag: '\\Seen' | '\\Flagged', on: boolean) {
  const c = client();
  try {
    await c.connect();
    const lock = await c.getMailboxLock(folder);
    try {
      if (on) await c.messageFlagsAdd({ uid: String(uid) }, [flag], { uid: true });
      else await c.messageFlagsRemove({ uid: String(uid) }, [flag], { uid: true });
    } finally { lock.release(); }
  } finally {
    try { await c.logout(); } catch { /* ignore */ }
  }
}

/** Déplace un message (classement, corbeille). */
export async function moveMessage(folder: string, uid: number, dest: string) {
  const c = client();
  try {
    await c.connect();
    const lock = await c.getMailboxLock(folder);
    try {
      await c.messageMove({ uid: String(uid) }, dest, { uid: true });
    } finally { lock.release(); }
    await supabaseAdmin.from('inbox_messages').delete().eq('folder', folder).eq('uid', uid);
  } finally {
    try { await c.logout(); } catch { /* ignore */ }
  }
}
