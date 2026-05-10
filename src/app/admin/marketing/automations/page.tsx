'use client';
import { useEffect, useState } from 'react';

type Automation = {
  id: string; name: string; type: string; status: string;
  delay_hours: number; subject?: string; custom_html?: string; sent_count: number;
};

const AUTOMATION_PRESETS = [
  {
    type: 'welcome',
    icon: '👋',
    name: 'Email de bienvenue',
    desc: 'Envoyé automatiquement après la première commande d\'un nouveau client.',
    delayLabel: 'Délai après 1ère commande',
    defaultDelay: 24,
    defaultSubject: 'Bienvenue ! Merci pour votre première commande 🎉',
    color: '#0ea5e9',
    bg: '#f0f9ff',
  },
  {
    type: 'win_back',
    icon: '💌',
    name: 'Réactivation clients',
    desc: 'Relance automatique les clients inactifs depuis longtemps.',
    delayLabel: 'Inactif depuis (jours)',
    defaultDelay: 2160,
    defaultSubject: 'On vous manque… Revenez nous voir ! 💌',
    color: '#8b5cf6',
    bg: '#f5f3ff',
  },
  {
    type: 'post_purchase',
    icon: '⭐',
    name: 'Demande d\'avis',
    desc: 'Demande un avis au client après la livraison de sa commande.',
    delayLabel: 'Délai après livraison',
    defaultDelay: 168,
    defaultSubject: 'Comment s\'est passée votre commande ? ⭐',
    color: '#f59e0b',
    bg: '#fffbeb',
  },
];

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Automation>>({});
  const [lastRun, setLastRun] = useState('');
  const [running, setRunning] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/marketing/automations');
    const d = await res.json();
    setAutomations(d.automations || []);
    setLoading(false);
  }

  async function toggle(auto: Automation) {
    const newStatus = auto.status === 'active' ? 'paused' : 'active';
    await fetch('/api/marketing/automations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: auto.id, status: newStatus }),
    });
    setAutomations(prev => prev.map(a => a.id === auto.id ? { ...a, status: newStatus } : a));
    showToast(newStatus === 'active' ? '▶️ Automation activée' : '⏸️ Automation mise en pause');
  }

  async function activate(preset: typeof AUTOMATION_PRESETS[0]) {
    const existing = automations.find(a => a.type === preset.type);
    if (existing) { showToast('⚠️ Cette automation existe déjà'); return; }
    const res = await fetch('/api/marketing/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: preset.name,
        type: preset.type,
        delay_hours: preset.defaultDelay,
        subject: preset.defaultSubject,
        status: 'active',
      }),
    });
    if (res.ok) { await load(); showToast('✅ Automation créée et activée !'); }
  }

  async function saveEdit() {
    if (!editId) return;
    await fetch('/api/marketing/automations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, ...editData }),
    });
    setEditId(null);
    await load();
    showToast('✅ Automation mise à jour');
  }

  async function deleteAuto(id: string) {
    if (!confirm('Supprimer cette automation ?')) return;
    await fetch(`/api/marketing/automations?id=${id}`, { method: 'DELETE' });
    await load();
    showToast('🗑️ Automation supprimée');
  }

  async function runNow() {
    setRunning(true);
    const res = await fetch('/api/cron/marketing');
    const d = await res.json();
    setRunning(false);
    setLastRun(`${d.sent || 0} email(s) envoyé(s) • ${new Date().toLocaleTimeString('fr-FR')}`);
    showToast(`✅ Cron exécuté : ${d.sent || 0} email(s) envoyé(s)`);
  }

  const getAutoForType = (type: string) => automations.find(a => a.type === type);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: '#1e293b', color: '#fff', padding: '12px 20px', borderRadius: 8, fontSize: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: 0 }}>🤖 Automations Email</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>Les emails partent automatiquement toutes les heures selon les règles configurées.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {lastRun && <span style={{ fontSize: 12, color: '#64748b' }}>Dernier run : {lastRun}</span>}
          <button
            onClick={runNow}
            disabled={running}
            style={{ padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: running ? '#94a3b8' : '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600 }}
          >
            {running ? '⏳ En cours…' : '▶️ Lancer maintenant'}
          </button>
        </div>
      </div>

      {/* ABANDONED CART — toujours actif */}
      <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 12, padding: 20, marginBottom: 16, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 36 }}>🛒</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <strong style={{ fontSize: 16, color: '#166534' }}>Panier abandonné</strong>
            <span style={{ background: '#16a34a', color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>TOUJOURS ACTIF</span>
          </div>
          <p style={{ fontSize: 13, color: '#15803d', margin: '0 0 8px' }}>Séquence de 3 emails automatiques pour récupérer les paniers abandonnés.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { step: 'J+1', label: '20h après — Rappel doux' },
              { step: 'J+3', label: '60h après — Relance' },
              { step: 'J+7', label: '144h après — Code promo RETOUR10 (-10%)' },
            ].map(s => (
              <div key={s.step} style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '6px 12px', fontSize: 12 }}>
                <strong>{s.step}</strong> — {s.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PRESET CARDS */}
      {AUTOMATION_PRESETS.map(preset => {
        const existing = getAutoForType(preset.type);
        return (
          <div key={preset.type} style={{
            background: existing ? preset.bg : '#fff',
            border: `2px solid ${existing?.status === 'active' ? preset.color : '#e2e8f0'}`,
            borderRadius: 12, padding: 20, marginBottom: 16,
            display: 'flex', gap: 16, alignItems: 'flex-start',
          }}>
            <div style={{ fontSize: 36 }}>{preset.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <strong style={{ fontSize: 16, color: '#1e293b' }}>{preset.name}</strong>
                {existing && (
                  <span style={{
                    background: existing.status === 'active' ? preset.color : '#94a3b8',
                    color: '#fff', fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                  }}>
                    {existing.status === 'active' ? '▶ ACTIF' : '⏸ EN PAUSE'}
                  </span>
                )}
                {existing && <span style={{ fontSize: 12, color: '#64748b' }}>{existing.sent_count} envoyé(s)</span>}
              </div>
              <p style={{ fontSize: 13, color: '#475569', margin: '0 0 10px' }}>{preset.desc}</p>

              {existing && (
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                  <strong>{preset.delayLabel} :</strong> {preset.type === 'win_back' ? `${Math.round(existing.delay_hours / 24)} jours` : `${existing.delay_hours}h`}
                  {existing.subject && <> · <strong>Objet :</strong> {existing.subject}</>}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                {!existing ? (
                  <button
                    onClick={() => activate(preset)}
                    style={{ padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', background: preset.color, color: '#fff', fontSize: 12, fontWeight: 700 }}
                  >
                    ➕ Activer
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => toggle(existing)}
                      style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid ${preset.color}`, cursor: 'pointer', background: 'transparent', color: preset.color, fontSize: 12, fontWeight: 600 }}
                    >
                      {existing.status === 'active' ? '⏸ Mettre en pause' : '▶ Réactiver'}
                    </button>
                    <button
                      onClick={() => { setEditId(existing.id); setEditData({ subject: existing.subject, delay_hours: existing.delay_hours, custom_html: existing.custom_html }); }}
                      style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #d1d5db', cursor: 'pointer', background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600 }}
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={() => deleteAuto(existing.id)}
                      style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #fca5a5', cursor: 'pointer', background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600 }}
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* MODAL ÉDITION */}
      {editId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 540, maxWidth: '90vw' }}>
            <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700 }}>✏️ Modifier l'automation</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 5 }}>Objet de l'email</label>
              <input
                value={editData.subject || ''}
                onChange={e => setEditData(p => ({ ...p, subject: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 5 }}>Délai (heures)</label>
              <input
                type="number"
                value={editData.delay_hours || 24}
                onChange={e => setEditData(p => ({ ...p, delay_hours: parseInt(e.target.value) || 24 }))}
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 14 }}
              />
              <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>win_back : entrez des heures (ex: 2160 = 90 jours)</p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 5 }}>
                Template HTML personnalisé <span style={{ fontWeight: 400 }}>(optionnel — laissez vide pour le modèle par défaut)</span>
              </label>
              <textarea
                value={editData.custom_html || ''}
                onChange={e => setEditData(p => ({ ...p, custom_html: e.target.value }))}
                rows={4}
                placeholder="<h1>Titre</h1><p>Contenu HTML…</p>"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'monospace' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditId(null)} style={{ padding: '9px 18px', borderRadius: 7, border: '1px solid #d1d5db', cursor: 'pointer', background: '#fff', fontSize: 13 }}>Annuler</button>
              <button onClick={saveEdit} style={{ padding: '9px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 600 }}>💾 Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {/* INFO CRON */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginTop: 24, fontSize: 13, color: '#475569' }}>
        <strong>ℹ️ Comment ça marche ?</strong><br />
        Le cron job s'exécute <strong>toutes les heures</strong> automatiquement via Vercel. Il vérifie les paniers abandonnés, les nouvelles commandes et les clients inactifs, puis envoie les emails appropriés.
        Vous pouvez aussi cliquer sur <strong>"Lancer maintenant"</strong> pour tester immédiatement.
      </div>
    </div>
  );
}
