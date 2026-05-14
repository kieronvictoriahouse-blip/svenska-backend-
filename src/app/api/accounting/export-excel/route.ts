import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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
  const year = req.nextUrl.searchParams.get('year') || new Date().getFullYear().toString();

  const { data, error } = await supabaseAdmin
    .from('accounting_entries')
    .select('*')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)
    .order('date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = data || [];

  const rows: string[] = [
    ['Date', 'Type', 'Catégorie', 'Description', 'Montant (€)', 'N° pièce', 'Source'].join(';'),
  ];

  for (const entry of entries) {
    rows.push([
      entry.date,
      entry.type === 'income' ? 'Recette' : 'Dépense',
      CATEGORY_LABELS[entry.category] || entry.category,
      `"${(entry.description || '').replace(/"/g, '""')}"`,
      String(parseFloat(entry.amount).toFixed(2)).replace('.', ','),
      entry.reference_number || '',
      entry.reference_type || '',
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
