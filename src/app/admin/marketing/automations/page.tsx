'use client';
import { useEffect, useState } from 'react';
import { adminFetch } from '@/lib/auth-client';
import { T, BADGE } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   ÉCRAN 13 — AUTOMATIONS
   Handoff §13 : cartes avec icône dans un carré accent 36 px, nom +
   statistiques, mini-flux « déclencheur → délai → action » (trois
   pastilles séparées par des flèches), interrupteur d'activation.
   ═══════════════════════════════════════════════════════════════ */

type Automation = {
  id: string; name: string; type: string; status: string;
  delay_hours: number; subject?: string; custom_html?: string; sent_count: number;
};

type Preset = {
  type: string; icon: string; name: string; desc: string;
  delayLabel: string; defaultDelay: number; defaultSubject: string;
  trigger: string; action: string;
};

const PRESETS: Preset[] = [
  {
    type: 'welcome', icon: 'waving_hand', name: 'Email de bienvenue',
    desc: 'Envoyé après la première commande d’un nouveau client.',
    delayLabel: 'Délai après 1ʳᵉ commande', defaultDelay: 24,
    defaultSubject: 'Bienvenue ! Merci pour votre première commande',
    trigger: '1ʳᵉ commande', action: 'Email de bienvenue',
  },
  {
    type: 'win_back', icon: 'mail', name: 'Réactivation clients',
    desc: 'Relance les clients inactifs depuis longtemps.',
    delayLabel: 'Inactif depuis (heures)', defaultDelay: 2160,
    defaultSubject: 'On vous manque… Revenez nous voir !',
    trigger: 'Client inactif', action: 'Email de relance',
  },
  {
    type: 'post_purchase', icon: 'reviews', name: 'Demande d’avis',
    desc: 'Demande un avis après la livraison de la commande.',
    delayLabel: 'Délai après livraison', defaultDelay: 168,
    defaultSubject: 'Comment s’est passée votre commande ?',
    trigger: 'Commande livrée', action: 'Demande d’avis',
  },
];

const fmtDelay = (h: number) => {
  if (!h) return 'immédiat';
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d >= 30 ? `${Math.round(d / 30)} mois` : `${d} j`;
};

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span style={{ background: '#F7F4EF', borderRadius: 6, padding: '4px 9px', fontSize: 11, color: T.text2b, whiteSpace: 'nowrap' }}>
    {children}
  </span>
);

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Automation>>({});
  const [lastRun, setLastRun] = useState('');
  const [running, setRunning] = useState(false);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500); };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await adminFetch('/api/marketing/automations').then(r => r.json());
      setAutomations(d.automations || []);
    } finally { setLoading(false); }
  }

  async function toggle(a: Automation) {
    const status = a.status === 'active' ? 'paused' : 'active';
    setAutomations(prev => prev.map(x => x.id === a.id ? { ...x, status } : x));
    const res = await adminFetch('/api/marketing/automations', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, status }),
    });
    if (!res.ok) { say('Changement impossible'); load(); return; }
    say(status === 'active' ? 'Automation activée' : 'Automation en pause');
  }

  async function activate(p: Preset) {
    if (automations.find(a => a.type === p.type)) { say('Cette automation existe déjà'); return; }
    const res = await adminFetch('/api/marketing/automations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: p.name, type: p.type, delay_hours: p.defaultDelay,
        subject: p.defaultSubject, status: 'active',
      }),
    });
    if (res.ok) { await load(); say('Automation créée et activée'); }
    else say('Création impossible');
  }

  async function saveEdit() {
    if (!editId) return;
    await adminFetch('/api/marketing/automations', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, ...editData }),
    });
    setEditId(null);
    await load();
    say('Automation mise à jour');
  }

  async function remove(id: string) {
    if (!window.confirm('Supprimer cette automation ?')) return;
    await adminFetch(`/api/marketing/automations?id=${id}`, { method: 'DELETE' });
    await load();
    say('Automation supprimée');
  }

  async function runNow() {
    setRunning(true);
    try {
      const d = await adminFetch('/api/cron/marketing').then(r => r.json());
      setLastRun(`${d.sent || 0} email(s) · ${new Date().toLocaleTimeString('fr-FR')}`);
      say(`Cron exécuté : ${d.sent || 0} email(s) envoyé(s)`);
    } finally { setRunning(false); }
  }

  const presetOf = (type: string) => PRESETS.find(p => p.type === type);
  const inactive = PRESETS.filter(p => !automations.find(a => a.type === p.type));

  return (
    <>
      <div className="sc-head">
        <div>
          <div className="sc-title">Automations</div>
          <div className="sc-sub">
            {automations.filter(a => a.status === 'active').length} séquence(s) active(s)
            {lastRun ? ` · dernier envoi : ${lastRun}` : ''}
          </div>
        </div>
        <div className="sc-actions">
          <button className="sc-btn sc-btn-secondary" onClick={runNow} disabled={running}>
            <span className="ms">bolt</span>{running ? 'Exécution…' : 'Exécuter maintenant'}
          </button>
        </div>
      </div>

      {loading && <div className="sc-empty">Chargement…</div>}

      {!loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {automations.map(a => {
            const p = presetOf(a.type);
            const on = a.status === 'active';
            const isEditing = editId === a.id;
            return (
              <div key={a.id} className="sc-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px', flexWrap: 'wrap' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                    color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="ms" style={{ fontSize: 19 }}>{p?.icon || 'smart_toy'}</span>
                  </div>

                  <div style={{ minWidth: 150, flex: '1 1 160px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>
                      {a.sent_count || 0} envoi{(a.sent_count || 0) > 1 ? 's' : ''} · {p?.desc || ''}
                    </div>
                  </div>

                  {/* Mini-flux déclencheur → délai → action */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Pill>{p?.trigger || 'Déclencheur'}</Pill>
                    <span className="ms" style={{ fontSize: 15, color: T.muted3 }}>arrow_forward</span>
                    <Pill>{fmtDelay(a.delay_hours)}</Pill>
                    <span className="ms" style={{ fontSize: 15, color: T.muted3 }}>arrow_forward</span>
                    <Pill>{p?.action || 'Email'}</Pill>
                  </div>

                  <span style={{ flex: 1 }} />

                  <span className="sc-badge" style={{
                    background: on ? BADGE.green.bg : BADGE.gray.bg,
                    color: on ? BADGE.green.fg : BADGE.gray.fg,
                  }}>{on ? 'Active' : 'En pause'}</span>

                  <button className="sc-switch" role="switch" aria-checked={on}
                          onClick={() => toggle(a)} aria-label={`Activer ${a.name}`} />

                  <button className="sc-iconbtn" onClick={() => { setEditId(isEditing ? null : a.id); setEditData({ delay_hours: a.delay_hours, subject: a.subject }); }}
                          aria-label="Modifier"><span className="ms">{isEditing ? 'expand_less' : 'edit'}</span></button>
                  <button className="sc-iconbtn" onClick={() => remove(a.id)} aria-label="Supprimer">
                    <span className="ms">delete</span>
                  </button>
                </div>

                {isEditing && (
                  <div style={{ padding: '13px 15px', borderTop: `1px solid ${T.borderFaint}`, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
                    <div>
                      <label className="sc-label">{p?.delayLabel || 'Délai (heures)'}</label>
                      <input className="sc-input sc-num" type="number" min="0" value={editData.delay_hours ?? ''}
                             onChange={e => setEditData(d => ({ ...d, delay_hours: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="sc-label">Objet de l’email</label>
                      <input className="sc-input" value={editData.subject ?? ''}
                             onChange={e => setEditData(d => ({ ...d, subject: e.target.value }))} />
                    </div>
                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button className="sc-btn sc-btn-secondary" onClick={() => setEditId(null)}>Annuler</button>
                      <button className="sc-btn sc-btn-green" onClick={saveEdit}><span className="ms">save</span>Enregistrer</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {inactive.length > 0 && (
            <>
              <div className="sc-label" style={{ marginTop: 8 }}>Séquences disponibles</div>
              {inactive.map(p => (
                <div key={p.type} className="sc-card" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px', opacity: .78 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                    background: T.borderFaint2, color: T.muted,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="ms" style={{ fontSize: 19 }}>{p.icon}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{p.desc}</div>
                  </div>
                  <button className="sc-btn sc-btn-secondary" onClick={() => activate(p)}>
                    <span className="ms">add</span>Activer
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: T.ink, color: '#fff', padding: '10px 18px', borderRadius: 7, fontSize: 12.5, zIndex: 200 }}>
          {toast}
        </div>
      )}
    </>
  );
}
