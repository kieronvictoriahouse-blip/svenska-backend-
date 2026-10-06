'use client';
import { useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';

/* ═══════════════════════════════════════════════════════════════
   IMPORT DE CATALOGUE PAR FICHIER

   Le fichier est lu dans le navigateur (CSV d'Excel « ; » ou « , »,
   prix à virgule, guillemets), montré en aperçu, puis envoyé par lots
   de 20 à /api/import/fichier — qui ignore les doublons, crée les
   catégories, rapatrie et allège les images, pose le stock initial.
   ═══════════════════════════════════════════════════════════════ */

const TIF = {
  intro:     { fr: 'Ajoutez tout votre catalogue en une fois depuis un tableur (Excel, Google Sheets, LibreOffice) enregistré en CSV.', en: 'Add your whole catalogue at once from a spreadsheet (Excel, Google Sheets, LibreOffice) saved as CSV.', sv: 'Lägg till hela sortimentet på en gång från ett kalkylark (Excel, Google Sheets, LibreOffice) sparat som CSV.' },
  modele:    { fr: 'Télécharger le modèle', en: 'Download the template', sv: 'Ladda ner mallen' },
  choisir:   { fr: 'Choisir le fichier CSV', en: 'Choose the CSV file', sv: 'Välj CSV-filen' },
  colonnes:  { fr: 'Colonnes reconnues : nom, prix (obligatoires) · prix_achat, poids, ean, reference, categorie, stock, image (lien), description, nom_sv, nom_en.', en: 'Recognised columns: nom, prix (required) · prix_achat, poids, ean, reference, categorie, stock, image (link), description, nom_sv, nom_en.', sv: 'Kolumner: nom, prix (obligatoriska) · prix_achat, poids, ean, reference, categorie, stock, image (länk), description, nom_sv, nom_en.' },
  apercu:    { fr: 'Aperçu', en: 'Preview', sv: 'Förhandsgranskning' },
  lignes:    { fr: 'ligne(s)', en: 'row(s)', sv: 'rad(er)' },
  invalides: { fr: 'incomplète(s), elles seront ignorées', en: 'incomplete, they will be skipped', sv: 'ofullständiga, hoppas över' },
  importer:  { fr: 'Importer', en: 'Import', sv: 'Importera' },
  produits:  { fr: 'produit(s)', en: 'product(s)', sv: 'produkt(er)' },
  enCours:   { fr: 'Import en cours', en: 'Importing', sv: 'Importerar' },
  bilan:     { fr: 'Bilan', en: 'Summary', sv: 'Sammanfattning' },
  crees:     { fr: 'créé(s)', en: 'created', sv: 'skapade' },
  ignores:   { fr: 'déjà au catalogue (ignorés)', en: 'already in catalogue (skipped)', sv: 'finns redan (hoppades över)' },
  erreurs:   { fr: 'en erreur', en: 'failed', sv: 'misslyckades' },
  vide:      { fr: 'Fichier vide ou colonnes « nom » et « prix » introuvables.', en: 'Empty file or “nom” and “prix” columns not found.', sv: 'Tom fil eller kolumnerna ”nom” och ”prix” saknas.' },
  doublons:  { fr: 'Les produits déjà présents (même EAN, référence ou nom) sont ignorés : vous pouvez relancer un import sans risque de doublon.', en: 'Products already present (same EAN, reference or name) are skipped: you can re-run an import with no risk of duplicates.', sv: 'Produkter som redan finns (samma EAN, referens eller namn) hoppas över: du kan köra om en import utan dubbletter.' },
};

/* En-têtes acceptés → champ (FR, EN, quelques variantes courantes). */
const ALIAS: Record<string, string> = {
  nom: 'nom', name: 'nom', name_fr: 'nom', produit: 'nom', designation: 'nom', 'désignation': 'nom', libelle: 'nom', 'libellé': 'nom',
  prix: 'prix', price: 'prix', prix_vente: 'prix', 'prix ttc': 'prix', pv: 'prix',
  prix_achat: 'prix_achat', 'prix achat': 'prix_achat', cost: 'prix_achat', cost_price: 'prix_achat', pa: 'prix_achat',
  poids: 'poids', weight: 'poids', ean: 'ean', 'code-barres': 'ean', 'code barre': 'ean', gtin: 'ean', barcode: 'ean',
  reference: 'reference', 'référence': 'reference', ref: 'reference', sku: 'reference',
  categorie: 'categorie', 'catégorie': 'categorie', category: 'categorie', rayon: 'categorie',
  stock: 'stock', quantite: 'stock', 'quantité': 'stock', qty: 'stock',
  image: 'image', image_url: 'image', photo: 'image',
  description: 'description', desc: 'description', desc_fr: 'description',
  nom_sv: 'nom_sv', name_sv: 'nom_sv', nom_en: 'nom_en', name_en: 'nom_en',
};

/** CSV → lignes de cellules. Gère « ; » / « , » / tabulation, guillemets, BOM. */
function lireCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, '');
  const premiere = t.split(/\r?\n/)[0] || '';
  const sep = [';', '\t', ','].sort((a, b) => premiere.split(b).length - premiere.split(a).length)[0];
  const lignes: string[][] = [];
  let cell = '', row: string[] = [], guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (guillemets) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') guillemets = false;
      else cell += ch;
    } else if (ch === '"') guillemets = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim())) lignes.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim())) lignes.push(row);
  return lignes;
}

const nombre = (v?: string) => {
  const s = String(v ?? '').replace(/\s|€/g, '').replace(',', '.');
  return s === '' ? null : Number(s);
};

type Brute = Record<string, string>;
type Resultat = { ligne: number; nom: string; statut: 'cree' | 'ignore' | 'erreur'; raison?: string };

export default function ImportFichierPage() {
  const { t } = useT(TIF);
  const [lignes, setLignes] = useState<Array<Brute & { _ligne: number }>>([]);
  const [erreurFichier, setErreurFichier] = useState('');
  const [envoi, setEnvoi] = useState<{ fait: number; total: number } | null>(null);
  const [resultats, setResultats] = useState<Resultat[] | null>(null);

  function telechargerModele() {
    const contenu = '﻿nom;prix;prix_achat;poids;ean;reference;categorie;stock;image;description;nom_sv;nom_en\n'
      + 'Kanelbullar 6 pièces;6,90;3,10;300 g;7310000000000;KB-6;Fika;12;https://exemple.fr/photo.jpg;Brioches à la cannelle;Kanelbullar 6 st;Cinnamon buns 6 pcs\n';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }));
    a.download = 'modele-import-catalogue.csv';
    a.click();
  }

  async function lireFichier(f: File) {
    setResultats(null); setErreurFichier('');
    const brut = lireCsv(await f.text());
    if (brut.length < 2) { setErreurFichier(t('vide')); setLignes([]); return; }
    const entetes = brut[0].map(h => ALIAS[h.trim().toLowerCase()] || '');
    if (!entetes.includes('nom') || !entetes.includes('prix')) { setErreurFichier(t('vide')); setLignes([]); return; }
    setLignes(brut.slice(1).map((cells, i) => {
      const o: any = { _ligne: i + 2 };
      entetes.forEach((champ, j) => { if (champ) o[champ] = (cells[j] || '').trim(); });
      return o;
    }));
  }

  const valide = (l: Brute) => !!(l.nom && Number(nombre(l.prix)) > 0);
  const aImporter = lignes.filter(valide);

  async function importer() {
    const tous: Resultat[] = [];
    setEnvoi({ fait: 0, total: aImporter.length });
    for (let i = 0; i < aImporter.length; i += 20) {
      const lot = aImporter.slice(i, i + 20).map(l => ({
        ligne: l._ligne, nom: l.nom, nom_sv: l.nom_sv, nom_en: l.nom_en,
        prix: nombre(l.prix), prix_achat: nombre(l.prix_achat), poids: l.poids,
        ean: l.ean, reference: l.reference, categorie: l.categorie,
        stock: l.stock === undefined || l.stock === '' ? null : nombre(l.stock),
        image: l.image, description: l.description,
      }));
      try {
        const r = await adminFetch('/api/import/fichier', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lignes: lot }),
        });
        const d = await r.json();
        tous.push(...(r.ok ? d.resultats : lot.map(x => ({ ligne: x.ligne, nom: x.nom, statut: 'erreur' as const, raison: d.error }))));
      } catch (e: any) {
        tous.push(...lot.map(x => ({ ligne: x.ligne, nom: x.nom, statut: 'erreur' as const, raison: e?.message || 'réseau' })));
      }
      setEnvoi({ fait: Math.min(i + 20, aImporter.length), total: aImporter.length });
    }
    setEnvoi(null);
    setResultats(tous);
    setLignes([]);
  }

  const compte = (s: Resultat['statut']) => (resultats || []).filter(r => r.statut === s).length;

  return (
    <div style={{ maxWidth: 980 }}>
      <p style={{ color: T.text2, fontSize: 13, margin: '0 0 6px' }}>{t('intro')}</p>
      <p style={{ color: T.muted, fontSize: 12, margin: '0 0 14px' }}>{t('colonnes')}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="sc-btn sc-btn-secondary" onClick={telechargerModele}><span className="ms">download</span>{t('modele')}</button>
        <label className="sc-btn sc-btn-primary" style={{ cursor: 'pointer' }}>
          <span className="ms">upload_file</span>{t('choisir')}
          <input type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                 onChange={e => { const f = e.target.files?.[0]; if (f) lireFichier(f); e.target.value = ''; }} />
        </label>
      </div>
      {erreurFichier && <div style={{ color: T.red, fontSize: 13, marginBottom: 12 }}>{erreurFichier}</div>}

      {lignes.length > 0 && (
        <div className="sc-card" style={{ padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <b>{t('apercu')} — {lignes.length} {t('lignes')}
              {lignes.length > aImporter.length && <span style={{ color: '#C97A2B', fontWeight: 400 }}> · {lignes.length - aImporter.length} {t('invalides')}</span>}
            </b>
            <button className="sc-btn sc-btn-primary" disabled={!!envoi || !aImporter.length} onClick={importer}>
              {envoi ? `${t('enCours')} ${envoi.fait}/${envoi.total}…` : `${t('importer')} ${aImporter.length} ${t('produits')}`}
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ color: T.muted, textAlign: 'left' }}>
                {['#', 'nom', 'prix', 'prix_achat', 'ean', 'categorie', 'stock', 'image'].map(h => <th key={h} style={{ padding: '4px 6px' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {lignes.slice(0, 15).map(l => (
                  <tr key={l._ligne} style={{ borderTop: `1px solid ${T.border}`, color: valide(l) ? T.ink : '#C97A2B' }}>
                    <td style={{ padding: '4px 6px' }}>{l._ligne}</td>
                    <td style={{ padding: '4px 6px' }}>{l.nom || '—'}</td>
                    <td style={{ padding: '4px 6px' }}>{l.prix || '—'}</td>
                    <td style={{ padding: '4px 6px' }}>{l.prix_achat || ''}</td>
                    <td style={{ padding: '4px 6px' }}>{l.ean || ''}</td>
                    <td style={{ padding: '4px 6px' }}>{l.categorie || ''}</td>
                    <td style={{ padding: '4px 6px' }}>{l.stock || ''}</td>
                    <td style={{ padding: '4px 6px' }}>{l.image ? '✓' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>{t('doublons')}</div>
        </div>
      )}

      {resultats && (
        <div className="sc-card" style={{ padding: '12px 14px' }}>
          <b>{t('bilan')}</b>
          <div style={{ display: 'flex', gap: 16, margin: '8px 0', fontSize: 13 }}>
            <span style={{ color: T.green }}>✓ {compte('cree')} {t('crees')}</span>
            <span style={{ color: T.muted }}>{compte('ignore')} {t('ignores')}</span>
            <span style={{ color: compte('erreur') ? T.red : T.muted }}>{compte('erreur')} {t('erreurs')}</span>
          </div>
          {resultats.filter(r => r.statut === 'erreur' || r.raison).slice(0, 50).map(r => (
            <div key={r.ligne} style={{ fontSize: 12, color: r.statut === 'erreur' ? T.red : T.muted }}>
              {r.ligne} · {r.nom} — {r.raison}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
