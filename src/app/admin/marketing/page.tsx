'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { adminFetch } from '@/lib/auth-client';
import { T as TH, BADGE } from '@/lib/admin-theme';
import { useT } from '@/lib/admin-i18n';
import { TMA, confirmerSuppressionCode, codeSupprime, relanceEnvoyee } from './i18n';

type Campaign = {
  id: string; name: string; type: string; status: string; subject?: string;
  content?: string; target_segment: string; budget?: number; spent?: number;
  sent_count: number; delivered_count: number; open_count: number;
  click_count: number; bounced_count: number; conversion_count: number;
  revenue_generated: number; scheduled_at?: string; created_at: string;
};
type PromoCode = {
  id: string; code: string; type: string; value: number; min_order: number;
  max_uses?: number; used_count: number; valid_from?: string; valid_until?: string;
  is_active: boolean; single_use_per_customer: boolean; gift_product_ids?: string[];
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
  const { t, tc, lang } = useT(TMA);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null);
  const [toast, setToast] = useState('');
  const [campForm, setCampForm] = useState({ name: '', type: 'email', status: 'draft', subject: '', content: '', target_segment: 'all', budget: '' });
  const [codeForm, setCodeForm] = useState({ code: '', type: 'percent', value: '', min_order: '0', max_uses: '', valid_from: '', valid_until: '', is_active: true, single_use_per_customer: false, gift_product_ids: [] as string[] , gift_trigger_product_ids: [] as string[], gift_trigger_qty: '', gift_max: '' });
  const [products, setProducts] = useState<Array<{ id: string; name_fr: string }>>([]);
  // Opération « livraison offerte » (seuil de franco abaissé sur une période)
  const [ship, setShip] = useState({
    ship_promo_active: false, ship_promo_threshold: '', ship_promo_threshold_intl: '',
    ship_promo_from: '', ship_promo_until: '',
    ship_promo_label_fr: '', ship_promo_label_sv: '', ship_promo_label_en: '',
  });
  const [baseThreshold, setBaseThreshold] = useState(50);
  const [savingShip, setSavingShip] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  /** Un seuil France est-il réellement renseigné ? (vide = opération sans effet en FR) */
  const shipFrOk = ship.ship_promo_threshold !== '' && !Number.isNaN(Number(ship.ship_promo_threshold));

  /** Reproduit `isShipPromoActive` de @/lib/shipping pour l'aperçu admin */
  const shipPromoLive = (() => {
    if (!ship.ship_promo_active) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (ship.ship_promo_from && today < ship.ship_promo_from) return false;
    if (ship.ship_promo_until && today > ship.ship_promo_until) return false;
    return true;
  })();

  async function saveShipPromo() {
    const thr = ship.ship_promo_threshold === '' ? null : Number(ship.ship_promo_threshold);
    if (ship.ship_promo_active && thr === null && ship.ship_promo_threshold_intl === '') {
      showToast(t('msgSeuil')); return;
    }
    if (thr !== null && (Number.isNaN(thr) || thr < 0)) { showToast(t('msgSeuilFr')); return; }
    if (ship.ship_promo_from && ship.ship_promo_until && ship.ship_promo_from > ship.ship_promo_until) {
      showToast(t('msgDates')); return;
    }
    setSavingShip(true);
    try {
      const res = await adminFetch('/api/white-label', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ship_promo_active: ship.ship_promo_active,
          ship_promo_threshold: thr,
          ship_promo_threshold_intl: ship.ship_promo_threshold_intl === '' ? null : Number(ship.ship_promo_threshold_intl),
          ship_promo_from: ship.ship_promo_from || null,
          ship_promo_until: ship.ship_promo_until || null,
          ship_promo_label_fr: ship.ship_promo_label_fr || null,
          ship_promo_label_sv: ship.ship_promo_label_sv || null,
          ship_promo_label_en: ship.ship_promo_label_en || null,
        }),
      });
      if (!res.ok) { showToast(t('msgErrEnreg')); return; }
      showToast(
        !shipPromoLive ? "✅ Opération enregistrée (hors période aujourd'hui)"
        : !shipFrOk    ? '⚠️ Enregistré, mais sans seuil France : rien ne change pour la France'
        :                `✅ En cours : livraison offerte dès ${fmt(Number(ship.ship_promo_threshold))}`
      );
    } catch (e: any) {
      showToast(`❌ ${e.message}`);
    } finally {
      setSavingShip(false);
    }
  }

  useEffect(() => { loadData(); }, [tab]);

  async function loadData() {
    setLoading(true);
    if (tab === 'campaigns') {
      const res = await adminFetch('/api/marketing');
      setCampaigns((await res.json()).campaigns || []);
    } else if (tab === 'promo') {
      const res = await adminFetch('/api/marketing?tab=promo');
      setCodes((await res.json()).codes || []);
      try {
        const pr = await adminFetch('/api/products');
        const pj = await pr.json();
        setProducts((pj.products || []).map((p: any) => ({ id: p.id, name_fr: p.name_fr })).filter((p: any) => p.id && p.name_fr));
      } catch { /* liste cadeau indisponible */ }
      try {
        const wl = await adminFetch('/api/white-label').then(r => r.json());
        const c = wl.config || {};
        setBaseThreshold(Number(c.free_shipping_threshold) > 0 ? Number(c.free_shipping_threshold) : 50);
        setShip({
          ship_promo_active:         c.ship_promo_active === true,
          ship_promo_threshold:      c.ship_promo_threshold      != null ? String(c.ship_promo_threshold) : '',
          ship_promo_threshold_intl: c.ship_promo_threshold_intl != null ? String(c.ship_promo_threshold_intl) : '',
          ship_promo_from:           c.ship_promo_from  ? String(c.ship_promo_from).slice(0, 10)  : '',
          ship_promo_until:          c.ship_promo_until ? String(c.ship_promo_until).slice(0, 10) : '',
          ship_promo_label_fr:       c.ship_promo_label_fr || '',
          ship_promo_label_sv:       c.ship_promo_label_sv || '',
          ship_promo_label_en:       c.ship_promo_label_en || '',
        });
      } catch { /* opération livraison indisponible */ }
    } else if (tab === 'cart') {
      const res = await adminFetch('/api/marketing?tab=abandoned');
      setCarts((await res.json()).carts || []);
    }
    setLoading(false);
  }

  async function saveCampaign() {
    if (!campForm.name) { showToast(t('msgNomRequis')); return; }
    const res = await adminFetch('/api/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(campForm) });
    if (!res.ok) { showToast(t('msgErreur')); return; }
    showToast(t('msgCampagneOk'));
    setShowModal(false);
    loadData();
  }

  const BLANK_CODE = { code: '', type: 'percent', value: '', min_order: '0', max_uses: '', valid_from: '', valid_until: '', is_active: true, single_use_per_customer: false, gift_product_ids: [] as string[], gift_trigger_product_ids: [] as string[], gift_trigger_qty: '', gift_max: ''  };

  function openNewCode() {
    setEditingCode(null);
    setCodeForm(BLANK_CODE);
    setShowCodeModal(true);
  }

  function openEditCode(c: PromoCode) {
    setEditingCode(c);
    setCodeForm({
      code: c.code,
      type: c.type,
      value: String(c.value),
      min_order: String(c.min_order || 0),
      max_uses: c.max_uses ? String(c.max_uses) : '',
      valid_from: c.valid_from ? c.valid_from.slice(0, 10) : '',
      valid_until: c.valid_until ? c.valid_until.slice(0, 10) : '',
      is_active: c.is_active,
      single_use_per_customer: c.single_use_per_customer,
      gift_product_ids: (c as any).gift_product_ids || [],
      gift_trigger_product_ids: (c as any).gift_trigger_product_ids || [],
      gift_trigger_qty: (c as any).gift_trigger_qty ? String((c as any).gift_trigger_qty) : '',
      gift_max: (c as any).gift_max ? String((c as any).gift_max) : '',
    });
    setShowCodeModal(true);
  }

  async function saveCode() {
    const isGift = codeForm.type === 'gift';
    if (isGift) {
      if (!codeForm.gift_product_ids || codeForm.gift_product_ids.length === 0) { showToast(t('msgCadeau')); return; }
      /* Des produits declencheurs sans quantite ont deja produit un
         « cadeau pour tous » en production : on refuse d enregistrer. */
      if (codeForm.gift_trigger_product_ids.length && !(parseInt(codeForm.gift_trigger_qty) > 0)) {
        showToast(t('msgQteDeclencheur')); return;
      }
      if (parseInt(codeForm.gift_trigger_qty) > 0 && !codeForm.gift_trigger_product_ids.length) {
        showToast(t('msgProduitDeclencheur')); return;
      }
    } else if (!codeForm.code) {
      showToast(t('msgCodeRequis')); return;
    } else if (codeForm.type !== 'free_shipping' && !codeForm.value) {
      /* « Livraison offerte » n'a pas de montant : le type porte toute
         l'information, comme pour le cadeau. Exiger une valeur ici
         obligeait a saisir un chiffre qui ne servait a rien. */
      showToast(t('msgValeurRequise')); return;
    }
    const autoCode = codeForm.code || (isGift ? ('CADEAU-' + Math.random().toString(36).slice(2, 7).toUpperCase()) : '');
    const payload = {
      ...codeForm,
      code: autoCode.toUpperCase(),
      value: isGift ? 0 : (parseFloat(codeForm.value) || 0),
      min_order: parseFloat(codeForm.min_order) || 0,
      max_uses: codeForm.max_uses ? parseInt(codeForm.max_uses) : null,
      valid_from: codeForm.valid_from || null,
      valid_until: codeForm.valid_until || null,
      single_use_per_customer: codeForm.single_use_per_customer,
      gift_product_ids: isGift ? codeForm.gift_product_ids : [],
      /* Un declencheur par quantite n'a de sens qu'avec des produits ET
         un pas : sans les deux, on retombe sur le seuil en euros. */
      gift_trigger_product_ids: isGift ? codeForm.gift_trigger_product_ids : [],
      gift_trigger_qty: isGift && codeForm.gift_trigger_qty && codeForm.gift_trigger_product_ids.length
        ? parseInt(codeForm.gift_trigger_qty) : null,
      gift_max: isGift && codeForm.gift_max ? parseInt(codeForm.gift_max) : null,
    };
    if (!isGift) {
      delete (payload as any).gift_product_ids;
      delete (payload as any).gift_trigger_product_ids;
      delete (payload as any).gift_trigger_qty;
      delete (payload as any).gift_max;
    }
    const url = editingCode ? `/api/marketing?tab=promo&id=${editingCode.id}` : '/api/marketing?tab=promo';
    const method = editingCode ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { showToast(t('msgErreur')); return; }
    showToast(editingCode ? '✅ Code mis à jour !' : '✅ Code promo créé !');
    setShowCodeModal(false);
    setEditingCode(null);
    loadData();
  }

  async function deleteCode(c: PromoCode) {
    if (!confirm(confirmerSuppressionCode(c.code, lang))) return;
    const res = await adminFetch(`/api/marketing?tab=promo&id=${c.id}`, { method: 'DELETE' });
    if (!res.ok) { showToast(t('msgErrSuppr')); return; }
    showToast(codeSupprime(c.code, lang));
    loadData();
  }

  async function toggleCode(code: PromoCode) {
    await adminFetch(`/api/marketing?tab=promo&id=${code.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !code.is_active }) });
    loadData();
  }

  async function sendRelance(cartId: string, step: number) {
    showToast(relanceEnvoyee(step === 1 ? 1 : step === 2 ? 3 : 7, lang));
    await adminFetch(`/api/marketing?tab=abandoned&id=${cartId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [`email_${step}_sent_at`]: new Date().toISOString() }) });
    loadData();
  }

  const totalRevCamp = campaigns.filter(c => c.status === 'completed').reduce((s, c) => s + (c.revenue_generated || 0), 0);
  const totalBudget = campaigns.reduce((s, c) => s + (c.spent || 0), 0);
  const roas = totalBudget > 0 ? (totalRevCamp / totalBudget).toFixed(2) : '—';
  const recoveredCarts = carts.filter(c => c.recovered).length;
  const recoveredValue = carts.filter(c => c.recovered).reduce((s, c) => s + c.cart_total, 0);

  /* ═══════════════════════════════════════════════════════════════
     ÉCRANS 11 & 12 — CAMPAGNES / CODES PROMO (+ abandon panier)
     Handoff §11 : cartes horizontales avec jauges Ouvertures / Clics.
     Handoff §12 : table Code (mono sur fond), Remise, Condition,
     Utilisations avec jauge, Validité, Statut.
     ═══════════════════════════════════════════════════════════════ */

  const css = `
    .mk-modal-overlay { position:fixed; inset:0; background:rgba(21,24,30,.45); backdrop-filter:blur(2px); z-index:200; display:flex; align-items:flex-start; justify-content:center; padding:40px 20px; overflow-y:auto; }
    .mk-modal { background:#fff; border:1px solid ${TH.border}; border-radius:10px; width:100%; max-width:560px; margin:auto; box-shadow:0 20px 60px rgba(0,0,0,.2); }
    .mk-modal-header { padding:14px 18px; border-bottom:1px solid ${TH.border}; }
    .mk-modal-body { padding:18px; max-height:74vh; overflow-y:auto; }
    .mk-modal-footer { padding:13px 18px; border-top:1px solid ${TH.border}; display:flex; justify-content:flex-end; gap:8px; }
    .toggle { display:inline-flex; align-items:center; cursor:pointer; }
    .toggle input { position:absolute; opacity:0; width:0; height:0; }
    .toggle-slider { width:34px; height:19px; border-radius:10px; background:#DCD6CC; position:relative; transition:background .15s; }
    .toggle-slider::after { content:''; position:absolute; top:2px; left:2px; width:15px; height:15px; border-radius:50%; background:#fff; transition:transform .15s; }
    .toggle input:checked + .toggle-slider { background:${TH.green}; }
    .toggle input:checked + .toggle-slider::after { transform:translateX(15px); }
    .form-group { margin-bottom:12px; }
    .form-label { display:block; font-size:11px; font-weight:600; color:${TH.text2b}; margin-bottom:5px; }
    .form-control { width:100%; height:34px; border:1px solid ${TH.borderField}; border-radius:7px; padding:0 10px; font-size:12.5px; background:#fff; outline:none; }
    .form-control:focus { border-color:var(--accent); }
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .btn { display:inline-flex; align-items:center; gap:6px; border-radius:7px; padding:8px 14px; font-size:12.5px; font-weight:500; cursor:pointer; border:1px solid ${TH.borderField}; background:#fff; color:#3A3228; }
    .btn-primary { background:${TH.ink}; color:#fff; border-color:${TH.ink}; }
    .btn-secondary { background:#fff; }
    .empty { padding:40px; text-align:center; color:${TH.muted}; font-size:12.5px; }
  `;

  const TABS: Array<[string, string]> = [
    ['campaigns', 'Campagnes'], ['promo', 'Codes promo'], ['cart', 'Abandon panier'],
  ];

  const campaignTone = (s: string) =>
    s === 'active' ? BADGE.green : s === 'paused' ? BADGE.amber : s === 'completed' ? BADGE.blue : BADGE.gray;
  const campaignLabel = (s: string) =>
    ({ draft: 'Brouillon', active: 'Active', paused: 'Pausée', completed: 'Terminée' } as Record<string, string>)[s] || s;

  const Gauge = ({ value, max, color }: { value: number; max: number; color: string }) => (
    <div style={{ height: 5, borderRadius: 2.5, background: TH.borderFaint2, width: '100%' }}>
      <div style={{ height: '100%', width: `${Math.min(100, max > 0 ? (value / max) * 100 : 0)}%`, borderRadius: 2.5, background: color }} />
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="sc-head">
        <div>
          <div className="sc-title">{t('titre')}</div>
          <div className="sc-sub">
            {tab === 'campaigns' ? `${campaigns.length} campagne(s) · ROAS ${roas}`
              : tab === 'promo' ? `${codes.length} code(s) · ${codes.filter(c => c.is_active).length} actif(s)`
              : `${carts.length} panier(s) abandonné(s) · ${recoveredCarts} récupéré(s)`}
          </div>
        </div>
        <div className="sc-actions">
          {tab === 'campaigns' && (
            <button className="sc-btn sc-btn-primary" onClick={() => setShowModal(true)}>
              <span className="ms">add</span>{t('nouvelleCampagne')}
            </button>
          )}
          {tab === 'promo' && (
            <button className="sc-btn sc-btn-primary" onClick={openNewCode}>
              <span className="ms">add</span>{t('nouveauCode')}
            </button>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: `1px solid ${TH.border}` }}>
        {TABS.map(([k, l]) => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)}
              style={{
                border: 'none', background: 'none', cursor: 'pointer', padding: '9px 13px', fontSize: 12.5,
                fontWeight: on ? 600 : 400, color: on ? 'var(--accent)' : TH.text2,
                boxShadow: on ? 'inset 0 -2px 0 var(--accent)' : undefined,
              }}>{l}</button>
          );
        })}
      </div>

      {/* ══════════ CAMPAGNES ══════════ */}
      {tab === 'campaigns' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))', gap: 10, marginBottom: 12 }}>
            {[
              { l: 'Campagnes', v: String(campaigns.length) },
              { l: 'Envoyés', v: campaigns.reduce((s, c) => s + (c.sent_count || 0), 0).toLocaleString('fr-FR') },
              { l: 'CA généré', v: fmt(totalRevCamp) },
              { l: 'ROAS', v: String(roas) },
            ].map(k => (
              <div key={k.l} className="sc-card" style={{ padding: '13px 15px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: TH.muted }}>{k.l}</div>
                <div className="sc-num" style={{ fontSize: 23, fontWeight: 700, marginTop: 5, color: TH.ink }}>{k.v}</div>
              </div>
            ))}
          </div>

          {loading && <div className="sc-empty">{tc('loading')}</div>}
          {!loading && campaigns.length === 0 && <div className="sc-empty">{t('aucuneCampagne')}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {campaigns.map(c => {
              const openRate = c.sent_count ? (c.open_count / c.sent_count) * 100 : 0;
              const clickRate = c.sent_count ? (c.click_count / c.sent_count) * 100 : 0;
              const tone = campaignTone(c.status);
              return (
                <div key={c.id} className="sc-card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 15px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: TH.ink }}>{c.name}</span>
                      <span className="sc-badge" style={{ background: tone.bg, color: tone.fg }}>{campaignLabel(c.status)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: TH.muted }}>
                      {SEGMENTS[c.target_segment] || c.target_segment} · {fmtDate(c.created_at)}
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', minWidth: 70 }}>
                    <div className="sc-num" style={{ fontSize: 15, fontWeight: 700, color: TH.ink }}>{c.sent_count || 0}</div>
                    <div style={{ fontSize: 9.5, color: TH.muted, textTransform: 'uppercase', letterSpacing: .8 }}>{t('envoyes')}</div>
                  </div>

                  <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: TH.muted, marginBottom: 3 }}>
                      <span>{t('ouvertures')}</span><span className="sc-num">{fmtPct(openRate)}</span>
                    </div>
                    <Gauge value={openRate} max={100} color="var(--accent)" />
                  </div>

                  <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: TH.muted, marginBottom: 3 }}>
                      <span>{t('clics')}</span><span className="sc-num">{fmtPct(clickRate)}</span>
                    </div>
                    {/* Échelle ×2 : les taux de clic sont bas, sinon la barre est illisible */}
                    <Gauge value={clickRate * 2} max={100} color={TH.blue} />
                  </div>

                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <div className="sc-num" style={{ fontSize: 14, fontWeight: 700, color: TH.green }}>{fmt(c.revenue_generated || 0)}</div>
                    <div style={{ fontSize: 9.5, color: TH.muted, textTransform: 'uppercase', letterSpacing: .8 }}>CA généré</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ══════════ CODES PROMO ══════════ */}
      {tab === 'promo' && (
        <>
          {/* Opération livraison offerte — panneau conservé */}
          <div style={{
            background: shipPromoLive ? '#ECFDF5' : '#FDFAF5',
            border: `1px solid ${shipPromoLive ? '#6EE7B7' : TH.border}`,
            borderRadius: 10, padding: '15px 16px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: shipPromoLive ? '#065F46' : TH.muted }}>
                  Opération livraison offerte
                </div>
                <div style={{ fontSize: 11.5, color: TH.muted, marginTop: 3 }}>
                  Abaisse le seuil de franco pour tout le monde, sans code à saisir. Hors opération : <strong>{fmt(baseThreshold)}</strong>.
                </div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={ship.ship_promo_active}
                       onChange={e => setShip(s => ({ ...s, ship_promo_active: e.target.checked }))} />
                <span className="toggle-slider" />
              </label>
            </div>

            {/* Les champs restaient caches tant que l'interrupteur etait
                eteint : le bloc paraissait mort, et on ne pouvait pas
                preparer une operation a l'avance. Ils sont desormais
                toujours la, simplement desactives. */}
            <fieldset disabled={!ship.ship_promo_active}
                      style={{ border: 'none', margin: 0, padding: 0,
                               opacity: ship.ship_promo_active ? 1 : 0.5 }}>
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginTop: 14 }}>
                  <div>
                    <label className="sc-label">{t('seuilFr')}</label>
                    <input className="sc-input sc-num" type="number" min="0" step="0.01" placeholder="25"
                           value={ship.ship_promo_threshold}
                           onChange={e => setShip(s => ({ ...s, ship_promo_threshold: e.target.value }))} />
                  </div>
                  <div>
                    <label className="sc-label">{t('seuilIntl')}</label>
                    <input className="sc-input sc-num" type="number" min="0" step="0.01" placeholder="vide = inchangé"
                           value={ship.ship_promo_threshold_intl}
                           onChange={e => setShip(s => ({ ...s, ship_promo_threshold_intl: e.target.value }))} />
                  </div>
                  <div>
                    <label className="sc-label">{t('du')}</label>
                    <input className="sc-input" type="date" value={ship.ship_promo_from}
                           onChange={e => setShip(s => ({ ...s, ship_promo_from: e.target.value }))} />
                  </div>
                  <div>
                    <label className="sc-label">{t('au')}</label>
                    <input className="sc-input" type="date" value={ship.ship_promo_until}
                           onChange={e => setShip(s => ({ ...s, ship_promo_until: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginTop: 10 }}>
                  <div>
                    <label className="sc-label">{t('messageBandeau')}</label>
                    <input className="sc-input" placeholder={t('phBandeau')}
                           value={ship.ship_promo_label_fr}
                           onChange={e => setShip(s => ({ ...s, ship_promo_label_fr: e.target.value }))} />
                  </div>
                  <div>
                    <label className="sc-label">SV</label>
                    <input className="sc-input" value={ship.ship_promo_label_sv}
                           onChange={e => setShip(s => ({ ...s, ship_promo_label_sv: e.target.value }))} />
                  </div>
                  <div>
                    <label className="sc-label">EN</label>
                    <input className="sc-input" value={ship.ship_promo_label_en}
                           onChange={e => setShip(s => ({ ...s, ship_promo_label_en: e.target.value }))} />
                  </div>
                </div>
                {!shipFrOk && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#B91C1C', fontWeight: 600 }}>
                    Seuil France vide : l’opération ne changera rien pour tes clients français, le seuil de {fmt(baseThreshold)} restera appliqué.
                  </div>
                )}
                {Number(ship.ship_promo_threshold) >= baseThreshold && ship.ship_promo_threshold !== '' && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#B45309', fontWeight: 600 }}>
                    Ce seuil ({fmt(Number(ship.ship_promo_threshold))}) n’est pas plus avantageux que le seuil habituel ({fmt(baseThreshold)}).
                  </div>
                )}
              </>
            </fieldset>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: shipPromoLive && shipFrOk ? '#065F46' : shipPromoLive ? '#B45309' : TH.muted }}>
                {!ship.ship_promo_active
                  ? 'Inactive — seuil habituel appliqué'
                  : !shipPromoLive
                    ? "Activée mais hors période — le seuil habituel s'applique aujourd'hui"
                    : shipFrOk
                      ? `En cours : livraison offerte dès ${fmt(Number(ship.ship_promo_threshold))} en France`
                      : `En cours mais sans effet en France — seuil habituel ${fmt(baseThreshold)} maintenu`}
              </div>
              <button className="sc-btn sc-btn-green" onClick={saveShipPromo} disabled={savingShip}>
                <span className="ms">save</span>{savingShip ? '…' : 'Enregistrer l’opération'}
              </button>
            </div>
          </div>

          {loading && <div className="sc-empty">{tc('loading')}</div>}
          {!loading && codes.length === 0 && <div className="sc-empty">{t('aucunCode')}</div>}

          {!loading && codes.length > 0 && (
            <div className="sc-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="sc-table" style={{ minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 130 }}>Code</th>
                      <th style={{ width: 120 }}>{t('remise')}</th>
                      <th style={{ width: 130 }}>{t('condition')}</th>
                      <th style={{ width: 150 }}>{t('utilisations')}</th>
                      <th style={{ width: 170 }}>{t('validite')}</th>
                      <th style={{ width: 90 }}>{tc('status')}</th>
                      <th style={{ width: 70 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map(c => {
                      const used = c.used_count || 0;
                      const quota = c.max_uses || 0;
                      const full = quota > 0 && used >= quota;
                      return (
                        <tr key={c.id}>
                          <td>
                            <span className="sc-num" style={{ background: '#F1EDE7', borderRadius: 6, padding: '3px 8px', fontSize: 11.5, fontWeight: 600, color: TH.ink }}>
                              {c.code}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, color: '#9E5A3C' }}>
                            {c.type === 'percent' ? `−${c.value} %`
                              : c.type === 'fixed' ? `−${fmt(c.value)}`
                              : c.type === 'gift' ? `${(c.gift_product_ids || []).length} cadeau(x)`
                              : 'Livraison offerte'}
                          </td>
                          <td style={{ color: TH.text2b }}>
                            {c.min_order ? `dès ${fmt(c.min_order)}` : '—'}
                            {c.single_use_per_customer ? ' · 1×/client' : ''}
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="sc-num" style={{ fontSize: 11.5, minWidth: 52, color: full ? TH.red : TH.text2b }}>
                                {used}{quota ? ` / ${quota}` : ''}
                              </span>
                              {quota > 0 && (
                                <div style={{ flex: 1 }}>
                                  <Gauge value={used} max={quota} color={full ? TH.red : 'var(--accent)'} />
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ fontSize: 11.5, color: TH.muted }}>
                            {fmtDate(c.valid_from)} → {fmtDate(c.valid_until)}
                          </td>
                          <td>
                            <button className="sc-switch" role="switch" aria-checked={c.is_active}
                                    onClick={() => toggleCode(c)} aria-label={`Activer ${c.code}`} />
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 2 }}>
                              <button className="sc-iconbtn" onClick={() => openEditCode(c)} aria-label={tc('edit')}><span className="ms">edit</span></button>
                              <button className="sc-iconbtn" onClick={() => deleteCode(c)} aria-label={tc('delete')}><span className="ms">delete</span></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════ ABANDON PANIER ══════════ */}
      {tab === 'cart' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))', gap: 10, marginBottom: 12 }}>
            {[
              { l: 'Paniers abandonnés', v: String(carts.length) },
              { l: 'Récupérés', v: String(recoveredCarts) },
              { l: 'Valeur récupérée', v: fmt(recoveredValue) },
              { l: 'Taux', v: carts.length ? fmtPct((recoveredCarts / carts.length) * 100) : '—' },
            ].map(k => (
              <div key={k.l} className="sc-card" style={{ padding: '13px 15px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: TH.muted }}>{k.l}</div>
                <div className="sc-num" style={{ fontSize: 23, fontWeight: 700, marginTop: 5, color: TH.ink }}>{k.v}</div>
              </div>
            ))}
          </div>

          {loading && <div className="sc-empty">{tc('loading')}</div>}
          {!loading && carts.length === 0 && <div className="sc-empty">{t('aucunPanier')}</div>}

          {!loading && carts.length > 0 && (
            <div className="sc-card" style={{ overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="sc-table" style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th>{tc('client')}</th>
                      <th className="sc-right" style={{ width: 100 }}>{t('panier')}</th>
                      <th style={{ width: 120 }}>{t('abandonneLe')}</th>
                      <th style={{ width: 130 }}>{t('relances')}</th>
                      <th style={{ width: 110 }}>{tc('status')}</th>
                      <th style={{ width: 160 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {carts.map(c => (
                      <tr key={c.id}>
                        <td>
                          <div style={{ fontSize: 12.5, color: TH.ink }}>{c.customer_name || '—'}</div>
                          <div style={{ fontSize: 10.5, color: TH.muted, wordBreak: 'break-all' }}>{c.customer_email}</div>
                        </td>
                        <td className="sc-num sc-right" style={{ fontWeight: 600 }}>{fmt(c.cart_total)}</td>
                        <td style={{ fontSize: 11.5, color: TH.muted }}>{fmtDate(c.created_at)}</td>
                        <td style={{ fontSize: 11.5, color: TH.muted }}>
                          {c.email_1_sent_at ? '1' : '—'}{c.email_2_sent_at ? ' · 2' : ''}
                        </td>
                        <td>
                          <span className="sc-badge" style={{
                            background: c.recovered ? BADGE.green.bg : BADGE.gray.bg,
                            color: c.recovered ? BADGE.green.fg : BADGE.gray.fg,
                          }}>{c.recovered ? 'Récupéré' : 'En attente'}</span>
                        </td>
                        <td>
                          {!c.recovered && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              {!c.email_1_sent_at && (
                                <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 9px', fontSize: 11 }}
                                        onClick={() => sendRelance(c.id, 1)}>{t('relance1')}</button>
                              )}
                              {c.email_1_sent_at && !c.email_2_sent_at && (
                                <button className="sc-btn sc-btn-secondary" style={{ padding: '5px 9px', fontSize: 11 }}
                                        onClick={() => sendRelance(c.id, 2)}>{t('relance2')}</button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

        {showModal && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
            <div className="modal">
              <div className="modal-header"><span className="modal-title">{t('nouvelleCampagne')}</span><button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>✕</button></div>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">{t('nomReq')}</label><input className="form-control" value={campForm.name} onChange={e => setCampForm(f => ({ ...f, name: e.target.value }))} placeholder={t('phCampagne')} /></div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-control" value={campForm.type} onChange={e => setCampForm(f => ({ ...f, type: e.target.value }))}>
                      {Object.entries(CAMP_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('segment')}</label>
                    <select className="form-control" value={campForm.target_segment} onChange={e => setCampForm(f => ({ ...f, target_segment: e.target.value }))}>
                      {Object.entries(SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>
                {campForm.type === 'email' && <>
                  <div className="form-group"><label className="form-label">{t('objetEmail')}</label><input className="form-control" value={campForm.subject} onChange={e => setCampForm(f => ({ ...f, subject: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">{t('contenuHtml')}</label><textarea className="form-control" value={campForm.content} onChange={e => setCampForm(f => ({ ...f, content: e.target.value }))} placeholder="<h1>{t('bonjour')}</h1>..." /></div>
                </>}
                {['meta_ads', 'google_ads', 'social_ads'].includes(campForm.type) && (
                  <div className="form-group"><label className="form-label">{t('budget')}</label><input type="number" className="form-control" value={campForm.budget} onChange={e => setCampForm(f => ({ ...f, budget: e.target.value }))} placeholder="500" /></div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>{tc('cancel')}</button>
                <button className="btn btn-primary" onClick={saveCampaign}>💾 Créer</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal code promo */}
        {showCodeModal && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowCodeModal(false); setEditingCode(null); } }}>
            <div className="modal">
              <div className="modal-header"><span className="modal-title">{editingCode ? `Modifier "${editingCode.code}"` : 'Nouveau code promo'}</span><button className="btn btn-secondary btn-sm" onClick={() => { setShowCodeModal(false); setEditingCode(null); }}>✕</button></div>
              <div className="modal-body">
                <div className="grid-2">
                  {codeForm.type !== 'gift' && (
                  <div className="form-group"><label className="form-label">{t('codeReq')}</label><input className="form-control mono" value={codeForm.code} style={{ textTransform: 'uppercase' }} onChange={e => setCodeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder={t('phCode')} /></div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select className="form-control" value={codeForm.type} onChange={e => setCodeForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="percent">{t('pourcentage')}</option>
                      <option value="fixed">{t('montantFixe')}</option>
                      <option value="free_shipping">{t('livraisonOfferte')}</option>
                      <option value="gift">🎁 Cadeau offert</option>
                    </select>
                  </div>
                  {codeForm.type !== 'gift' && (
                  <div className="form-group"><label className="form-label">{t('valeurReq')}</label><input type="number" className="form-control mono" value={codeForm.value} onChange={e => setCodeForm(f => ({ ...f, value: e.target.value }))} placeholder={codeForm.type === 'percent' ? '10' : '5'} /></div>
                  )}
                  <div className="form-group"><label className="form-label">{codeForm.type === 'gift' ? 'Cadeau offert dès (€) *' : 'Commande minimum (€)'}</label><input type="number" className="form-control mono" value={codeForm.min_order} onChange={e => setCodeForm(f => ({ ...f, min_order: e.target.value }))} placeholder={codeForm.type === 'gift' ? '10' : ''} /></div>
                  <div className="form-group"><label className="form-label">{t('maxUtil')}</label><input type="number" className="form-control mono" value={codeForm.max_uses} onChange={e => setCodeForm(f => ({ ...f, max_uses: e.target.value }))} placeholder={t('phIllimite')} /></div>
                  <div className="form-group"><label className="form-label">{t('valideDu')}</label><input type="date" className="form-control" value={codeForm.valid_from} onChange={e => setCodeForm(f => ({ ...f, valid_from: e.target.value }))} /></div>
                  <div className="form-group"><label className="form-label">{t('valideAu')}</label><input type="date" className="form-control" value={codeForm.valid_until} onChange={e => setCodeForm(f => ({ ...f, valid_until: e.target.value }))} /></div>
                </div>
                {codeForm.type === 'gift' && (
                  <div className="form-group" style={{ background: '#FBF9F6', border: '1px solid #E8E0D0', borderRadius: 8, padding: '12px 14px' }}>
                    <label className="form-label">{t('declencheur')}</label>
                    <div style={{ fontSize: 11.5, color: '#6A7280', marginBottom: 10 }}>{t('declencheurAide')}</div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <div style={{ width: 110 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>{t('qteDeclencheur')}</label>
                        <input type="number" min={1} className="form-control" placeholder="2"
                               value={codeForm.gift_trigger_qty}
                               onChange={e => setCodeForm(f => ({ ...f, gift_trigger_qty: e.target.value }))} />
                      </div>
                      <div style={{ width: 130 }}>
                        <label className="form-label" style={{ fontSize: 11 }}>{t('maxCadeaux')}</label>
                        <input type="number" min={1} className="form-control" placeholder={t('illimite')}
                               value={codeForm.gift_max}
                               onChange={e => setCodeForm(f => ({ ...f, gift_max: e.target.value }))} />
                      </div>
                    </div>

                    <label className="form-label" style={{ marginTop: 12 }}>{t('produitsDeclencheurs')}</label>
                    <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #E8E0D0', borderRadius: 6, padding: '8px 10px', background: '#fff' }}>
                      {products.map(p => {
                        const on = codeForm.gift_trigger_product_ids.includes(p.id);
                        return (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13, cursor: 'pointer' }}>
                            <input type="checkbox" checked={on} onChange={() => setCodeForm(f => ({
                              ...f,
                              gift_trigger_product_ids: on
                                ? f.gift_trigger_product_ids.filter(x => x !== p.id)
                                : [...f.gift_trigger_product_ids, p.id],
                            }))} />
                            {p.name_fr}
                          </label>
                        );
                      })}
                    </div>

                    {/* La phrase exacte que le client lira, ecrite depuis les
                        valeurs saisies : on voit l'offre avant de la publier. */}
                    <div style={{ marginTop: 10, padding: '9px 12px', background: '#EDF1EA', borderRadius: 6, fontSize: 12.5, color: '#3E5238' }}>
                      {codeForm.gift_trigger_qty && codeForm.gift_trigger_product_ids.length
                        ? `${codeForm.gift_trigger_qty} × ${products.filter(p => codeForm.gift_trigger_product_ids.includes(p.id)).map(p => p.name_fr).join(' ou ')} achetés → 1 cadeau au choix`
                        : codeForm.gift_trigger_product_ids.length || codeForm.gift_trigger_qty
                          ? `⚠️ ${t('offreIncomplete')}`
                          : Number(codeForm.min_order) > 0
                            ? `${t('sinonSeuil')} ${codeForm.min_order} €`
                            : `⚠️ ${t('seuilZero')}`}
                    </div>
                  </div>
                )}

                {codeForm.type === 'gift' && (
                  <div className="form-group">
                    <label className="form-label">{t('cadeauxEligibles')} * <span style={{ fontWeight: 400, color: '#6A7280' }}>(le client en choisit un dans le panier)</span></label>
                    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #E8E0D0', borderRadius: 6, padding: '8px 10px' }}>
                      {products.length === 0
                        ? <div style={{ fontSize: 12, color: '#6A7280' }}>{t('chargementProduits')}</div>
                        : products.map(p => {
                            const on = codeForm.gift_product_ids.includes(p.id);
                            return (
                              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13, cursor: 'pointer' }}>
                                <input type="checkbox" checked={on} onChange={() => setCodeForm(f => ({ ...f, gift_product_ids: on ? f.gift_product_ids.filter(x => x !== p.id) : [...f.gift_product_ids, p.id] }))} />
                                {p.name_fr}
                              </label>
                            );
                          })}
                    </div>
                    <div style={{ fontSize: 11, color: '#6A7280', marginTop: 4 }}>{codeForm.gift_product_ids.length} sélectionné(s). Le cadeau s'ajoute automatiquement à 0 € dès le montant atteint ; si plusieurs, le client choisit.</div>
                  </div>
                )}
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <label className="toggle">
                    <input type="checkbox" checked={codeForm.single_use_per_customer} onChange={e => setCodeForm(f => ({ ...f, single_use_per_customer: e.target.checked }))} />
                    <span className="toggle-slider" />
                  </label>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>🔒 Usage unique par client</div>
                    <div style={{ fontSize: 11, color: '#6A7280' }}>{t('uneSeuleFois')}</div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setShowCodeModal(false); setEditingCode(null); }}>{tc('cancel')}</button>
                <button className="btn btn-primary" onClick={saveCode}>{editingCode ? '💾 Mettre à jour' : '💾 Créer le code'}</button>
              </div>
            </div>
          </div>
        )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: TH.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 300 }}>
          {toast}
        </div>
      )}
    </>
  );
}
export default function MarketingPage() {
  return <Suspense><MarketingInner /></Suspense>; }
