import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';
import { categoryDef } from '@/lib/finance/pcg';
import { toutLire } from '@/lib/finance/tout-lire';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  vente_en_ligne:    'Vente en ligne',
  vente_directe:     'Vente directe',
  facture:           'Facture',
  achat_marchandise: 'Achat marchandise',
  frais_port:        'Frais de port',
  frais_logistique:  'Frais logistiques',
  frais_stripe:      'Frais Stripe',
  cotisations:       'Cotisations sociales',
  emballages:        'Emballages',
  autre:             'Autre',
};

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const year = req.nextUrl.searchParams.get('year') || new Date().getFullYear().toString();

  if (!/^\d{4}$/.test(year)) return NextResponse.json({ error: 'Année invalide' }, { status: 400 });

  // Toute l'année : une seule lecture s'arrêtait à 1000 écritures.
  let entries: any[];
  try {
    entries = await toutLire(() => supabaseAdmin
      .from('accounting_entries')
      .select('*')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .order('date', { ascending: true })
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  /* Écritures d'une vitrine hors euro : le montant reste en EUR, l'original
     et le taux en colonnes de plus. Sans elles, l'export ne change pas. */
  const multi = entries.some(e => e.currency && e.currency !== 'EUR');
  const colonnesDevise = (e: any) => e.currency && e.currency !== 'EUR'
    ? [e.amount_currency != null ? Number(e.amount_currency).toFixed(2).replace('.', ',') : '', String(e.currency), e.fx_rate != null ? String(e.fx_rate).replace('.', ',') : '']
    : ['', '', ''];
  const rows: string[] = [
    ['Date', 'Type', 'Catégorie', 'Description', 'Montant (€)', 'N° pièce', 'Source',
      ...(multi ? ['Montant devise', 'Devise', 'Taux de change'] : [])].join(';'),
  ];

  for (const entry of entries) {
    rows.push([
      entry.date,
      entry.type === 'income' ? 'Recette' : 'Dépense',
      // Catégories de la pile de tri (march, emb…) : leur libellé, pas la clé.
      CATEGORY_LABELS[entry.category] || categoryDef(entry.category).label,
      `"${(entry.description || '').replace(/"/g, '""')}"`,
      String(parseFloat(entry.amount).toFixed(2)).replace('.', ','),
      entry.reference_number || '',
      entry.reference_type || '',
      ...(multi ? colonnesDevise(entry) : []),
    ].join(';'));
  }

  // BOM UTF-8 for Excel compatibility
  const csv = '﻿' + rows.join('\r\n');
  const filename = `Comptabilite_${year}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
