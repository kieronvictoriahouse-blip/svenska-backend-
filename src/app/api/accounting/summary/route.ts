import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Seuils micro-entreprise BIC marchandises 2025 (Art. 50-0 CGI + Art. 293 B CGI)
const SEUIL_MICRO = 188700;   // seuil CA micro-BIC marchandises
const SEUIL_TVA   = 91900;    // seuil franchise TVA livraisons de biens (Art. 293 B CGI)
const ABATTEMENT = 0.71;      // abattement forfaitaire BIC marchandises
const TAUX_COTISATIONS = 0.123; // cotisations sociales BIC achat-revente 2025

export async function GET(req: NextRequest) {
  if (!await requireAuth(req)) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  const year = req.nextUrl.searchParams.get('year') || new Date().getFullYear().toString();

  const { data, error } = await supabaseAdmin
    .from('accounting_entries')
    .select('date, type, amount, category')
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = data || [];

  // Monthly breakdown
  const months: Record<string, { income: number; expense: number }> = {};
  for (let m = 1; m <= 12; m++) {
    months[String(m).padStart(2, '0')] = { income: 0, expense: 0 };
  }
  for (const e of entries) {
    const month = e.date.slice(5, 7);
    if (months[month]) {
      if (e.type === 'income') months[month].income += Number(e.amount);
      else months[month].expense += Number(e.amount);
    }
  }

  // Category breakdown for expenses
  const expensesByCategory: Record<string, number> = {};
  for (const e of entries.filter(e => e.type === 'expense')) {
    expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + Number(e.amount);
  }

  const totalIncome = entries
    .filter(e => e.type === 'income')
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalExpense = entries
    .filter(e => e.type === 'expense')
    .reduce((s, e) => s + Number(e.amount), 0);

  const resultatBrut = totalIncome - totalExpense;
  const resultatImposable = Math.max(0, totalIncome * (1 - ABATTEMENT));
  const cotisationsEstimees = totalIncome * TAUX_COTISATIONS;
  const percentSeuil = Math.min(100, (totalIncome / SEUIL_MICRO) * 100);
  const percentTVA = Math.min(100, (totalIncome / SEUIL_TVA) * 100);

  return NextResponse.json({
    year,
    totalIncome:          Math.round(totalIncome * 100) / 100,
    totalExpense:         Math.round(totalExpense * 100) / 100,
    resultatBrut:         Math.round(resultatBrut * 100) / 100,
    resultatImposable:    Math.round(resultatImposable * 100) / 100,
    cotisationsEstimees:  Math.round(cotisationsEstimees * 100) / 100,
    percentSeuil:         Math.round(percentSeuil * 10) / 10,
    percentTVA:           Math.round(percentTVA * 10) / 10,
    seuilMicro:           SEUIL_MICRO,
    seuilTVA:             SEUIL_TVA,
    abattement:           ABATTEMENT,
    months,
    expensesByCategory,
  });
}
