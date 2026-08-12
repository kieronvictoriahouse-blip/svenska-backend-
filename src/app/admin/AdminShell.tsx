'use client';
import Link from 'next/link';
import { AdminLang } from '@/lib/admin-i18n';
import { NAV, MOBILE_TABS, NavBadge, isNavItemActive } from '@/lib/admin-nav';
import { T, initials } from '@/lib/admin-theme';
import { shellCss } from './shell-css';

/* ═══════════════════════════════════════════════════════════════
   SHELL PRÉSENTATIONNEL — aucune logique d'authentification ni de
   chargement de données, uniquement le rendu. Séparé de layout.tsx
   pour pouvoir être rendu tel quel dans un harnais de vérification
   visuelle. Mesures normatives : topbar 48 px, sidebar 222 px,
   barre d'onglets 58 px, bascule mobile à 900 px.
   ═══════════════════════════════════════════════════════════════ */

export type ShellProps = {
  children: React.ReactNode;
  pathname: string;
  search: string;
  mobile: boolean;
  navOpen: boolean;
  setNavOpen: (v: boolean | ((p: boolean) => boolean)) => void;
  siteName: string;
  email: string;
  accent: string;
  frontUrl: string;
  lang: AdminLang;
  onLang: (l: AdminLang) => void;
  counts: Record<NavBadge, number>;
  fullBleed?: boolean;
  onSearch?: (q: string) => void;
  onUserClick?: () => void;
};

export default function AdminShell(p: ShellProps) {
  const userInitials = initials(p.email);
  const brandInitials = initials(p.siteName).slice(0, 2);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shellCss(p.accent) }} />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: T.appBg }}>

        {/* ── Topbar 48 px ───────────────────────────────── */}
        <header className="sc-top">
          {p.mobile && (
            <button className="sc-burger" onClick={() => p.setNavOpen(v => !v)} aria-label="Ouvrir la navigation" aria-expanded={p.navOpen}>
              <span className="ms" style={{ fontSize: 22 }}>menu</span>
            </button>
          )}

          <Link href="/admin" className="sc-brand">
            <div className="sc-brand-mark">{brandInitials}</div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span className="sc-brand-name">{p.siteName}</span>
              <span className="sc-brand-sub">Back-office</span>
            </div>
          </Link>

          {!p.mobile && (
            <div className="sc-search-wrap">
              <div className="sc-search">
                <span className="ms" style={{ fontSize: 17, color: 'rgba(255,255,255,.4)' }}>search</span>
                <input
                  placeholder="Rechercher un produit, une commande, un client…"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const q = (e.target as HTMLInputElement).value.trim();
                      if (q) p.onSearch?.(q);
                    }
                  }}
                />
                <kbd className="sc-kbd">⌘K</kbd>
              </div>
            </div>
          )}

          <div style={{ flex: 1 }} />

          {!p.mobile && (
            <a href={p.frontUrl} target="_blank" rel="noopener" className="sc-top-link">
              <span className="ms" style={{ fontSize: 17 }}>open_in_new</span>Voir le site
            </a>
          )}

          <div className="sc-lang">
            {(['fr', 'en', 'sv'] as AdminLang[]).map(l => (
              <button key={l} className={p.lang === l ? 'on' : ''} onClick={() => p.onLang(l)}>{l}</button>
            ))}
          </div>

          <button className="sc-user" onClick={p.onUserClick} title="Se déconnecter">
            <div className="sc-avatar">{userInitials}</div>
            {!p.mobile && (
              <>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.65)' }}>{p.email.split('@')[0]}</span>
                <span className="ms" style={{ fontSize: 16, color: 'rgba(255,255,255,.3)' }}>expand_more</span>
              </>
            )}
          </button>
        </header>

        {/* ── Corps : sidebar + main ─────────────────────── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          <aside className={`sc-side${p.mobile ? ' mob' : ''}${p.mobile && p.navOpen ? ' open' : ''}`}>
            <div className="sc-side-scroll">
              {NAV.map((group, gi) => (
                <div className="sc-nav-group" key={gi}>
                  {group.label && <div className="sc-nav-glabel">{group.label}</div>}
                  {group.items.map(item => {
                    const on = isNavItemActive(item, p.pathname, p.search, group.items);
                    const badge = item.badge ? p.counts[item.badge] : 0;
                    return (
                      <Link key={item.href} href={item.href} className={`sc-nav-item${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
                        <span className="ms">{item.icon}</span>
                        <span className="sc-nav-label">{item.label}</span>
                        {!!badge && <span className="sc-nav-badge">{badge}</span>}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="sc-side-foot">
              <span className="ms" style={{ fontSize: 15 }}>bolt</span>
              <span style={{ flex: 1 }}>Shopflow v2.4</span>
              <span className="ms" style={{ fontSize: 16, cursor: 'pointer' }}>help</span>
            </div>
          </aside>

          {p.mobile && p.navOpen && (
            <button className="sc-overlay" onClick={() => p.setNavOpen(false)} aria-label="Fermer la navigation" />
          )}

          <main className="sc-main">
            {p.fullBleed ? p.children : <div className="sc-screen">{p.children}</div>}
          </main>
        </div>

        {/* ── Barre d'onglets mobile 58 px ───────────────── */}
        {p.mobile && (
          <nav className="sc-tabs">
            {MOBILE_TABS.map(tab => {
              const on = !tab.menu && (tab.href === '/admin' ? p.pathname === '/admin' : p.pathname.startsWith(tab.href));
              const badge = tab.badge ? p.counts[tab.badge] : 0;
              const inner = (
                <>
                  <span className="ms">{tab.icon}</span>
                  <span className="lbl">{tab.label}</span>
                  {!!badge && <span className="sc-tab-badge">{badge}</span>}
                </>
              );
              return tab.menu ? (
                <button key={tab.label} className="sc-tab" onClick={() => p.setNavOpen(true)}>{inner}</button>
              ) : (
                <Link key={tab.href} href={tab.href} className={`sc-tab${on ? ' on' : ''}`}>{inner}</Link>
              );
            })}
          </nav>
        )}
      </div>
    </>
  );
}
