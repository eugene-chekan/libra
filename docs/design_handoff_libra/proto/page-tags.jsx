/* ── Libra: Tag Management Modal ── */

function TagManagerModal({ onClose, tags, onUpdateTags }) {
  const T = LibraTokens;
  const [localTags, setLocalTags] = React.useState(tags.map(t => ({ name: t, editing: false })));
  const [newTag, setNewTag] = React.useState('');

  const TAG_COLORS = ['#8b5e3c','#5c6b5e','#6b5a7b','#7a5c5c','#5a6878','#8a7a5a','#6a5a4a','#5a7a6a','#7a6a5a','#5e6a7a','#7a5a6a','#6a7a5a'];

  const addTag = () => {
    const name = newTag.trim();
    if (!name || localTags.some(t => t.name.toLowerCase() === name.toLowerCase())) return;
    setLocalTags([...localTags, { name, editing: false }]);
    setNewTag('');
  };

  const removeTag = (idx) => setLocalTags(localTags.filter((_, i) => i !== idx));

  const renameTag = (idx, name) => {
    const updated = [...localTags];
    updated[idx] = { ...updated[idx], name, editing: false };
    setLocalTags(updated);
  };

  const save = () => {
    onUpdateTags(localTags.map(t => t.name));
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(42,37,32,.4)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 440, background: T.card, borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,.2)',
        padding: '28px 28px 20px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        animation: 'tagModalIn .25s ease-out',
      }}>
        <style>{`@keyframes tagModalIn { from { opacity:0; transform: translateY(12px) scale(.98); } to { opacity:1; transform: none; } }`}</style>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: T.serif, fontSize: 22, color: T.text, margin: 0 }}>Manage Tags</h2>
            <p style={{ fontFamily: T.sans, fontSize: 12, color: T.textLight, marginTop: 2 }}>{localTags.length} tags</p>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16, border: 'none', background: T.bg,
            color: T.textMid, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Add new tag */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input value={newTag} onChange={e => setNewTag(e.target.value)}
            placeholder="New tag name…"
            onKeyDown={e => e.key === 'Enter' && addTag()}
            style={{
              flex: 1, height: 38, borderRadius: T.radius, border: `1px solid ${T.border}`,
              background: T.bg, padding: '0 12px', fontFamily: T.sans, fontSize: 13, color: T.text, outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = T.accent}
            onBlur={e => e.target.style.borderColor = T.border}
          />
          <button onClick={addTag} style={{
            height: 38, padding: '0 16px', borderRadius: T.radius, border: 'none',
            background: newTag.trim() ? T.accent : T.border, color: newTag.trim() ? '#fff' : T.textLight,
            fontFamily: T.sans, fontSize: 13, fontWeight: 600, cursor: newTag.trim() ? 'pointer' : 'default',
          }}>Add</button>
        </div>

        {/* Tag list */}
        <div style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}>
          {localTags.map((tag, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px',
              borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: 5, background: TAG_COLORS[i % TAG_COLORS.length], flexShrink: 0 }} />
              {tag.editing ? (
                <input autoFocus defaultValue={tag.name}
                  onBlur={e => renameTag(i, e.target.value || tag.name)}
                  onKeyDown={e => e.key === 'Enter' && renameTag(i, e.target.value || tag.name)}
                  style={{
                    flex: 1, height: 28, borderRadius: 4, border: `1px solid ${T.accent}`,
                    padding: '0 8px', fontFamily: T.sans, fontSize: 13, color: T.text, outline: 'none', background: T.accentLighter,
                  }} />
              ) : (
                <span style={{ flex: 1, fontFamily: T.sans, fontSize: 13, fontWeight: 500, color: T.text }}>{tag.name}</span>
              )}
              {/* Edit */}
              <button onClick={() => {
                const updated = [...localTags];
                updated[i] = { ...updated[i], editing: true };
                setLocalTags(updated);
              }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T.textLight, display: 'flex' }}
              onMouseEnter={e => e.currentTarget.style.color = T.accent}
              onMouseLeave={e => e.currentTarget.style.color = T.textLight}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M15.232 5.232l3.536 3.536M9 11l-6 6v3h3l6-6m2-2l3.536-3.536a2.5 2.5 0 00-3.536-3.536L11 7"/>
                </svg>
              </button>
              {/* Delete */}
              <button onClick={() => removeTag(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T.textLight, display: 'flex' }}
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

Object.assign(window, { TagManagerModal });
