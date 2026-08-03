/* ── Libra Shared Components ── */

const LibraTokens = {
  bg: '#f7f5f2',
  card: '#ffffff',
  border: '#e8e4df',
  text: '#2a2520',
  textMid: '#6b6259',
  textLight: '#a39a8e',
  accent: '#8b5e3c',
  accentHover: '#7a5030',
  accentLight: '#f0e8df',
  accentLighter: '#f8f3ed',
  coverBg: '#e8e4df',
  serif: '"Instrument Serif", Georgia, serif',
  sans: '"DM Sans", system-ui, sans-serif',
  radius: 8,
};

/* ── Book Cover ── */
function LibraCover({ bookId = 1, title, w = 120, h = 176, style = {}, onClick }) {
  const pal = COVER_PALETTES[(bookId - 1) % COVER_PALETTES.length];
  return (
    <div onClick={onClick} style={{
      width: w, height: h, borderRadius: 4, flexShrink: 0, position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
      background: `linear-gradient(155deg, ${pal[0]} 0%, ${pal[1]} 100%)`,
      boxShadow: '2px 4px 12px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.08)',
      transition: 'transform .2s, box-shadow .2s',
      ...style,
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '3px 8px 20px rgba(0,0,0,.18)'; }}}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '2px 4px 12px rgba(0,0,0,.12), 0 1px 3px rgba(0,0,0,.08)'; }}
    >
      {/* Spine line */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'rgba(0,0,0,.15)' }} />
      {/* Decorative lines */}
      <div style={{ position: 'absolute', top: '20%', left: '18%', right: '18%', height: 1, background: 'rgba(255,255,255,.2)' }} />
      <div style={{ position: 'absolute', top: '75%', left: '18%', right: '18%', height: 1, background: 'rgba(255,255,255,.2)' }} />
      {/* Title */}
      {title && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: w < 80 ? 6 : 14, textAlign: 'center',
        }}>
          <span style={{
            fontFamily: LibraTokens.serif, fontSize: Math.max(10, Math.min(w * 0.13, 16)),
            color: 'rgba(255,255,255,.92)', lineHeight: 1.25, textShadow: '0 1px 4px rgba(0,0,0,.3)',
          }}>{title}</span>
        </div>
      )}
    </div>
  );
}

/* ── Progress Bar ── */
function LibraProgress({ pct = 0, w = '100%', h = 5 }) {
  const T = LibraTokens;
  return (
    <div style={{ width: w, height: h, background: T.border, borderRadius: h, overflow: 'hidden' }}>
      <div style={{ width: `${pct * 100}%`, height: '100%', background: T.accent, borderRadius: h, transition: 'width .3s' }} />
    </div>
  );
}

/* ── Star Rating ── */
function LibraStars({ rating = 0, size = 14, interactive = false, onChange }) {
  const T = LibraTokens;
  const [hover, setHover] = React.useState(0);
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1,2,3,4,5].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 16 16"
          style={{ cursor: interactive ? 'pointer' : 'default' }}
          onMouseEnter={() => interactive && setHover(i)}
          onMouseLeave={() => interactive && setHover(0)}
          onClick={() => interactive && onChange && onChange(i)}
        >
          <path d="M8 1l2.2 4.5 5 .7-3.6 3.5.9 5L8 12.4 3.5 14.7l.9-5L.8 6.2l5-.7z"
            fill={(interactive ? (hover || rating) : rating) >= i ? T.accent : T.border} />
        </svg>
      ))}
    </div>
  );
}

/* ── Tag Pill ── */
function LibraTag({ label, active = false, onClick }) {
  const T = LibraTokens;
  return (
    <span onClick={onClick} style={{
      fontFamily: T.sans, fontSize: 12, fontWeight: 500,
      color: active ? '#fff' : T.textMid,
      background: active ? T.accent : T.accentLight,
      padding: '4px 12px', borderRadius: 20,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all .15s',
      userSelect: 'none',
    }}>{label}</span>
  );
}

/* ── Icon Button ── */
function LibraIconBtn({ children, onClick, title, active = false, size = 36 }) {
  const T = LibraTokens;
  return (
    <button onClick={onClick} title={title} style={{
      width: size, height: size, borderRadius: T.radius, border: `1px solid ${T.border}`,
      background: active ? T.accentLight : T.card, color: active ? T.accent : T.textMid,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', transition: 'all .15s', flexShrink: 0, padding: 0,
    }}>{children}</button>
  );
}

/* ── Sidebar ── */
function LibraSidebar({ currentPage, onNavigate, allTags = [], activeTags = [], onToggleTag, onManageTags, shelves = [], onManageShelves, onShelfClick }) {
  const T = LibraTokens;
  const [tagsOpen, setTagsOpen] = React.useState(true);
  const [shelvesOpen, setShelvesOpen] = React.useState(true);
  const items = [
    { id: 'library', label: 'Library', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg> },
    { id: 'shelves', label: 'Shelves', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M4 6v12M20 6v12"/></svg> },
  ];
  return (
    <div style={{
      width: 240, height: '100%', background: T.bg, borderRight: `1px solid ${T.border}`,
      padding: '28px 16px', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'auto',
    }}>
      {/* Logo */}
      <div style={{ fontFamily: T.serif, fontSize: 28, color: T.text, letterSpacing: -0.5, marginBottom: 36, padding: '0 12px' }}>
        Libra
      </div>
      {/* Nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map(item => {
          const active = currentPage === item.id;
          return (
            <div key={item.id} onClick={() => onNavigate(item.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: T.radius,
              background: active ? T.accentLight : 'transparent',
              color: active ? T.accent : T.textMid,
              cursor: 'pointer', transition: 'all .15s', fontFamily: T.sans, fontSize: 14, fontWeight: active ? 600 : 400,
            }}>
              {item.icon}
              {item.label}
            </div>
          );
        })}
      </div>
      {/* Shelves — foldable */}
      <div style={{ marginTop: 32 }}>
        <div onClick={() => setShelvesOpen(!shelvesOpen)} style={{
          fontFamily: T.sans, fontSize: 11, fontWeight: 700, color: T.textLight, textTransform: 'uppercase',
          letterSpacing: 1.2, padding: '0 12px', marginBottom: shelvesOpen ? 10 : 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none',
        }}>
          <span>Shelves</span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={T.textLight} strokeWidth="2" strokeLinecap="round"
            style={{ transform: shelvesOpen ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .2s' }}>
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </div>
        {shelvesOpen && (
          <div>
            {shelves.map((s, i) => (
              <div key={i} onClick={() => onShelfClick ? onShelfClick(s) : onNavigate('shelves')} style={{
                fontFamily: T.sans, fontSize: 13, color: T.textMid, padding: '7px 12px', borderRadius: 6,
                cursor: 'pointer', transition: 'background .12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.accentLighter}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >{s}</div>
            ))}
            {onManageShelves && (
              <div onClick={onManageShelves} style={{
                fontFamily: T.sans, fontSize: 12, color: T.accent, padding: '8px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.accentLighter}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Manage Shelves
              </div>
            )}
          </div>
        )}
      </div>
      {/* Tags — foldable */}
      <div style={{ marginTop: 28 }}>
        <div onClick={() => setTagsOpen(!tagsOpen)} style={{
          fontFamily: T.sans, fontSize: 11, fontWeight: 700, color: T.textLight, textTransform: 'uppercase',
          letterSpacing: 1.2, padding: '0 12px', marginBottom: tagsOpen ? 10 : 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none',
        }}>
          <span>Tags</span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke={T.textLight} strokeWidth="2" strokeLinecap="round"
            style={{ transform: tagsOpen ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform .2s' }}>
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </div>
        {tagsOpen && (
          <div>
            {allTags.map(t => {
              const isActive = activeTags.includes(t);
              return (
                <div key={t} onClick={() => onToggleTag && onToggleTag(t)} style={{
                  fontFamily: T.sans, fontSize: 13, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                  color: isActive ? T.accent : T.textMid, fontWeight: isActive ? 600 : 400,
                  background: isActive ? T.accentLighter : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all .12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.accentLighter; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                      <circle cx="7" cy="7" r="1" fill="currentColor"/>
                    </svg>
                    {t}
                  </span>
                  {isActive && <div style={{ width: 6, height: 6, borderRadius: 3, background: T.accent }} />}
                </div>
              );
            })}
            {onManageTags && (
              <div onClick={onManageTags} style={{
                fontFamily: T.sans, fontSize: 12, color: T.accent, padding: '8px 12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.accentLighter}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Manage Tags
              </div>
            )}
          </div>
        )}
      </div>
      {/* Add book button at bottom */}
      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <button onClick={() => onNavigate('add')} style={{
          width: '100%', padding: '10px 0', borderRadius: T.radius, border: `1.5px dashed ${T.border}`,
          background: 'transparent', color: T.textMid, fontFamily: T.sans, fontSize: 13, fontWeight: 500,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMid; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          Add Book
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { LibraTokens, LibraCover, LibraProgress, LibraStars, LibraTag, LibraIconBtn, LibraSidebar });
