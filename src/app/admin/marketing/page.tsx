'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

type Campaign = {
  id: string; name: string; type: string; status: string; subject?: string;
  content?: string; target_segment: string; budget?: number; spent?: number;
  sent_count: number; open_count: number; click_count: number; conversion_count: number;
  revenue_generated: number; scheduled_at?: string; created_at: string;
};
type PromoCode = {
  id: string; code: string; type: string; value: number; min_order: number;
  max_uses?: number; used_count: number; valid_from?: string; valid_until?: string; is_active: boolean;
};
type AbandonedCart = {
  id: string; customer_email: string; customer_name?: string; cart_total: number;
  email_1_sent_at?: string; email_2_sent_at?: string; recovered: boolean; created_at: string;
};

const CAMP_TYPES: Record<string, string> = { email: '📧 Email', sms: '📱 SMS', meta_ads: '📘 Meta Ads', google_ads: '🔍 Google Ads', social_ads: '📣 Social' };
const SEGMENTS: Record<string, string> = { all: 'Tous les clients', new_customers: 'Nouveaux clients', loyal: 'Clients fidèles', inactive: 'Clients inactifs', abandoned_cart: 'Panier abandonné' };
const STATUS_C: Record<string, { label: string; color: string }> = { draft: { label: 'Brouillon', color: '#6A7280' }, active: { label: 'Active', color: '#10B981' }, paused: { label: 'Pausée', color: '#F59E0B' }, completed: { label: 'Terminée', color: '#2563EB' } };
const fmt = (n: number) => (n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtPct = (n: number) => (n || 0).toFixed(1) + '%';

function MarketingInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [toast, setToast] = useState('');
  const [campForm, setCampForm] = useState({ name: '', type: 'email', status: 'draft', subject: '', content: '', target_segment: 'all', budget: '' });
  const [codeForm, setCodeForm] = useState({ code: '', type: 'percent', value: '', min_order: '0', max_uses: '', valid_from: '', valid_until: '', is_active: true });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => { loadData(); }, [tab]);

  async function loadData() {
    setLoading(true);
    if (tab === 'campaigns') {
      const res = await fetch('/api/marketing');
      setCampaigns((await res.json()).campaigns || []);
    } else if (tab === 'promo') {
      const res = await fetch('/api/marketing?tab=promo');
      setCodes((await res.json()).codes || []);
    } else if (tab === 'cart') {
      const res = await fetch('/api/marketing?tab=abandoned');
      setCarts((await res.json()).carts || []);
    }
    setLoading(false);
  }

  async function saveCampaign() {
    if (!campForm.name) { showToast('⚠️ Nom requis'); return; }
    const res = await fetch('/api/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campForm) });
    if (!res.ok) { showToast('❌ Erreur'); return; }
    showToast('✅ Campagne créée !');
    setShowModal(false);
    loadData();
  }

  async function saveCode() {
    if (!codeForm.code || !codeForm.value) { showToast('⚠️ Code et valeur requis'); return; }
    const res = await fetch('/api/marketing?tab=promo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...codeForm, value: parseFloat(codeForm.value), min_order: parseFloat(codeForm.min_order) || 0, max_uses: codeForm.max_uses ? parseInt(codeForm.max_uses) : null }) });
    if (!res.ok) { showToast('❌ Erreur'); return; }
    showToast('✅ Code promo créé !');
    setShowCodeModal(false);
    loadData();
  }

  async function toggleCode(code: PromoCode) {
    await fetch(`/api/marketing?tab=promo&id=${code.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !code.is_active }) });
    loadData();
  }

  async function sendRelance(cartId: string, step: number) {
    showToast(`📧 Relance J+${step === 1 ? 1 : step === 2 ? 3 : 7} envoyée (simulation)`);
    await fetch(`/api/marketing?tab=abandoned&id=${cartId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [`email_${step}_sent_at`]: new Date().toISOString() }) });
    loadData();
  }

  const totalRevCamp = campaigns.filter(c => c.status === 'completed').reduce((s, c) => s + (c.revenue_generated || 0), 0);
  const totalBudget = campaigns.reduce((s, c) => s + (c.spent || 0), 0);
  const roas = totalBudget > 0 ? (totalRevCamp / totalBudget).toFixed(2) : '—';
  const recoveredCarts = carts.filter(c => c.recovered).length;
  const recoveredValue = carts.filter(c => c.recovered).reduce((s, c) => s + c.cart_total, 0);

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=Jost:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
    * { box-sizing: border-box; }
    .m-wrap { font-family: 'Jost', sans-serif; }
    .m-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
    .m-title { font-family: 'Cormorant Garamond', serif; font-size: 30px; font-weight: 600; color: #1C2028; }
    .m-tabs { display: flex; gap: 0; border: 1px solid #D8CEBC; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
    .m-tab { padding: 10px 20px; font-family: 'Jost', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; border: none; background: #fff; color: #6A7280; transition: all 0.15s; }
    .m-tab.active { background: #3E5238; color: #fff; }
    .m-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
    .m-stat { background: #fff; border: 1px solid #D8CEBC; border-radius: 6px; padding: 14px 18px; }
    .m-stat-num { font-family: 'DM Mono', monospace; font-size: 20px; font-weight: 500; }
    .m-stat-label { font-size: 11px; color: #6A7280; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    .m-table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; border: 1px solid #D8CEBC; border-radius: 6px; overflow: hidden; }
    .m-table th { padding: 10px 14px; text-align: left; font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: #6A7280; background: #FDFAF5; border-bottom: 1px solid #D8CEBC; }
    .m-table td { padding: 11px 14px; border-bottom: 1px solid #F0EBE1; vertical-align: middle; }
    .m-table tr:last-child td { border-bottom: none; }
    .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; border: none; }
    .btn-primary { background: #3E5238; color: #fff; } .btn-primary:hover { background: #587050; }
    .btn-secondary { background: #F6F1E9; color: #3E4550; border: 1px solid #D8CEBC; }
    .btn-sm { padding: 4px 10px; font-size: 11px; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(28,32,40,0.5); z-index: 200; display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; overflow-y: auto; }
    .modal { background: #fff; border-radius: 8px; width: 100%; max-width: 640px; margin: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
    .modal-header { padding: 16px 20px; border-bottom: 1px solid #D8CEBC; display: flex; align-items: center; justify-content: space-between; }
    .modal-title { font-size: 16px; font-weight: 600; }
    .modal-body { padding: 20px; max-height: 70vh; overflow-y: auto; }
    .modal-footer { padding: 14px 20px; border-top: 1px solid #D8CEBC; display: flex; justify-content: flex-end; gap: 10px; }
    .form-group { margin-bottom: 12px; }
    .form-label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #6A7280; margin-bottom: 4px; }
    .form-control { width: 100%; padding: 8px 10px; border: 1px solid #D8CEBC; border-radius: 6px; font-family: 'Jost', sans-serif; font-size: 13px; outline: none; }
    .form-control:focus { border-color: #7A9468; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .mono { font-family: 'DM Mono', monospace; }
    .progress { height: 6px; background: #D8CEBC; border-radius: 3px; overflow: hidden; margin-top: 4px; }
    .progress-fill { height: 100%; border-radius: 3px; background: #3E5238; }
    .empty { padding: 40px; text-align: center; color: #6A7280; font-style: italic; }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #1C2028; color: #fff; padding: 10px 18px; border-radius: 6px; font-size: 13px; z-index: 999; }
    textarea.form-control { min-height: 120px; resize: vertical; }
    select.form-control { appearance: none; }
    .toggle { position: relative; width: 36px; height: 20px; }
    .toggle input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; inset: 0; background: #D8CEBC; border-radius: 10px; cursor: pointer; transition: 0.2s; }
    .toggle-slider::before { content: ''; position: absolute; width: 16px; height: 16px; border-radius: 50%; background: #fff; top: 2px; left: 2px; transition: 0.2s; }
    input:checked + .toggle-slider { background: #3E5238; }
    input:checked + .toggle-slider::before { transform: translateX(16px); }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="m-wrap">
        <div className="m-header">
          <div className="m-title">📣 Marketing</div>
          <div>
            {tab === 'campaigns' && <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nouvelle campagne</button>}
            {tab === 'promo' && <button className="btn btn-primary" onClick={() => setShowCodeModal(true)}>+ Nouveau code promo</button>}
          </div>
        </div>

        <div className="m-tabs">
          {[['campaigns', '📧 Campagnes'], ['promo', '🎟️ Codes promo'], ['cart', '🛒 Abandon panier']].map(([k, l]) => (
            <button key={k} className={`m-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {/* CAMPAGNES */}
        {tab === 'campaigns' && (
          <>
            <div className="m-stats">
              <div className="m-stat"><div className="m-stat-num">{campaigns.length}</div><div className="m-stat-label">Campagnes</div></div>
              <div className="m-stat"><div className="m-stat-num mono">{fmt(totalBudget)}</div><div className="m-stat-label">Budget dépensé</div></div>
              <div className="m-stat"><div className="m-stat-num mono">{fmt(totalRevCamp)}</div><div className="m-stat-label">CA généré</div></div>
              <div className="m-stat"><div className="m-stat-num">{roas}x</div><div className="m-stat-label">ROAS moyen</div></div>
            </div>
            <table className="m-table">
              <thead><tr><th>Campagne</th><th>Type</th><th>Segment</th><th>Envois</th><th>Ouvertures</th><th>Conversions</th><th>CA généré</th><th>Statut</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={8}><div className="empty">Chargement…</div></td></tr>
                : campaigns.length === 0 ? <tr><td colSpan={8}><div className="empty">Aucune campagne</div></td></tr>
                : campaigns.map(c => {
                  const st = STATUS_C[c.status] || { label: c.status, color: '#6A7280' };
                  const openRate = c.sent_count > 0 ? (c.open_count / c.sent_count * 100) : 0;
                  return (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong>{c.subject && <div style={{ fontSize: 11, color: '#6A7280' }}>{c.subject}</div>}</td>
                      <td>{CAMP_TYPES[c.type] || c.type}</td>
                      <td style={{ fontSize: 12, color: '#6A7280' }}>{SEGMENTS[c.target_segment] || c.target_segment}</td>
                      <td className="mono">{c.sent_count.toLocaleString()}</td>
                      <td>
                        <div className="mono">{fmtPct(openRate)}</div>
                        <div className="progress"><div className="progress-fill" style={{ width: `${Math.min(openRate, 100)}%` }} /></div>
                      </td>
                      <td className="mono">{c.conversion_count}</td>
                      <td className="mono" style={{ fontWeight: 600, color: '#10B981' }}>{fmt(c.revenue_generated)}</td>
                      <td><span className="badge" style={{ background: st.color + '20', color: st.color }}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {/* CODES PROMO */}
        {tab === 'promo' && (
          <>
            <div className="m-stats">
              <div className="m-stat"><div className="m-stat-num">{codes.length}</div><div className="m-stat-label">Codes créés</div></div>
              <div className="m-stat"><div className="m-stat-num" style={{ color: '#10B981' }}>{codes.filter(c => c.is_active).length}</div><div className="m-stat-label">Actifs</div></div>
              <div className="m-stat"><div className="m-stat-num">{codes.reduce((s, c) => s + c.used_count, 0)}</div><div className="m-stat-label">Utilisations total</div></div>
              <div className="m-stat"><div className="m-stat-num">—</div><div className="m-stat-label">CA via codes</div></div>
            </div>
            <table className="m-table">
              <thead><tr><th>Code</th><th>Type</th><th>Valeur</th><th>Utilisations</th><th>Validité</th><th>Actif</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={6}><div className="empty">Chargement…</div></td></tr>
                : codes.length === 0 ? <tr><td colSpan={6}><div className="empty">Aucun code promo</div></td></tr>
                : codes.map(c => (
                  <tr key={c.id}>
                    <td><strong className="mono">{c.code}</strong></td>
                    <td>{c.type === 'percent' ? 'Pourcentage' : c.type === 'fixed' ? 'Montant fixe' : 'Livraison offerte'}</td>
                    <td className="mono" style={{ fontWeight: 600, color: '#9E5A3C' }}>{c.type === 'percent' ? `${c.value}%` : c.type === 'fixed' ? fmt(c.value) : 'Offerte'}</td>
                    <td>{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                    <td style={{ fontSize: 12, color: '#6A7280' }}>{fmtDate(c.valid_from)} → {fmtDate(c.valid_until)}</td>
                    <td>
                      <label className="toggle">
                        <input type="checkbox" checked={c.is_active} onChange={() => toggleCode(c)} />
                        <span className="toggle-slider" />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ABANDON PANIER */}
        {tab === 'cart' && (
          <>
            <div className="m-stats">
              <div className="m-stat"><div className="m-stat-num">{carts.length}</div><div className="m-stat-label">Paniers abandonnés</div></div>
              <div className="m-stat"><div className="m-stat-num" style={{ color: '#10B981' }}>{recoveredCarts}</div><div className="m-stat-label">Récupérés</div></div>
              <div className="m-stat"><div className="m-stat-num mono">{fmt(recoveredValue)}</div><div className="m-stat-label">CA récupéré</div></div>
              <div className="m-stat"><div className="m-stat-num">{carts.length > 0 ? fmtPct(recoveredCarts / carts.length * 100) : '0%'}</div><div className="m-stat-label">Taux récupération</div></div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#1E40AF' }}>
              💡 <strong>Séquence automatique :</strong> J+1 "Vous avez oublié quelque chose…" · J+3 "Votre panier vous attend" · J+7 "Dernière chance — 10% de réduction"
            </div>
            <table className="m-table">
              <thead><tr><th>Client</th><th>Montant</th><th>Date abandon</th><th>Relance J+1</th><th>Relance J+3</th><th>Statut</th><th>Actions</th></tr></thead>
              <tbody>
                {loading ? <tr><td colSpan={7}><div className="empty">Chargement…</div></td></tr>
                : carts.length === 0 ? <tr><td colSpan={7}><div className="empty">Aucun panier abandonné</div></td></tr>
                : carts.map(c => (
                  <tr key={c.id}>
                    <td><div style={{ fontWeight: 600 }}>{c.customer_name || '—'}</div><div style={{ fontSize: 11, color: '#6A7280' }}>{c.customer_email}</div></td>
                    <td className="mono" style={{ fontWeight: 600 }}>{fmt(c.cart_total)}</td>
                    <td style={{ fontSize: 12, color: '#6A7280' }}>{fmtDate(c.created_at)}</td>
                    <td>{c.email_1_sent_at ? <span style={{ color: '#10B981', fontSize: 12 }}>✅ {fmtDate(c.email_1_sent_at)}</span> : <button className="btn btn-secondary btn-sm" onClick={() => sendRelance(c.id, 1)}>Envoyer</button>}</td>
                    <td>{c.email_2_sent_at ? <span style={{ color: '#10B981', fontSize: 12 }}>✅ {fmtDate(c.email_2_sent_at)}</span> : <button className="btn btn-secondary btn-sm" onClick={() => sendRelance(c.id, 2)}>Envoyer</button>}</td>
                    <td><span className="badge" style={{ background: c.recovered ? '#D1FAE5' : '#FEE2E2', color: c.recovered ? '#065F46' : '#991B1B' }}>{c.recovered ? '✅ Récupéré' : '⏳ En cours'}</span></td>
                    <td><button className="btn btn-secondary btn-sm">👁 Voir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Modal campagne */}
        {showModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <div className="modal">
              <div className="modal-header"><span className="modal-title">Nouvelle campagne</span><button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button></div>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Nom *</label><input className="form-control" value={campForm.name} onChange={e => setCampForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Newsletter Noël 2024" /></div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-control" value={campForm.type} onChange={e => setCampForm(f => ({ ...f, type: e.target.value }))}>
                      {Object.entries(CAMP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Segment cible</label>
                    <select className="form-control" value={campForm.target_segment} onChange={e => setCampForm(f => ({ ...f, target_segment: e.target.value }))}>
                      {Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                {campForm.type === 'email' && <>
                  <div className="form-group"><label className="form-label">Objet de l'email</label><input className="form-control" value={campForm.subject} onChange={e => setCampForm(f => ({ ...f, subject: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Contenu (HTML)</label><textarea className="form-control" value={campForm.content} onChange={e => setCampForm(f => ({ ...f, content: e.target.value }))} placeholder="<h1>Bonjour !</h1>..." /></div>
                </>}
                {['meta_ads', 'google_ads', 'social_ads'].includes(campForm.type) && (
                  <div className="form-group"><label className="form-label">Budget (€)</label><input type="number" className="form-control" value={campForm.budget} onChange={e => setCampForm(f => ({ ...f, budget: e.target.value }))} placeholder="500" /></div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button>
                <button className="btn btn-primary" onClick={saveCampaign}>💾 Créer</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal code promo */}
        {showCodeModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCodeModal(false)}>
            <div className="modal">
              <div className="modal-header"><span className="modal-title">Nouveau code promo</span><button className="btn btn-secondary btn-sm" onClick={() => setShowCodeModal(false)}>✕</button></div>
              <div className="modal-body">
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Code *</label><input className="form-control mono" value={codeForm.code} style={{ textTransform: 'uppercase' }} onChange={e => setCodeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="EX: NOEL10" /></div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-control" value={codeForm.type} onChange={e => setCodeForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="percent">Pourcentage (%)</option>
                      <option value="fixed">Montant fixe (€)</option>
                      <option value="free_shipping">Livraison offerte</option>
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Valeur *</label><input type="number" className="form-control mono" value={codeForm.value} onChange={e => setCodeForm(f => ({ ...f, value: e.target.value }))} placeholder={codeForm.type === 'percent' ? '10' : '5'} /></div>
                  <div className="form-group"><label className="form-label">Commande minimum (€)</label><input type="number" className="form-control mono" value={codeForm.min_order} onChange={e => setCodeForm(f => ({ ...f, min_order: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Nb utilisations max</label><input type="number" className="form-control mono" value={codeForm.max_uses} onChange={e => setCodeForm(f => ({ ...f, max_uses: e.target.value }))} placeholder="Illimité" /></div>
                  <div className="form-group"><label className="form-label">Valide du</label><input type="date" className="form-control" value={codeForm.valid_from} onChange={e => setCodeForm(f => ({ ...f, valid_from: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">Valide jusqu'au</label><input type="date" className="form-control" value={codeForm.valid_until} onChange={e => setCodeForm(f => ({ ...f, valid_until: e.target.value }))} /></div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowCodeModal(false)}>Annuler</button>
                <button className="btn btn-primary" onClick={saveCode}>💾 Créer le code</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
export default function MarketingPage() { return <Suspense><MarketingInner /></Suspense>; }
