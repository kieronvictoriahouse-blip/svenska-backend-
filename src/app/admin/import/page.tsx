'use client';
import { useState } from 'react';

type Nutrition = { energie:string; graisses:string; dont_satures:string; glucides:string; dont_sucres:string; fibres:string; proteines:string; sel:string; portion:string; };
type Product = {
  name_sv:string; name_fr:string; name_en:string;
  subtitle_sv:string; subtitle_fr:string; subtitle_en:string;
  desc_sv:string; desc_fr:string; desc_en:string;
  ingredients_sv:string; ingredients_fr:string; ingredients_en:string;
  allergens_sv:string; allergens_fr:string; allergens_en:string;
  storage_sv:string; storage_fr:string; storage_en:string;
  usage_sv:string; usage_fr:string; usage_en:string;
  nutrition:Nutrition; weight:string; price:number; brand:string;
  category:string; labels:string[]; origin_sv:string; origin_fr:string; origin_en:string;
  emoji:string; is_new:boolean; is_bestseller:boolean;
  image_urls:string[]; source_url:string;
};
type Category = { id:string; name_fr:string; slug:string };

const LANG_FLAGS: Record<string,string> = { sv:'🇸🇪', fr:'🇫🇷', en:'🇬🇧' };

export default function ImportPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<Product|null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [selectedImg, setSelectedImg] = useState('');
  const [langTab, setLangTab] = useState<'fr'|'sv'|'en'>('fr');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  function showToast(msg:string) { setToast(msg); setTimeout(()=>setToast(''),3500); }
  function field(key:string) { return `${key}_${langTab}` as keyof Product; }
  function setField(key:string, val:string) { if(!product) return; setProduct({...product,[`${key}_${langTab}`]:val}); }

  async function analyse() {
    if(!url.trim()) return;
    setLoading(true); setError(''); setProduct(null);
    try {
      const token = localStorage.getItem('sd_admin_token');
      const res = await fetch('/api/scrape',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify({url:url.trim()}),
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||'Erreur serveur');
      setProduct(data.product);
      setCategories(data.categories||[]);
      setSelectedImg(data.product.image_urls?.[0]||'');
      const match = data.categories?.find((c:Category)=>
        c.name_fr.toLowerCase().includes(data.product.category?.toLowerCase())
      );
      setCategoryId(match?.id||'');
    } catch(e:any){ setError(e.message); }
    finally { setLoading(false); }
  }

  async function addToShop() {
    if(!product) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('sd_admin_token');
      // Build allergens string appended to ingredients
      const buildIngr = (lang:'sv'|'fr'|'en') => {
        const ingr = product[`ingredients_${lang}` as keyof Product] as string || '';
        const alrg = product[`allergens_${lang}` as keyof Product] as string || '';
        return alrg ? `${ingr}\n\n${alrg}` : ingr;
      };
      const body = {
        category_id:    categoryId||null,
        name_sv:        product.name_sv,
        name_fr:        product.name_fr,
        name_en:        product.name_en,
        subtitle_sv:    product.subtitle_sv,
        subtitle_fr:    product.subtitle_fr,
        subtitle_en:    product.subtitle_en,
        desc_sv:        product.desc_sv,
        desc_fr:        product.desc_fr,
        desc_en:        product.desc_en,
        ingredients_sv: buildIngr('sv'),
        ingredients_fr: buildIngr('fr'),
        ingredients_en: buildIngr('en'),
        storage_sv:     product.storage_sv,
        storage_fr:     product.storage_fr,
        storage_en:     product.storage_en,
        usage_sv:       product.usage_sv,
        usage_fr:       product.usage_fr,
        usage_en:       product.usage_en,
        price:          product.price,
        weight:         product.weight||null,
        origin_sv:      product.origin_sv,
        origin_fr:      product.origin_fr,
        origin_en:      product.origin_en,
        image_url:      selectedImg||null,
        is_bestseller:  product.is_bestseller,
        is_new:         product.is_new,
        is_active:      true,
        tags:           product.labels||[],
        rating:         4.5,
        reviews_count:  0,
      };
      const res = await fetch('/api/products',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
        body:JSON.stringify(body),
      });
      if(!res.ok) throw new Error('Erreur lors de la sauvegarde');
      showToast(`✅ "${product.name_fr}" ajouté au catalogue !`);
      setProduct(null); setUrl('');
    } catch(e:any){ setError(e.message); }
    finally { setSaving(false); }
  }

  const p = product;
  const lang = langTab;
  const nutri = p?.nutrition;

  return (
    <div style={{maxWidth:960,margin:'0 auto'}}>
      {toast&&<div style={{position:'fixed',bottom:24,right:24,background:'#1C2028',color:'#fff',padding:'12px 20px',borderRadius:10,fontWeight:600,fontSize:14,zIndex:999,boxShadow:'0 4px 20px rgba(0,0,0,0.25)'}}>{toast}</div>}

      <div className="topbar">
        <div>
          <div className="page-title">📥 Import automatique</div>
          <div className="page-subtitle">URL → Claude extrait tout → tu valides → produit live.</div>
        </div>
      </div>

      {/* URL */}
      <div className="card" style={{marginBottom:24}}>
        <div className="card-header"><span className="card-title">🔗 URL du produit</span></div>
        <div style={{padding:'20px 24px',display:'flex',gap:12}}>
          <input className="form-control" style={{flex:1}}
            placeholder="https://www.estrella.se/produkter/hot-holiday-dippmix/"
            value={url} onChange={e=>setUrl(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&analyse()} />
          <button className="btn btn-primary" onClick={analyse} disabled={loading||!url.trim()} style={{whiteSpace:'nowrap',minWidth:160}}>
            {loading?'⏳ Analyse en cours...':'🤖 Analyser avec Claude'}
          </button>
        </div>
        {error&&<div style={{padding:'0 24px 20px',color:'#C62828',fontSize:13}}>⚠️ {error}</div>}
        <div style={{padding:'0 24px 20px',fontSize:12,color:'#8B7E72'}}>
          Compatible : Estrella, ICA, Waitrose, M&amp;S, Systembolaget, Ankorstore, et tout site e-commerce standard.
        </div>
      </div>

      {loading&&(
        <div style={{textAlign:'center',padding:80,color:'#8B7E72'}}>
          <div style={{fontSize:56,marginBottom:16}}>🤖</div>
          <p style={{fontSize:15,marginBottom:6}}>Claude analyse la page...</p>
          <p style={{fontSize:13}}>Extraction, traduction FR/EN/SV, détection allergènes</p>
        </div>
      )}

      {p&&!loading&&(
        <>
          {/* Lang tabs */}
          <div style={{display:'flex',gap:4,marginBottom:20}}>
            {(['fr','sv','en'] as const).map(l=>(
              <button key={l} onClick={()=>setLangTab(l)}
                style={{padding:'8px 20px',border:'1px solid',borderRadius:6,cursor:'pointer',fontWeight:600,fontSize:13,
                  background:langTab===l?'#7B4F7B':'#fff',
                  color:langTab===l?'#fff':'#5A5248',
                  borderColor:langTab===l?'#7B4F7B':'#E8E4DE'}}>
                {LANG_FLAGS[l]} {l.toUpperCase()}
              </button>
            ))}
            <span style={{marginLeft:'auto',fontSize:12,color:'#8B7E72',alignSelf:'center'}}>
              Édite dans les 3 langues avant d'ajouter
            </span>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 380px',gap:24,alignItems:'start'}}>

            {/* ── LEFT: all fields ── */}
            <div style={{display:'flex',flexDirection:'column',gap:16}}>

              {/* Identité */}
              <div className="card">
                <div className="card-header"><span className="card-title">📝 Identité produit</span></div>
                <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:14}}>

                  <div style={{display:'grid',gridTemplateColumns:'60px 1fr 1fr',gap:10,alignItems:'end'}}>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Emoji</label>
                      <input className="form-control" style={{textAlign:'center',fontSize:22,padding:'6px 4px'}}
                        value={p.emoji} onChange={e=>setProduct({...p,emoji:e.target.value})} />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">{LANG_FLAGS[lang]} Nom</label>
                      <input className="form-control" value={p[field('name')] as string}
                        onChange={e=>setField('name',e.target.value)} />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Marque</label>
                      <input className="form-control" value={p.brand||''}
                        onChange={e=>setProduct({...p,brand:e.target.value})} />
                    </div>
                  </div>

                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">{LANG_FLAGS[lang]} Accroche</label>
                    <input className="form-control" value={p[field('subtitle')] as string||''}
                      onChange={e=>setField('subtitle',e.target.value)} />
                  </div>

                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">{LANG_FLAGS[lang]} Description</label>
                    <textarea className="form-control" rows={4} value={p[field('desc')] as string||''}
                      onChange={e=>setField('desc',e.target.value)} />
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Prix (€)</label>
                      <input className="form-control" type="number" step="0.01" value={p.price}
                        onChange={e=>setProduct({...p,price:parseFloat(e.target.value)})} />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">Poids/Format</label>
                      <input className="form-control" placeholder="24g, 250ml..." value={p.weight||''}
                        onChange={e=>setProduct({...p,weight:e.target.value})} />
                    </div>
                    <div className="form-group" style={{margin:0}}>
                      <label className="form-label">{LANG_FLAGS[lang]} Origine</label>
                      <input className="form-control" value={p[field('origin')] as string||''}
                        onChange={e=>setField('origin',e.target.value)} />
                    </div>
                  </div>

                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">Catégorie</label>
                    <select className="form-control" value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
                      <option value="">— Choisir —</option>
                      {categories.map(c=><option key={c.id} value={c.id}>{c.name_fr}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Ingrédients & Allergènes */}
              <div className="card">
                <div className="card-header"><span className="card-title">🧪 Ingrédients & Allergènes</span></div>
                <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:14}}>
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">{LANG_FLAGS[lang]} Ingrédients</label>
                    <textarea className="form-control" rows={4} value={p[field('ingredients')] as string||''}
                      onChange={e=>setField('ingredients',e.target.value)}
                      placeholder="Salt, maltodextrin, onion powder..." />
                  </div>
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">{LANG_FLAGS[lang]} Allergènes</label>
                    <input className="form-control" value={p[field('allergens')] as string||''}
                      onChange={e=>setField('allergens',e.target.value)}
                      placeholder="Contient : gluten, lait..." />
                  </div>
                  {p.labels?.length>0&&(
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      {p.labels.map(l=>(
                        <span key={l} style={{background:'#E8F5E9',color:'#2E7D32',padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700}}>
                          ✓ {l}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Conservation & Usage */}
              <div className="card">
                <div className="card-header"><span className="card-title">📦 Conservation & Utilisation</span></div>
                <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:14}}>
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">{LANG_FLAGS[lang]} Conservation</label>
                    <input className="form-control" value={p[field('storage')] as string||''}
                      onChange={e=>setField('storage',e.target.value)}
                      placeholder="Conserver à l'abri de la chaleur..." />
                  </div>
                  <div className="form-group" style={{margin:0}}>
                    <label className="form-label">{LANG_FLAGS[lang]} Suggestions d'utilisation</label>
                    <textarea className="form-control" rows={3} value={p[field('usage')] as string||''}
                      onChange={e=>setField('usage',e.target.value)}
                      placeholder="Parfait avec des chips, en trempette..." />
                  </div>
                </div>
              </div>

              {/* Nutrition */}
              {nutri&&Object.values(nutri).some(v=>v)&&(
                <div className="card">
                  <div className="card-header"><span className="card-title">📊 Valeurs nutritionnelles</span>{nutri.portion&&<span style={{fontSize:12,color:'#8B7E72'}}>pour {nutri.portion}</span>}</div>
                  <div style={{padding:'0 20px 16px'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                      <tbody>
                        {[
                          ['Énergie',nutri.energie],
                          ['Graisses',nutri.graisses],
                          ['dont Saturées',nutri.dont_satures],
                          ['Glucides',nutri.glucides],
                          ['dont Sucres',nutri.dont_sucres],
                          ['Fibres',nutri.fibres],
                          ['Protéines',nutri.proteines],
                          ['Sel',nutri.sel],
                        ].filter(([,v])=>v).map(([label,val])=>(
                          <tr key={label} style={{borderBottom:'1px solid #F0EDE8'}}>
                            <td style={{padding:'8px 12px',color:'#5A5248'}}>{label}</td>
                            <td style={{padding:'8px 12px',textAlign:'right',fontWeight:600,color:'#1C2028'}}>{val}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Flags */}
              <div className="card">
                <div style={{padding:'16px 20px',display:'flex',gap:32}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,cursor:'pointer'}}>
                    <input type="checkbox" checked={p.is_new} onChange={e=>setProduct({...p,is_new:e.target.checked})} />
                    Nouveauté
                  </label>
                  <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,cursor:'pointer'}}>
                    <input type="checkbox" checked={p.is_bestseller} onChange={e=>setProduct({...p,is_bestseller:e.target.checked})} />
                    Best-seller
                  </label>
                </div>
              </div>
            </div>

            {/* ── RIGHT: image + actions ── */}
            <div style={{display:'flex',flexDirection:'column',gap:16}}>

              <div className="card">
                <div className="card-header"><span className="card-title">🖼️ Image</span></div>
                <div style={{padding:'16px 20px'}}>
                  <div style={{marginBottom:14,background:'#F8F5F0',borderRadius:8,padding:12,textAlign:'center',minHeight:180,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {selectedImg
                      ? <img src={selectedImg} alt="" style={{maxHeight:180,maxWidth:'100%',objectFit:'contain',borderRadius:6}} />
                      : <span style={{color:'#A09688',fontSize:13}}>Aucune image</span>}
                  </div>
                  <div className="form-group" style={{margin:'0 0 12px'}}>
                    <label className="form-label">URL image</label>
                    <input className="form-control" placeholder="https://..."
                      value={selectedImg} onChange={e=>setSelectedImg(e.target.value)} />
                  </div>
                  {p.image_urls?.length>0&&(
                    <>
                      <p style={{fontSize:11,color:'#8B7E72',marginBottom:8,textTransform:'uppercase',letterSpacing:1}}>
                        Trouvées sur la page ({p.image_urls.length})
                      </p>
                      <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                        {p.image_urls.slice(0,8).map((u,i)=>(
                          <div key={i} onClick={()=>setSelectedImg(u)}
                            style={{width:68,height:68,border:`2px solid ${selectedImg===u?'#7B4F7B':'#E8E4DE'}`,
                              borderRadius:6,overflow:'hidden',cursor:'pointer',background:'#F8F5F0',flexShrink:0}}>
                            <img src={u} alt="" style={{width:'100%',height:'100%',objectFit:'contain'}}
                              onError={e=>{(e.target as HTMLImageElement).style.display='none';}} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="card">
                <div style={{padding:'14px 20px'}}>
                  <a href={p.source_url} target="_blank" rel="noopener"
                    style={{fontSize:11,color:'#7B4F7B',wordBreak:'break-all'}}>
                    🔗 {p.source_url}
                  </a>
                </div>
              </div>

              <button className="btn btn-primary" onClick={addToShop} disabled={saving}
                style={{padding:'16px 24px',fontSize:14,letterSpacing:1.5,justifyContent:'center'}}>
                {saving?'⏳ Ajout...':'✅ Ajouter au catalogue'}
              </button>
              <button className="btn btn-ghost" onClick={()=>{setProduct(null);setUrl('');}}
                style={{justifyContent:'center',fontSize:13}}>
                Annuler
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
