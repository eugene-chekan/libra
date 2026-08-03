/* ── Libra: Shelf Management Modal ── */

function ShelfManagerModal({ onClose, shelves, onUpdateShelves, books }) {
  const T = LibraTokens;
  const [localShelves, setLocalShelves] = React.useState(shelves.map(s => ({ name: s, editing: false })));
  const [newShelf, setNewShelf] = React.useState('');

  const bookCounts = {};
  localShelves.forEach(s => { bookCounts[s.name] = books.filter(b => b.shelf === s.name).length; });

  const addShelf = () => {
    const name = newShelf.trim();
    if (!name || localShelves.some(s => s.name.toLowerCase() === name.toLowerCase())) return;
    setLocalShelves([...localShelves, { name, editing: false }]);
    setNewShelf('');
  };

  const removeShelf = (idx) => {
    if (bookCounts[localShelves[idx].name] > 0) {
      if (!confirm(`Move ${bookCounts[localShelves[idx].name]} book(s) to "To Read" and delete this shelf?`)) return;
    }
    setLocalShelves(localShelves.filter((_, i) => i !== idx));
  };

  const renameShelf = (idx, name) => {
    if (!name.trim()) return;
    const updated = [...localShelves];
    updated[idx] = { ...updated[idx], name: name.trim(), editing: false };
    setLocalShelves(updated);
  };

  const moveShelf = (idx, dir) => {
    const next = [...localShelves];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setLocalShelves(next);
  };

  const save = () => {
    const oldNames = shelves;
    const newNames = localShelves.map(s => s.name);
    // Build rename map
    const renameMap = {};
    oldNames.forEach((old, i) => {
      if (i < newNames.length && old !== newNames[i]) {
        // Try to find the old name still present — if not, it was renamed
      }
    });
    onUpdateShelves(newNames, localShelves.map(s => s.name));
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(42,37,32,.4)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 460, background: T.card, borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,.2)',
        padding: '28px 28px 20px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        animation: 'shelfModalIn .25s ease-out',
      }}>
        <style>{`@keyframes shelfModalIn { from { opacity:0; transform: translateY(12px) scale(.98); } to { opacity:1; transform: none; } }`}</style>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: T.serif, fontSize: 22, color: T.text, margin: 0 }}>Manage Shelves</h2>
            <p style={{ fontFamily: T.sans, fontSize: 12, color: T.textLight, marginTop: 2 }}>{localShelves.length} shelves · Drag to reorder</p>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16, border: 'none', background: T.bg,
            color: T.textMid, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Add new shelf */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={newShelf} onChange={e => setNewShelf(e.target.value)}
            placeholder="New shelf name…"
            onKeyDown={e => e.key === 'Enter' && addShelf()}
            style={{
              flex: 1, height: 38, borderRadius: T.radius, border: `1px solid ${T.border}`,
              background: T.bg, padding: '0 12px', fontFamily: T.sans, fontSize: 13, color: T.text, outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border}
          />
          <button onClick={addShelf} style={{
            height: 38, padding: '0 16px', borderRadius: T.radius, border: 'none',
            background: newShelf.trim() ? T.accent : T.border, color: newShelf.trim() ? '#fff' : T.textLight,
            fontFamily: T.sans, fontSize: 13, fontWeight: 600, cursor: newShelf.trim() ? 'pointer' : 'default',
          }}>Add</button>
        </div>

        {/* Shelf list */}
        <div style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}>
          {localShelves.map((shelf, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px',
              borderBottom: `1px solid ${T.border}`, borderRadius: 4,
            }}>
              {/* Reorder arrows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
                <button onClick={() => moveShelf(i, -1)} disabled={i === 0} style={{
                  background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', padding: 0,
                  color: i === 0 ? T.border : T.textLight, fontSize: 10, lineHeight: 1, display: 'flex',
                }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 10l4-4 4 4"/></svg>
                </button>
                <button onClick={() => moveShelf(i, 1)} disabled={i === localShelves.length - 1} style={{
                  background: 'none', border: 'none', cursor: i === localShelves.length - 1 ? 'default' : 'pointer', padding: 0,
                  color: i === localShelves.length - 1 ? T.border : T.textLight, fontSize: 10, lineHeight: 1, display: 'flex',
                }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6l4 4 4-4"/></svg>
                </button>
              </div>

              {/* Name */}
              {shelf.editing ? (
                <input autoFocus defaultValue={shelf.name}
                  onBlur={e => renameShelf(i, e.target.value || shelf.name)}
                  onKeyDown={e => e.key === 'Enter' && renameShelf(i, e.target.value || shelf.name)}
                  style={{
                    flex: 1, height: 28, borderRadius: 4, border: `1px solid ${T.accent}`,
                    padding: '0 8px', fontFamily: T.sans, fontSize: 13, color: T.text, outline: 'none', background: T.accentLighter,
                  }} />
              ) : (
                <span style={{ flex: 1, fontFamily: T.sans, fontSize: 13, fontWeight: 500, color: T.text }}>{shelf.name}</span>
              )}

              {/* Book count badge */}
              <span style={{
                fontFamily: T.sans, fontSize: 11, color: T.textLight, background: T.bg,
                padding: '2px 8px', borderRadius: 10, flexShrink: 0,
              }}>{bookCounts[shelf.name] || 0}</span>

              {/* Edit */}
              <button onClick={() => {
                const updated = [...localShelves];
                updated[i] = { ...updated[i], editing: true };
                setLocalShelves(updated);
              }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T.textLight, display: 'flex' }}
              onMouseEnter={e => e.currentTarget.style.color = T.accent}
              onMouseLeave={e => e.currentTarget.style.color = T.textLight}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15.232 5.232l3.536 3.536M9 11l-6 6v3h3l6-6m2-2l3.536-3.536a2.5 2.5 0 00-3.536-3.536L11 7"/>
                </svg>
              </button>

              {/* Delete */}
              <button onClick={() => removeShelf(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T.textLight, display: 'flex' }}
              onMouseEnter={e => e.currentTarget.style.color = '#c44'}
              onMouseLeave={e => e.currentTarget.style.color = T.textLight}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', borderRadius: T.radius, border: `1px solid ${T.border}`,
            background: T.card, color: T.textMid, fontFamily: T.sans, fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={save} style={{
            padding: '10px 24px', borderRadius: T.radius, border: 'none',
            background: T.accent, color: '#fff', fontFamily: T.sans, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ShelfManagerModal });
