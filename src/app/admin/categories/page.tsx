'use client';
import { useEffect, useState } from 'react';

type Category = { id:string; slug:string; emoji:string; name_sv:string; name_fr:string; name_en:string; sort_order:number; is_active:boolean; };
const EMOJIS = ['🌶️','🍟','🍬','🥐','🎄','🫖','🫐','🌾','🍯','🌻','📦','🧂','🫙','🍫','🥜','🌰','🍵','🧁'];

export default function CategoriesPage() {
  const [cats, setCats]         = useState<Category[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState('');
  const [form, setForm]         = useState({ slug:'', emoji:'📦', name_fr:'', name_sv:'', name_en:'' });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/categories');
    const data = await res.json();
    setCats(data.categories || []);
    setLoading(false);
  }
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2800); }
  function setF(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }
  function handleNameFr(v: string) {
    setForm(f => ({ ...f, name_fr: v, slug: v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }));
  }
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem('sd_admin_token');
    const res = await fetch('/api/categories', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body: JSON.stringify({ ...form, name_sv: form.name_sv||form.name_fr, name_en: form.name_en||form.name_fr }) });
    if (res.ok) { showToast('✅ Catégorie créée !'); setForm({ slug:'', emoji:'📦', name_fr:'', name_sv:'', name_en:'' }); setShowForm(false); load(); }
    else { const d = await res.json(); showToast('❌ ' + (d.error||'Erreur')); }
    setSaving(false);
  }

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Catégories <span style={{fontWeight:400,color:'var(--dust)',fontSize:14}}>({cats.length})</span></div>
        <div className="topbar-actions"><button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>{showForm ? '✕ Annuler' : '+ Nouvelle catégorie'}</button></div>
      </div>
      <div className="page-content">
        {showForm && (
          <div className="card" style={{marginBottom:28,border:'2px solid var(--moss)'}}>
            <div className="card-header" style={{background:'var(--moss-pale)'}}><span className="card-title">Nouvelle catégorie</span></div>
            <div className="card-body">
              <form onSubmit={handleCreate}>
                <div className="form-group">
                  <label className="form-label">Emoji</label>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                    {EMOJIS.map(e => <button key={e} type="button" onClick={() => setF('emoji',e)} style={{padding:'6px 10px',fontSize:20,borderRadius:6,border:'2px solid',borderColor:form.emoji===e?'var(--moss)':'var(--linen)',background:form.emoji===e?'var(--moss-pale)':'white',cursor:'pointer'}}>{e}</button>)}
                  </div>
                  <input className="form-control" value={form.emoji} onChange={e => setF('emoji',e.target.value)} style={{maxWidth:200}} placeholder="Emoji custom" />
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                  <div className="form-group"><label className="form-label">Nom FR <span className="req">*</span></label><input className="form-control" required value={form.name_fr} onChange={e => handleNameFr(e.target.value)} placeholder="Épices & Aromates" /></div>
                  <div className="form-group"><label className="form-label">Slug (auto)</label><input className="form-control" value={form.slug} onChange={e => setF('slug',e.target.value)} /><p className="form-hint">Identifiant unique URL</p></div>
                  <div className="form-group"><label className="form-label">Nom SV</label><input className="form-control" value={form.name_sv} onChange={e => setF('name_sv',e.target.value)} /></div>
                  <div className="form-group" style={{marginBottom:0}}><label className="form-label">Nom EN</label><input className="form-control" value={form.name_en} onChange={e => setF('name_en',e.target.value)} /></div>
                </div>
                <div style={{marginTop:20}}><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '⏳ Création…' : '💾 Créer'}</button></div>
              </form>
            </div>
          </div>
        )}
        {loading ? <div style={{textAlign:'center',padding:60,color:'var(--dust)'}}>Chargement…</div> : (
          <div className="card">
            <div style={{overflowX:'auto'}}>
              <table className="data-table">
                <thead><tr><th>Emoji</th><th>Slug</th><th>FR</th><th>SV</th><th>EN</th><th>Ordre</th><th>Statut</th></tr></thead>
                <tbody>
                  {cats.map(c => (
                    <tr key={c.id}>
                      <td style={{fontSize:24,textAlign:'center'}}>{c.emoji}</td>
                      <td><code style={{fontSize:11,background:'var(--cream)',padding:'2px 6px',borderRadius:3}}>{c.slug}</code></td>
                      <td><strong>{c.name_fr}</strong></td>
                      <td style={{color:'var(--dust)'}}>{c.name_sv}</td>
                      <td style={{color:'var(--dust)'}}>{c.name_en}</td>
                      <td style={{color:'var(--dust)'}}>{c.sort_order}</td>
                      <td><span className={`badge ${c.is_active ? 'badge-active' : 'badge-inactive'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="card" style={{marginTop:24,background:'var(--cream)'}}><div className="card-body"><p style={{fontSize:13,color:'var(--dust)'}}>💡 <strong>Les slugs</strong> sont utilisés dans les URLs du front (<code>boutique.html?cat=epices</code>). Ne pas modifier sans mettre à jour le front simultanément.</p></div></div>
      </div>
      {toast && <div className="toast-container"><div className={`toast ${toast.startsWith('✅')?'success':toast.startsWith('❌')?'error':''}`}>{toast}</div></div>}
    </>
  );
}
