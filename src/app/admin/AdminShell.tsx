'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AdminLang, T_SHELL, Trad, traduire } from '@/lib/admin-i18n';
import { NAV, MOBILE_TABS, NavBadge, isNavItemActive } from '@/lib/admin-nav';
import { T, initials } from '@/lib/admin-theme';
import { MenuActions, MenuItem, MenuSep } from '@/components/MenuActions';
import { shellCss } from './shell-css';
import SuspensionBanner from './SuspensionBanner';

/* ═══════════════════════════════════════════════════════════════
   SHELL PRÉSENTATIONNEL — aucune logique d'authentification ni de
   chargement de données, uniquement le rendu. Séparé de layout.tsx
   pour pouvoir être rendu tel quel dans un harnais de vérification
   visuelle. Mesures normatives : topbar 48 px, sidebar 222 px,
   barre d'onglets 58 px, bascule mobile à 900 px.

   Téléphone : tout ce qui change entre ordinateur et téléphone
   (burger, tiroir, onglets, recherche) est rendu dans les deux cas
   et basculé en CSS (shell-css.ts). Piloté par un état JS, faux au
   premier rendu, la sidebar d'ordinateur s'affichait puis glissait
   hors de l'écran à chaque chargement de page.
   ═══════════════════════════════════════════════════════════════ */

export type ShellProps = {
  children: React.ReactNode;
  pathname: string;
  search: string;
  /** Conservé pour compatibilité : la bascule est désormais en CSS. */
  mobile?: boolean;
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
  /** Déconnexion, appelée APRÈS confirmation dans le menu de l'avatar. */
  onLogout?: () => void;
};

/* Libellés propres au menu de l'avatar et à la recherche mobile. */
const TXT: Record<string, Trad> = {
  account:       { fr: 'Compte', en: 'Account', sv: 'Konto' },
  language:      { fr: 'Langue de l’interface', en: 'Interface language', sv: 'Gränssnittets språk' },
  logoutConfirm: { fr: 'Se déconnecter du back-office ?', en: 'Sign out of the back office?', sv: 'Logga ut från backoffice?' },
  logoutYes:     { fr: 'Oui, me déconnecter', en: 'Yes, sign me out', sv: 'Ja, logga ut' },
  cancel:        { fr: 'Annuler', en: 'Cancel', sv: 'Avbryt' },
  search:        { fr: 'Rechercher', en: 'Search', sv: 'Sök' },
  searchMobile:  { fr: 'Produit, n° de commande ou e-mail…', en: 'Product, order # or email…', sv: 'Produkt, ordernr eller e-post…' },
  closeSearch:   { fr: 'Fermer la recherche', en: 'Close search', sv: 'Stäng sökningen' },
};

const LANG_NAMES: Record<AdminLang, string> = { fr: 'Français', en: 'English', sv: 'Svenska' };

export default function AdminShell(p: ShellProps) {
  /* La coquille reçoit la langue en props plutôt que par le hook : elle
     est rendue telle quelle dans le harnais de vérification visuelle, où
     il n'y a ni localStorage ni évènement. */
  const s = (cle: keyof typeof T_SHELL) => traduire(T_SHELL[cle], p.lang);
  const x = (cle: keyof typeof TXT) => traduire(TXT[cle], p.lang);
  const userInitials = initials(p.email);
  const brandInitials = initials(p.siteName).slice(0, 2);

  /* Menu de l'avatar : un tap sur l'avatar déconnectait immédiatement —
     sur téléphone, c'était une déconnexion accidentelle assurée. */
  const userBtn = useRef<HTMLButtonElement>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const closeUserMenu = () => { setUserMenu(false); setConfirmLogout(false); };

  /* Recherche sur téléphone : la barre d'ordinateur n'y tient pas, une
     loupe l'ouvre par-dessus la topbar. */
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  /* ⌘K / Ctrl K : la pastille l'annonçait, aucun raccourci n'était branché.
     La pastille suit le système (posée après le montage : pas de décalage
     entre rendu serveur et client). */
  const deskSearchRef = useRef<HTMLInputElement>(null);
  const [kbd, setKbd] = useState('⌘K');
  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) setKbd('Ctrl K');
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      if (window.matchMedia('screen and (min-width: 900px)').matches) {
        deskSearchRef.current?.focus();
        deskSearchRef.current?.select();
      } else setSearchOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submitSearch = (q: string) => {
    const v = q.trim();
    if (!v) return;
    p.onSearch?.(v);
    setSearchOpen(false);
  };

  /* Échap ferme le tiroir et la recherche. */
  useEffect(() => {
    if (!p.navOpen && !searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      p.setNavOpen(false);
      setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.navOpen, searchOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { closeUserMenu(); setSearchOpen(false); }, [p.pathname]);

  /* Tiroir ouvert : l'écran courant est visible sans avoir à défiler. */
  const sideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!p.navOpen) return;
    sideRef.current?.querySelector('.sc-nav-item.on')?.scrollIntoView({ block: 'center' });
  }, [p.navOpen]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shellCss(p.accent) }} />
      {/* .sc-app : 100dvh — sur téléphone, 100vh passe sous la barre d'adresse */}
      <div className="sc-app" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.appBg }}>

        <SuspensionBanner lang={p.lang} />

        {/* ── Topbar 48 px ───────────────────────────────── */}
        <header className="sc-top">
          <button className="sc-burger" onClick={() => p.setNavOpen(v => !v)} aria-label={s('openNav')} aria-expanded={p.navOpen}>
            <span className="ms" style={{ fontSize: 22 }}>menu</span>
          </button>

          <Link href="/admin" className="sc-brand">
            <div className="sc-brand-mark">{brandInitials}</div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span className="sc-brand-name">{p.siteName}</span>
              <span className="sc-brand-sub">{s('backoffice')}</span>
            </div>
          </Link>

          <div className="sc-search-wrap">
            <div className="sc-search">
              <span className="ms" style={{ fontSize: 17, color: 'rgba(255,255,255,.4)' }}>search</span>
              <input
                ref={deskSearchRef}
                type="search"
                placeholder={s('searchPlaceholder')}
                aria-label={x('search')}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const q = (e.target as HTMLInputElement).value.trim();
                    if (q) p.onSearch?.(q);
                  }
                }}
              />
              <kbd className="sc-kbd">{kbd}</kbd>
            </div>
          </div>

          <div className="sc-hide-mobile" style={{ flex: 1 }} />

          <a href={p.frontUrl} target="_blank" rel="noopener" className="sc-top-link">
            <span className="ms" style={{ fontSize: 17 }}>open_in_new</span>{s('viewSite')}
          </a>

          <div className="sc-lang">
            {(['fr', 'en', 'sv'] as AdminLang[]).map(l => (
              <button key={l} className={p.lang === l ? 'on' : ''} onClick={() => p.onLang(l)}>{l}</button>
            ))}
          </div>

          {/* Téléphone : loupe → champ de recherche plein largeur */}
          <button className="sc-top-iconbtn" onClick={() => setSearchOpen(true)} aria-label={x('search')}>
            <span className="ms">search</span>
          </button>

          <button ref={userBtn} className="sc-user" onClick={() => { setConfirmLogout(false); setUserMenu(v => !v); }}
                  aria-haspopup="menu" aria-expanded={userMenu} aria-label={`${x('account')} — ${p.email}`}>
            <div className="sc-avatar">{userInitials}</div>
            <span className="sc-hide-mobile" style={{ fontSize: 12, color: 'rgba(255,255,255,.65)' }}>{p.email.split('@')[0]}</span>
            <span className="ms sc-hide-mobile" style={{ fontSize: 16, color: 'rgba(255,255,255,.3)' }}>expand_more</span>
          </button>

          {searchOpen && (
            <form className="sc-msearch" role="search"
                  onSubmit={e => { e.preventDefault(); submitSearch(searchRef.current?.value || ''); }}>
              <input ref={searchRef} type="search" enterKeyHint="search" placeholder={x('searchMobile')} aria-label={x('search')} />
              <button type="button" className="sc-top-iconbtn" onClick={() => setSearchOpen(false)} aria-label={x('closeSearch')}>
                <span className="ms">close</span>
              </button>
            </form>
          )}
        </header>

        {/* Menu de l'avatar : hors de la topbar, sinon il resterait sous
            la barre d'onglets (la topbar forme son propre empilement). */}
        <MenuActions open={userMenu} anchor={userBtn.current} onClose={closeUserMenu} title={p.email}>
          <div className="sc-only-mobile">
            <MenuItem icon="open_in_new" label={s('viewSite')} href={p.frontUrl || '/'} external />
            <div className="sc-menu-title" style={{ paddingTop: 10 }}>{x('language')}</div>
            <div className="sc-menu-row">
              {(['fr', 'en', 'sv'] as AdminLang[]).map(l => (
                <button key={l} type="button" className={`sc-chip${p.lang === l ? ' on' : ''}`} style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => p.onLang(l)} aria-pressed={p.lang === l}>
                  {LANG_NAMES[l]}
                </button>
              ))}
            </div>
            <MenuSep />
          </div>
          {!confirmLogout ? (
            <MenuItem icon="logout" label={s('logout')} danger keepOpen onClick={() => setConfirmLogout(true)} />
          ) : (
            <div style={{ padding: '6px 4px 2px' }}>
              <div className="sc-menu-title" style={{ color: T.ink, fontWeight: 600 }}>{x('logoutConfirm')}</div>
              <div className="sc-menu-row" style={{ padding: '4px 6px' }}>
                <button type="button" className="sc-btn sc-btn-secondary" style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => setConfirmLogout(false)}>{x('cancel')}</button>
                <button type="button" className="sc-btn sc-btn-danger" style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => { closeUserMenu(); p.onLogout?.(); }}>
                  <span className="ms">logout</span>{x('logoutYes')}
                </button>
              </div>
            </div>
          )}
        </MenuActions>

        {/* ── Corps : sidebar + main ─────────────────────── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          <aside ref={sideRef} className={`sc-side${p.navOpen ? ' open' : ''}`} aria-label="Navigation">
            {/* Téléphone : en-tête du tiroir */}
            <div className="sc-side-head">
              <div className="sc-brand-mark">{brandInitials}</div>
              <span className="sc-brand-name">{p.siteName}</span>
              <button className="sc-iconbtn" onClick={() => p.setNavOpen(false)} aria-label={s('closeNav')}>
                <span className="ms">close</span>
              </button>
            </div>
            <div className="sc-side-scroll">
              {NAV.map((group, gi) => (
                <div className="sc-nav-group" key={gi}>
                  {group.label && <div className="sc-nav-glabel">{traduire(group.label, p.lang)}</div>}
                  {group.items.map(item => {
                    const on = isNavItemActive(item, p.pathname, p.search, group.items);
                    const badge = item.badge ? p.counts[item.badge] : 0;
                    return (
                      <Link key={item.href} href={item.href} className={`sc-nav-item${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}
                            onClick={() => p.setNavOpen(false)}>
                        <span className="ms">{item.icon}</span>
                        <span className="sc-nav-label">{traduire(item.label, p.lang)}</span>
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
              <span className="ms" style={{ fontSize: 16, cursor: 'pointer' }} title={s('help')}>help</span>
            </div>
          </aside>

          {p.navOpen && (
            <button className="sc-overlay" onClick={() => p.setNavOpen(false)} aria-label={s('closeNav')} />
          )}

          <main className="sc-main">
            {p.fullBleed ? p.children : <div className="sc-screen">{p.children}</div>}
          </main>
        </div>

        {/* ── Barre d'onglets mobile 58 px (masquée en CSS sur ordinateur) ── */}
        <nav className="sc-tabs" aria-label="Navigation rapide">
          {MOBILE_TABS.map(tab => {
            const on = !tab.menu && (tab.href === '/admin' ? p.pathname === '/admin' : p.pathname.startsWith(tab.href));
            const badge = tab.badge ? p.counts[tab.badge] : 0;
            const inner = (
              <>
                <span className="ms">{tab.icon}</span>
                <span className="lbl">{traduire(tab.label, p.lang)}</span>
                {!!badge && <span className="sc-tab-badge">{badge}</span>}
              </>
            );
            return tab.menu ? (
              <button key={tab.icon} className={`sc-tab${p.navOpen ? ' on' : ''}`} onClick={() => p.setNavOpen(v => !v)} aria-expanded={p.navOpen}>{inner}</button>
            ) : (
              <Link key={tab.href} href={tab.href} className={`sc-tab${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>{inner}</Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
