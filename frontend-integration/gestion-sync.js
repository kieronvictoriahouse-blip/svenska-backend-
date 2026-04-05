/**
 * ═══════════════════════════════════════════════════════════════
 * SVENSKA GESTION — Supabase Sync Bridge
 * 
 * Fichier à inclure dans svenska_gestion.html pour synchroniser
 * les données localStorage ↔ Supabase en temps réel.
 * 
 * Usage dans svenska_gestion.html :
 *   <script>const SUPABASE_URL = '...'; const SUPABASE_ANON_KEY = '...';</script>
 *   <script src="js/gestion-sync.js"></script>
 *
 * Le module détecte automatiquement si Supabase est configuré.
 * Si non → mode offline localStorage (comportement actuel).
 * Si oui → sync bidirectionnelle automatique.
 * ═══════════════════════════════════════════════════════════════
 */

const GestionSync = (() => {

  const API = window.SD_API_URL || null; // URL du back-end Next.js (Vercel)
  let token = localStorage.getItem('sd_admin_token') || null;
  let syncing = false;

  // ── Auth ──────────────────────────────────────────────────────
  async function login(email, password) {
    if (!API) return null;
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.access_token) {
      token = data.access_token;
      localStorage.setItem('sd_admin_token', token);
      localStorage.setItem('sd_admin_email', data.user.email);
      return data;
    }
    return null;
  }

  function getHeaders() {
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
  }

  // ── Generic CRUD ──────────────────────────────────────────────
  async function apiGet(path) {
    if (!API || !token) return null;
    try {
      const res = await fetch(`${API}${path}`, { headers: getHeaders() });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async function apiPost(path, body) {
    if (!API || !token) return null;
    try {
      const res = await fetch(`${API}${path}`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
      });
      return await res.json();
    } catch { return null; }
  }

  async function apiPut(path, body) {
    if (!API || !token) return null;
    try {
      const res = await fetch(`${API}${path}`, {
        method: 'PUT', headers: getHeaders(), body: JSON.stringify(body),
      });
      return await res.json();
    } catch { return null; }
  }

  async function apiDelete(path) {
    if (!API || !token) return null;
    try {
      const res = await fetch(`${API}${path}`, { method: 'DELETE', headers: getHeaders() });
      return await res.json();
    } catch { return null; }
  }

  // ── INVOICES ──────────────────────────────────────────────────
  async function saveInvoice(inv) {
    const isNew = !inv._synced;
    const path  = isNew ? '/api/invoices' : `/api/invoices/${inv._remoteId || inv.id}`;
    const method = isNew ? apiPost : apiPut;
    const res = await method(path, inv);
    if (res?.invoice) {
      inv._synced    = true;
      inv._remoteId  = res.invoice.id;
    }
    return inv;
  }

  async function loadInvoices() {
    const data = await apiGet('/api/invoices');
    if (!data?.invoices) return null;
    return data.invoices.map(i => ({
      ...mapInvoiceFromAPI(i),
      _synced: true,
      _remoteId: i.id,
    }));
  }

  function mapInvoiceFromAPI(i) {
    return {
      id:            i.id,
      number:        i.number,
      date:          i.date,
      status:        i.status,
      clientName:    i.client_name,
      clientAddress: i.client_address,
      clientEmail:   i.client_email,
      note:          i.note,
      lines:         i.lines || [],
      totalHT:       parseFloat(i.total_ht),
      totalTVA:      parseFloat(i.total_tva),
      totalTTC:      parseFloat(i.total_ttc),
    };
  }

  function mapInvoiceToAPI(inv) {
    return {
      number:         inv.number,
      date:           inv.date,
      status:         inv.status,
      client_name:    inv.clientName,
      client_address: inv.clientAddress,
      client_email:   inv.clientEmail,
      note:           inv.note,
      lines:          inv.lines,
      total_ht:       inv.totalHT,
      total_tva:      inv.totalTVA,
      total_ttc:      inv.totalTTC,
    };
  }

  // ── PURCHASES ─────────────────────────────────────────────────
  async function savePurchase(p) {
    const isNew = !p._synced;
    const path  = isNew ? '/api/purchases' : `/api/purchases/${p._remoteId || p.id}`;
    const res = await (isNew ? apiPost : apiPut)(path, {
      supplier_name: p.supplier,
      ref:           p.ref,
      date:          p.date,
      status:        p.status,
      amount_ht:     p.amount,
      transport:     p.transport,
      total:         p.total,
      products_desc: p.products,
      notes:         p.notes,
    });
    if (res?.purchase) { p._synced = true; p._remoteId = res.purchase.id; }
    return p;
  }

  async function loadPurchases() {
    const data = await apiGet('/api/purchases');
    if (!data?.purchases) return null;
    return data.purchases.map(p => ({
      id:        p.id,
      supplier:  p.supplier_name,
      ref:       p.ref,
      date:      p.date,
      status:    p.status,
      amount:    parseFloat(p.amount_ht),
      transport: parseFloat(p.transport),
      total:     parseFloat(p.total),
      products:  p.products_desc,
      notes:     p.notes,
      _synced:   true,
      _remoteId: p.id,
    }));
  }

  // ── MARGIN PRODUCTS ───────────────────────────────────────────
  async function saveMarginProduct(prod) {
    const isNew = !prod._synced;
    const path  = isNew ? '/api/margin-products' : `/api/margin-products/${prod._remoteId || prod.id}`;
    const res = await (isNew ? apiPost : apiPut)(path, {
      name:         prod.name,
      category:     prod.cat,
      buy_price:    prod.buy,
      transport_pu: prod.trans,
      other_costs:  prod.other,
      sell_price:   prod.sell,
      stock_qty:    prod.stock,
    });
    if (res?.product) { prod._synced = true; prod._remoteId = res.product.id; }
    return prod;
  }

  async function loadMarginProducts() {
    const data = await apiGet('/api/margin-products');
    if (!data?.products) return null;
    return data.products.map(p => ({
      id:     p.id,
      name:   p.name,
      cat:    p.category,
      buy:    parseFloat(p.buy_price),
      trans:  parseFloat(p.transport_pu),
      other:  parseFloat(p.other_costs),
      revient:parseFloat(p.cost_price),
      sell:   parseFloat(p.sell_price),
      stock:  p.stock_qty,
      _synced:   true,
      _remoteId: p.id,
    }));
  }

  // ── SETTINGS ──────────────────────────────────────────────────
  async function loadSettings() {
    const data = await apiGet('/api/settings');
    if (!data?.settings) return null;
    const s = {};
    data.settings.forEach(r => s[r.key] = r.value);
    return {
      company:      s.company_name,
      legal:        s.legal_form,
      siret:        s.siret,
      tva:          s.tva_number,
      address:      s.address,
      email:        s.email,
      phone:        s.phone,
      website:      s.website,
      tvaRate:      parseFloat(s.tva_rate)||20,
      paymentDays:  parseInt(s.payment_days)||30,
      legalMention: s.legal_mention,
      iban:         s.iban,
      invPrefix:    s.invoice_prefix,
      invNext:      parseInt(s.invoice_next)||1,
    };
  }

  async function saveSettings(params) {
    return await apiPut('/api/settings', {
      company_name:   params.company,
      legal_form:     params.legal,
      siret:          params.siret,
      tva_number:     params.tva,
      address:        params.address,
      email:          params.email,
      phone:          params.phone,
      website:        params.website,
      tva_rate:       String(params.tvaRate),
      payment_days:   String(params.paymentDays),
      legal_mention:  params.legalMention,
      iban:           params.iban,
      invoice_prefix: params.invPrefix,
      invoice_next:   String(params.invNext),
    });
  }

  // ── FULL SYNC ─────────────────────────────────────────────────
  // Pousse toutes les données localStorage non-synchronisées vers Supabase
  async function pushUnsyncedData() {
    if (!API || !token || syncing) return;
    syncing = true;
    let pushed = 0;

    // Factures
    const invs = JSON.parse(localStorage.getItem('sd_mgmt_invoices')||'[]');
    const updatedInvs = await Promise.all(invs.map(async i => {
      if (!i._synced) { pushed++; return await saveInvoice(mapInvoiceToAPI(i)); }
      return i;
    }));
    localStorage.setItem('sd_mgmt_invoices', JSON.stringify(updatedInvs));

    // Achats
    const purs = JSON.parse(localStorage.getItem('sd_mgmt_purchases')||'[]');
    const updatedPurs = await Promise.all(purs.map(async p => {
      if (!p._synced) { pushed++; return await savePurchase(p); }
      return p;
    }));
    localStorage.setItem('sd_mgmt_purchases', JSON.stringify(updatedPurs));

    // Produits marges
    const prods = JSON.parse(localStorage.getItem('sd_mgmt_products')||'[]');
    const updatedProds = await Promise.all(prods.map(async p => {
      if (!p._synced) { pushed++; return await saveMarginProduct(p); }
      return p;
    }));
    localStorage.setItem('sd_mgmt_products', JSON.stringify(updatedProds));

    syncing = false;
    if (pushed > 0) console.log(`[GestionSync] ${pushed} enregistrements synchronisés ✅`);
    return pushed;
  }

  // Pull : récupère tout depuis Supabase et écrase le localStorage
  async function pullAllData() {
    if (!API || !token) return false;
    syncing = true;
    const [invs, purs, prods, settings] = await Promise.all([
      loadInvoices(),
      loadPurchases(),
      loadMarginProducts(),
      loadSettings(),
    ]);
    if (invs)     localStorage.setItem('sd_mgmt_invoices',  JSON.stringify(invs));
    if (purs)     localStorage.setItem('sd_mgmt_purchases', JSON.stringify(purs));
    if (prods)    localStorage.setItem('sd_mgmt_products',  JSON.stringify(prods));
    if (settings) localStorage.setItem('sd_mgmt_params',    JSON.stringify(settings));
    syncing = false;
    console.log('[GestionSync] Données synchronisées depuis Supabase ✅');
    return true;
  }

  // ── STATUS ────────────────────────────────────────────────────
  function isConnected() { return !!API && !!token; }

  function status() {
    return {
      connected: isConnected(),
      apiUrl:    API,
      hasToken:  !!token,
      syncing,
    };
  }

  // ── AUTO-SYNC au démarrage ────────────────────────────────────
  if (API && token) {
    // Tente de récupérer les données depuis Supabase au chargement
    pullAllData().then(ok => {
      if (ok) {
        // Rafraîchir l'UI si la page Gestion est déjà ouverte
        if (typeof refreshDashboard === 'function') refreshDashboard();
        if (typeof renderInvoiceList === 'function') renderInvoiceList();
      }
    });
  }

  return { login, pushUnsyncedData, pullAllData, isConnected, status, saveInvoice, savePurchase, saveMarginProduct, saveSettings, loadSettings };

})();

// ── Indicateur connexion dans l'UI ───────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const s = GestionSync.status();
  const foot = document.querySelector('.sb-foot');
  if (foot) {
    const indicator = document.createElement('div');
    indicator.style.cssText = 'font-size:10px;margin-bottom:8px;display:flex;align-items:center;gap:5px';
    indicator.innerHTML = s.connected
      ? '<span style="color:#16A34A">●</span><span style="color:rgba(255,255,255,0.4)">Connecté à Supabase</span>'
      : '<span style="color:#D97706">●</span><span style="color:rgba(255,255,255,0.3)">Mode hors-ligne</span>';
    foot.insertBefore(indicator, foot.firstChild);
  }
});
