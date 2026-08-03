/* ── Libra: Book Detail Page ── */

function BookDetailPage({ book, onBack, onUpdate, allTags = [], allShelves = [] }) {
  const T = LibraTokens;
  const [coverExpanded, setCoverExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editForm, setEditForm] = React.useState(null);
  const [shelfDropdown, setShelfDropdown] = React.useState(false);
  const shelfDdRef = React.useRef(null);

  React.useEffect(() => {
    if (!shelfDropdown) return;
    const handler = (e) => { if (shelfDdRef.current && !shelfDdRef.current.contains(e.target)) setShelfDropdown(false); };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [shelfDropdown]);

  if (!book) return null;

  const startEdit = () => {
    setEditForm({ title: book.title, author: book.author, pages: book.pages, year: book.year, shelf: book.shelf, tags: [...book.tags], pct: book.pct, blurb: book.blurb || '' });
    setEditing(true);
  };

  const saveEdit = () => {
    onUpdate && onUpdate({ ...book, ...editForm, pages: parseInt(editForm.pages) || book.pages, year: parseInt(editForm.year) || book.year, pct: parseFloat(editForm.pct), blurb: editForm.blurb });
    setEditing(false);
  };

  const notes = [
    { text: 'A beautifully crafted world that rewards slow reading.', page: 84 },
    { text: 'The reveal in this chapter changes everything.', page: 156 },
  ];

  const fieldStyle = {
    width: '100%', height: 36, borderRadius: T.radius, border: `1px solid ${T.border}`,
    background: T.bg, padding: '0 12px', fontFamily: T.sans, fontSize: 13, color: T.text, outline: 'none',
  };

  return (
    <div style={{ flex: 1, padding: '28px 36px', overflow: 'auto', background: T.card }}>
      {/* Back */}
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: T.sans, fontSize: 13, color: T.textLight, padding: 0, marginBottom: 28, transition: 'color .15s',
      }}
      onMouseEnter={e => e.currentTarget.style.color = T.accent}
      onMouseLeave={e => e.currentTarget.style.color = T.textLight}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        Back to Library
      </button>

      <div style={{ display: 'flex', gap: 40 }}>
        {/* Cover — clickable to expand */}
        <div style={{ flexShrink: 0, width: 200 }}>
          <LibraCover bookId={book.id} title={book.title} w={200} h={292}
            onClick={() => setCoverExpanded(true)} />
          {book.blurb && (
            <p style={{
              fontFamily: T.sans, fontSize: 12, color: T.textMid, lineHeight: 1.5,
              marginTop: 14, fontStyle: 'italic', textWrap: 'pretty',
            }}>{book.blurb}</p>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!editing ? (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <h1 style={{ fontFamily: T.serif, fontSize: 34, color: T.text, letterSpacing: -0.5, lineHeight: 1.15, marginBottom: 6 }}>
                  {book.title}
                </h1>
              </div>
              <p style={{ fontFamily: T.sans, fontSize: 16, color: T.textMid, marginBottom: 4 }}>{book.author}</p>
              <p style={{ fontFamily: T.sans, fontSize: 13, color: T.textLight, marginBottom: 16 }}>{book.pages} pages · {book.year}{book.shelf ? ` · ${book.shelf}` : ''}</p>

              <div style={{ marginBottom: 16 }}>
                <LibraStars rating={book.rating} size={18} interactive
                  onChange={r => onUpdate && onUpdate({ ...book, rating: r })} />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
                {book.tags.map(t => <LibraTag key={t} label={t} />)}
              </div>
            </>
          ) : (
            /* ── Edit Mode ── */
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 700, color: T.text }}>Edit Book</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditing(false)} style={{
                    padding: '7px 14px', borderRadius: T.radius, border: `1px solid ${T.border}`,
                    background: T.card, color: T.textMid, fontFamily: T.sans, fontSize: 12, cursor: 'pointer',
                  }}>Cancel</button>
                  <button onClick={saveEdit} style={{
                    padding: '7px 14px', borderRadius: T.radius, border: 'none',
                    background: T.accent, color: '#fff', fontFamily: T.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Save</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 4, display: 'block' }}>Title</label>
                  <input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} style={fieldStyle}
                    onFocus={e => e.target.style.borderColor = T.accent} onBlur={e => e.target.style.borderColor = T.border} />
                </div>
                <div>
                  <label style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 4, display: 'block' }}>Author</label>
                  <input value={editForm.author} onChange={e => setEditForm({ ...editForm, author: e.target.value })} style={fieldStyle}
                    onFocus={e => e.target.style.borderColor = T.accent} onBlur={e => e.target.style.borderColor = T.border} />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 4, display: 'block' }}>Pages</label>
                    <input value={editForm.pages} onChange={e => setEditForm({ ...editForm, pages: e.target.value })} type="number" style={fieldStyle}
                      onFocus={e => e.target.style.borderColor = T.accent} onBlur={e => e.target.style.borderColor = T.border} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 4, display: 'block' }}>Year</label>
                    <input value={editForm.year} onChange={e => setEditForm({ ...editForm, year: e.target.value })} type="number" style={fieldStyle}
                      onFocus={e => e.target.style.borderColor = T.accent} onBlur={e => e.target.style.borderColor = T.border} />
                  </div>
                </div>
                <div>
                  <label style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 4, display: 'block' }}>Shelf</label>
                  <select value={editForm.shelf} onChange={e => setEditForm({ ...editForm, shelf: e.target.value })}
                    style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer' }}>
                    <option value="">No shelf</option>
                    {allShelves.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 6, display: 'block' }}>
                    Progress — {Math.round(editForm.pct * 100)}%
                  </label>
                  <input type="range" min="0" max="1" step="0.01" value={editForm.pct}
                    onChange={e => setEditForm({ ...editForm, pct: parseFloat(e.target.value) })}
                    style={{ width: '100%', accentColor: T.accent }} />
                </div>
                <div>
                  <label style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 6, display: 'block' }}>Blurb / Description</label>
                  <textarea value={editForm.blurb} onChange={e => setEditForm({ ...editForm, blurb: e.target.value })}
                    placeholder="A short description of what this book is about…"
                    rows={3}
                    style={{
                      width: '100%', borderRadius: T.radius, border: `1px solid ${T.border}`,
                      background: T.bg, padding: '10px 12px', fontFamily: T.sans, fontSize: 13, color: T.text,
                      outline: 'none', resize: 'vertical', lineHeight: 1.5, minHeight: 60,
                    }}
                    onFocus={e => e.target.style.borderColor = T.accent}
                    onBlur={e => e.target.style.borderColor = T.border}
                  />
                </div>
                <div>
                  <label style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 6, display: 'block' }}>Tags</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {allTags.map(t => (
                      <LibraTag key={t} label={t} active={editForm.tags.includes(t)}
                        onClick={() => setEditForm(f => ({
                          ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t]
                        }))} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Progress section (view mode only) */}
          {!editing && (
            <div style={{ background: T.bg, borderRadius: T.radius, padding: '20px 24px', marginBottom: 24 }}>
              <div style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, color: T.textLight, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Reading Progress
              </div>
              <LibraProgress pct={book.pct} h={8} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontFamily: T.sans, fontSize: 13, color: T.textMid }}>
                  {Math.round(book.pct * book.pages)} of {book.pages} pages
                </span>
                <span style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.accent }}>
                  {Math.round(book.pct * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          {!editing && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 32 }}>
              <button style={{
                padding: '11px 24px', borderRadius: T.radius, border: 'none',
                background: T.accent, color: '#fff', fontFamily: T.sans, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', transition: 'background .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.accentHover}
              onMouseLeave={e => e.currentTarget.style.background = T.accent}
              >
                {book.pct === 0 ? 'Start Reading' : book.pct < 1 ? 'Continue Reading' : 'Read Again'}
              </button>
              <button onClick={startEdit} style={{
                padding: '11px 24px', borderRadius: T.radius, border: `1.5px solid ${T.border}`,
                background: T.card, color: T.textMid, fontFamily: T.sans, fontSize: 14, fontWeight: 500,
                cursor: 'pointer', transition: 'all .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMid; }}
              >
                Edit Book
              </button>
              <div ref={shelfDdRef} style={{ position: 'relative' }}>
                <button onClick={() => setShelfDropdown(!shelfDropdown)} style={{
                  padding: '11px 24px', borderRadius: T.radius, border: `1.5px solid ${shelfDropdown ? T.accent : T.border}`,
                  background: shelfDropdown ? T.accentLight : T.card, color: shelfDropdown ? T.accent : T.textMid,
                  fontFamily: T.sans, fontSize: 14, fontWeight: 500, cursor: 'pointer', transition: 'all .15s',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={e => { if (!shelfDropdown) { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}}
                onMouseLeave={e => { if (!shelfDropdown) { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textMid; }}}
                >
                  Move to Shelf
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 6l4 4 4-4"/>
                  </svg>
                </button>
                {shelfDropdown && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, minWidth: 200,
                    background: T.card, borderRadius: T.radius, border: `1px solid ${T.border}`,
                    boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 10, padding: 4,
                    animation: 'shelfDdIn .15s ease-out',
                  }}>
                    <style>{`@keyframes shelfDdIn { from { opacity:0; transform: translateY(4px); } to { opacity:1; transform: none; } }`}</style>
                    <div style={{ padding: '6px 10px', fontFamily: T.sans, fontSize: 11, color: T.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Current: {book.shelf || 'None'}
                    </div>
                    {allShelves.filter(s => s !== book.shelf).map(s => (
                      <div key={s} onClick={() => { onUpdate && onUpdate({ ...book, shelf: s }); setShelfDropdown(false); }}
                        style={{
                          padding: '8px 12px', fontFamily: T.sans, fontSize: 13, color: T.text, cursor: 'pointer',
                          borderRadius: 4, transition: 'background .1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = T.accentLighter}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >{s}</div>
                    ))}
                    {book.shelf && (
                      <>
                        <div style={{ margin: '4px 8px', height: 1, background: T.border }} />
                        <div onClick={() => { onUpdate && onUpdate({ ...book, shelf: '' }); setShelfDropdown(false); }}
                          style={{
                            padding: '8px 12px', fontFamily: T.sans, fontSize: 13, color: T.textLight, cursor: 'pointer',
                            borderRadius: 4, transition: 'background .1s', display: 'flex', alignItems: 'center', gap: 8,
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = T.accentLighter}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                          Remove from shelf
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {!editing && (
            <div>
              <div style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, color: T.textLight, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
                Notes & Highlights
              </div>
              {notes.map((n, i) => (
                <div key={i} style={{
                  padding: '14px 18px', background: T.bg, borderRadius: T.radius,
                  borderLeft: `3px solid ${T.accent}`, marginBottom: 10,
                }}>
                  <p style={{ fontFamily: T.sans, fontSize: 13, color: T.text, lineHeight: 1.5, marginBottom: 4 }}>"{n.text}"</p>
                  <span style={{ fontFamily: T.sans, fontSize: 11, color: T.textLight }}>Page {n.page}</span>
                </div>
              ))}
              <button style={{
                padding: '8px 16px', borderRadius: T.radius, border: `1.5px dashed ${T.border}`,
                background: 'transparent', color: T.textLight, fontFamily: T.sans, fontSize: 13,
                cursor: 'pointer', marginTop: 4, transition: 'all .15s', width: '100%',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textLight; }}
              >
                + Add Note
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cover Expanded Lightbox */}
      {coverExpanded && (
        <div onClick={() => setCoverExpanded(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(42,37,32,.6)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, cursor: 'pointer',
          animation: 'coverFadeIn .2s ease-out',
        }}>
          <style>{`@keyframes coverFadeIn { from { opacity:0; } to { opacity:1; } }
            @keyframes coverScaleIn { from { transform: scale(.85); opacity:0; } to { transform: scale(1); opacity:1; } }`}</style>
          <div onClick={e => e.stopPropagation()} style={{ animation: 'coverScaleIn .25s ease-out' }}>
            <LibraCover bookId={book.id} title={book.title} w={480} h={700} />
          </div>
          <button onClick={() => setCoverExpanded(false)} style={{
            position: 'absolute', top: 20, right: 20, width: 36, height: 36, borderRadius: 18,
            border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 20,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { BookDetailPage });
