import { T } from '@/lib/admin-theme';

/* ═══════════════════════════════════════════════════════════════
   FEUILLE DE STYLE DU SHELL + PRIMITIVES PARTAGÉES
   Valeurs normatives du handoff « Redesign du back office ».
   Toute la couleur d'accent passe par la variable CSS --accent,
   alimentée par white_label_config.color_primary.
   ═══════════════════════════════════════════════════════════════ */

export function shellCss(accent: string): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,200..600,0..1,0');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Jost', system-ui, sans-serif; background: ${T.appBg}; color: ${T.ink}; -webkit-font-smoothing: antialiased; }
    input, select, textarea, button { font-family: inherit; }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb { background: #D9D3CA; border-radius: 8px; border: 3px solid transparent; background-clip: content-box; }
    ::-webkit-scrollbar-track { background: transparent; }
    @keyframes sc-slide-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

    :root { --accent: ${accent}; }

    /* ── Icônes ───────────────────────────────────────────── */
    .ms {
      font-family: 'Material Symbols Rounded';
      font-weight: normal; font-style: normal; line-height: 1;
      letter-spacing: normal; text-transform: none; display: inline-block;
      white-space: nowrap; word-wrap: normal; direction: ltr;
      -webkit-font-feature-settings: 'liga'; -webkit-font-smoothing: antialiased;
      font-variation-settings: 'wght' 300;
      flex-shrink: 0; user-select: none;
    }
    .ms-fill { font-variation-settings: 'wght' 500, 'FILL' 1; }

    /* ── Topbar ───────────────────────────────────────────── */
    .sc-top { height: 48px; flex-shrink: 0; background: ${T.topbar}; display: flex; align-items: stretch; position: relative; z-index: 60; }
    .sc-top-sep { border-left: 1px solid rgba(255,255,255,.07); }
    .sc-burger { width: 48px; border: none; background: none; color: rgba(255,255,255,.75); display: flex; align-items: center; justify-content: center; cursor: pointer; border-right: 1px solid rgba(255,255,255,.07); }
    .sc-brand { display: flex; align-items: center; gap: 10px; padding: 0 16px; border-right: 1px solid rgba(255,255,255,.07); text-decoration: none; }
    .sc-brand-mark { width: 28px; height: 28px; border-radius: 8px; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; letter-spacing: .3px; flex-shrink: 0; }
    .sc-brand-name { font-size: 13px; font-weight: 600; color: #fff; letter-spacing: .2px; }
    .sc-brand-sub { font-size: 8.5px; letter-spacing: 2.4px; text-transform: uppercase; color: rgba(255,255,255,.32); font-weight: 500; }
    .sc-search-wrap { flex: 1; display: flex; align-items: center; padding: 0 16px; max-width: 520px; }
    .sc-search { display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.06); border-radius: 7px; padding: 0 10px; }
    .sc-search input { flex: 1; background: none; border: none; outline: none; color: #fff; font-size: 12.5px; }
    .sc-search input::placeholder { color: rgba(255,255,255,.38); }
    .sc-kbd { font-size: 9.5px; color: rgba(255,255,255,.35); border: 1px solid rgba(255,255,255,.15); border-radius: 4px; padding: 1px 5px; letter-spacing: .5px; }
    .sc-top-link { display: flex; align-items: center; gap: 7px; padding: 0 14px; font-size: 12px; color: rgba(255,255,255,.55); text-decoration: none; border-left: 1px solid rgba(255,255,255,.07); transition: background .12s, color .12s; }
    .sc-top-link:hover { background: rgba(255,255,255,.06); color: #fff; }
    .sc-lang { display: flex; align-items: center; gap: 1px; padding: 0 8px; border-left: 1px solid rgba(255,255,255,.07); }
    .sc-lang button { background: none; border: none; color: rgba(255,255,255,.4); cursor: pointer; font-size: 10.5px; font-weight: 700; letter-spacing: .7px; padding: 4px 7px; border-radius: 5px; text-transform: uppercase; }
    .sc-lang button.on { background: rgba(255,255,255,.16); color: #fff; }
    .sc-user { display: flex; align-items: center; gap: 9px; padding: 0 12px 0 14px; border-left: 1px solid rgba(255,255,255,.07); cursor: pointer; background: none; }
    .sc-avatar { width: 27px; height: 27px; border-radius: 50%; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; flex-shrink: 0; }

    /* ── Sidebar ──────────────────────────────────────────── */
    .sc-side { width: 222px; flex-shrink: 0; background: ${T.sidebarBg}; border-right: 1px solid ${T.border}; display: flex; flex-direction: column; }
    .sc-side-scroll { flex: 1; overflow-y: auto; padding: 8px 0 16px; }
    .sc-nav-group { padding: 0 0 2px; }
    .sc-nav-glabel { padding: 13px 16px 5px; font-size: 8.5px; letter-spacing: 2.2px; text-transform: uppercase; color: ${T.muted2}; font-weight: 600; }
    .sc-nav-item { display: flex; align-items: center; gap: 10px; padding: 7px 14px 7px 13px; margin: 0 8px; border-radius: 7px; font-size: 12.5px; cursor: pointer; transition: background .12s, color .12s; color: ${T.text2}; font-weight: 400; text-decoration: none; }
    .sc-nav-item:hover { background: ${T.borderFaint2}; color: ${T.text2}; }
    .sc-nav-item .ms { font-size: 19px; color: ${T.muted}; }
    .sc-nav-item.on { background: color-mix(in srgb, var(--accent) 8%, transparent); color: var(--accent); font-weight: 600; }
    .sc-nav-item.on:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
    .sc-nav-item.on .ms { color: var(--accent); font-variation-settings: 'wght' 400; }
    .sc-nav-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sc-nav-badge { min-width: 19px; height: 17px; padding: 0 5px; border-radius: 9px; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; background: #EFEBE4; color: #857C71; }
    .sc-nav-item.on .sc-nav-badge { background: var(--accent); color: #fff; }
    .sc-side-foot { border-top: 1px solid ${T.border}; padding: 9px 14px; display: flex; align-items: center; gap: 8px; font-size: 11px; color: ${T.muted2}; }

    /* ── Tiroir mobile ────────────────────────────────────── */
    .sc-side.mob { position: fixed; top: 48px; bottom: 0; left: 0; width: 250px; z-index: 50; transition: transform .22s cubic-bezier(.4,0,.2,1); box-shadow: 6px 0 28px rgba(21,24,30,.16); transform: translateX(-102%); }
    .sc-side.mob.open { transform: translateX(0); }
    .sc-overlay { position: fixed; inset: 48px 0 0 0; background: rgba(21,24,30,.45); z-index: 45; backdrop-filter: blur(2px); border: none; }

    /* ── Barre d'onglets mobile ───────────────────────────── */
    .sc-tabs { flex-shrink: 0; height: 58px; background: #fff; border-top: 1px solid ${T.borderField}; display: flex; align-items: stretch; padding-bottom: env(safe-area-inset-bottom); z-index: 70; }
    .sc-tab { flex: 1; position: relative; background: none; border: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; cursor: pointer; color: ${T.muted}; text-decoration: none; }
    .sc-tab .ms { font-size: 22px; }
    .sc-tab.on { color: var(--accent); }
    .sc-tab.on .ms { font-variation-settings: 'wght' 500, 'FILL' 1; }
    .sc-tab span.lbl { font-size: 9.5px; font-weight: 500; letter-spacing: .2px; }
    .sc-tab-badge { position: absolute; top: 7px; left: 50%; margin-left: 5px; min-width: 15px; height: 15px; padding: 0 4px; border-radius: 8px; background: ${T.red}; color: #fff; font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center; }

    /* ── Zone principale ──────────────────────────────────── */
    .sc-main { flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden; background: ${T.appBg}; }

    /* ── Primitives partagées par les écrans ──────────────── */
    .sc-screen { padding: 16px 18px 90px; max-width: 1500px; }
    .sc-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
    .sc-title { font-size: 17px; font-weight: 600; letter-spacing: -.2px; color: ${T.ink}; }
    .sc-sub { font-size: 11.5px; color: ${T.text3}; margin-top: 2px; }
    .sc-actions { display: flex; gap: 7px; flex-wrap: wrap; }

    .sc-btn { display: inline-flex; align-items: center; gap: 6px; border-radius: 7px; padding: 8px 14px; font-size: 12.5px; font-weight: 500; cursor: pointer; text-decoration: none; transition: background .12s, color .12s, border-color .12s; white-space: nowrap; }
    .sc-btn .ms { font-size: 17px; }
    .sc-btn-primary { background: ${T.ink}; color: #fff; border: none; }
    .sc-btn-primary:hover { background: ${T.inkHover}; }
    .sc-btn-secondary { background: #fff; color: #3A3228; border: 1px solid ${T.borderField}; }
    .sc-btn-secondary:hover { background: #F7F4EF; }
    .sc-btn-green { background: ${T.green}; color: #fff; border: none; }
    .sc-btn-green:hover { background: ${T.greenHover}; }
    .sc-btn-danger { background: #fff; color: ${T.red}; border: 1px solid #EBD5D1; }
    .sc-btn-danger:hover { background: #FBE7E4; }
    .sc-btn:disabled { opacity: .55; cursor: not-allowed; }

    .sc-card { background: #fff; border: 1px solid ${T.border}; border-radius: 10px; }
    .sc-card-pad { padding: 13px 15px; }
    .sc-card-title { font-size: 12.5px; font-weight: 600; color: ${T.ink}; }

    .sc-table { width: 100%; border-collapse: collapse; background: #fff; }
    .sc-table th { padding: 8px 14px; text-align: left; font-size: 9px; font-weight: 600; letter-spacing: 1.3px; text-transform: uppercase; color: ${T.muted}; background: ${T.surfaceAlt}; border-bottom: 1px solid ${T.border}; white-space: nowrap; }
    .sc-table td { padding: 7px 14px; border-bottom: 1px solid ${T.borderFaint}; font-size: 12.5px; color: ${T.text2b}; }
    .sc-table tbody tr:last-child td { border-bottom: none; }
    .sc-table tbody tr:hover td { background: ${T.rowHover}; }
    .sc-num { font-variant-numeric: tabular-nums; }
    .sc-right { text-align: right; }

    .sc-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; letter-spacing: .3px; white-space: nowrap; }

    .sc-input, .sc-select, .sc-textarea { width: 100%; height: 34px; border: 1px solid ${T.borderField}; border-radius: 7px; padding: 0 10px; font-size: 12.5px; color: ${T.ink}; background: #fff; outline: none; transition: border-color .12s; }
    .sc-textarea { height: auto; padding: 8px 10px; line-height: 1.5; }
    .sc-input:focus, .sc-select:focus, .sc-textarea:focus { border-color: var(--accent); }
    .sc-label { display: block; font-size: 11px; font-weight: 600; color: ${T.text2b}; margin-bottom: 5px; }

    .sc-chip { height: 32px; padding: 0 12px; border-radius: 7px; font-size: 12px; cursor: pointer; white-space: nowrap; transition: all .12s; background: #fff; color: ${T.text2}; border: 1px solid ${T.border}; font-weight: 400; display: inline-flex; align-items: center; gap: 6px; }
    .sc-chip:hover { background: #F7F4EF; }
    .sc-chip.on { background: ${T.ink}; color: #fff; border-color: ${T.ink}; font-weight: 600; }
    .sc-chip.on:hover { background: ${T.inkHover}; }

    .sc-iconbtn { width: 26px; height: 26px; border-radius: 6px; border: 1px solid transparent; background: none; color: ${T.muted}; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: all .12s; }
    .sc-iconbtn .ms { font-size: 16px; }
    .sc-iconbtn:hover { background: ${T.borderFaint2}; border-color: ${T.border}; color: ${T.text2}; }

    .sc-empty { padding: 48px 20px; text-align: center; color: ${T.muted}; font-size: 12.5px; }

    /* Interrupteur (role=switch) — 34 × 19 px, cf. handoff */
    .sc-switch { width: 34px; height: 19px; border-radius: 10px; border: none; background: #DCD6CC; position: relative; cursor: pointer; transition: background .15s; flex-shrink: 0; padding: 0; }
    .sc-switch[aria-checked="true"] { background: ${T.green}; }
    .sc-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; border-radius: 50%; background: #fff; transition: transform .15s; }
    .sc-switch[aria-checked="true"]::after { transform: translateX(15px); }

    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;
}
