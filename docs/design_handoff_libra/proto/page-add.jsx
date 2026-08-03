/* ── Libra: Add Book Modal ── */

function AddBookModal({ onClose, onAdd }) {
  const T = LibraTokens;
  const [title, setTitle] = React.useState('');
  const [author, setAuthor] = React.useState('');
  const [pages, setPages] = React.useState('');
  const [shelf, setShelf] = React.useState('');
  const [tags, setTags] = React.useState([]);
  const [blurb, setBlurb] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);

  const allTags = ['Sci-Fi', 'Fantasy', 'Literary', 'Mystery', 'Romance', 'Non-Fiction', 'Historical', 'Adventure', 'Classic', 'Short Stories'];

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({
      id: Date.now(),
      title: title.trim(),
      author: author.trim() || 'Unknown Author',
      pages: parseInt(pages) || 200,
      pct: 0, rating: 0, year: 2025,
      tags: tags.length ? tags : ['Uncategorized'],
      shelf,
      blurb: blurb.trim(),
    });
    onClose();
  };

  const fieldStyle = {
    width: '100%', height: 42, borderRadius: T.radius, border: `1px solid ${T.border}`,
    background: T.bg, padding: '0 14px', fontFamily: T.sans, fontSize: 14, color: T.text,
    outline: 'none', transition: 'border-color .15s',
  };

  const labelStyle = {
    fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 6, display: 'block',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(42,37,32,.4)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 480, background: T.card, borderRadius: 12, boxShadow: '0 24px 80px rgba(0,0,0,.2)',
        padding: '32px 32px 24px', maxHeight: '90vh', overflow: 'auto',
        animation: 'modalIn .25s ease-out',
      }}>
        <style>{`@keyframes modalIn { from { opacity:0; transform: translateY(12px) scale(.98); } to { opacity:1; transform: none; } }`}</style>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h2 style={{ fontFamily: T.serif, fontSize: 24, color: T.text }}>Add a Book</h2>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16, border: 'none', background: T.bg,
            color: T.textMid, fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        {/* Upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); }}
          style={{
            border: `2px dashed ${dragOver ? T.accent : T.border}`,
            borderRadius: T.radius, padding: '24px 16px', textAlign: 'center', marginBottom: 24,
            background: dragOver ? T.accentLighter : T.bg, transition: 'all .2s', cursor: 'pointer',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dragOver ? T.accent : T.textLight} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 8 }}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
          <div style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 500, color: dragOver ? T.accent : T.textMid }}>
            Drop an EPUB or PDF here
          </div>
          <div style={{ fontFamily: T.sans, fontSize: 12, color: T.textLight, marginTop: 4 }}>or click to browse</div>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Book title"
              style={fieldStyle}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = T.border} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Author</label>
              <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author name"
                style={fieldStyle}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border} />
            </div>
            <div style={{ width: 100 }}>
              <label style={labelStyle}>Pages</label>
              <input value={pages} onChange={e => setPages(e.target.value)} placeholder="300" type="number"
                style={fieldStyle}
                onFocus={e => e.target.style.borderColor = T.accent}
                onBlur={e => e.target.style.borderColor = T.border} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Shelf</label>
            <select value={shelf} onChange={e => setShelf(e.target.value)}
              style={{ ...fieldStyle, appearance: 'none', cursor: 'pointer' }}>
              <option value="">No shelf</option>
              <option>To Read</option>
              <option>Currently Reading</option>
              <option>Completed</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Blurb / Description <span style={{ fontWeight: 400, color: T.textLight }}>(optional)</span></label>
            <textarea value={blurb} onChange={e => setBlurb(e.target.value)}
              placeholder="A short description of what this book is about…"
              rows={3}
              style={{
                ...fieldStyle, height: 'auto', padding: '10px 14px', resize: 'vertical',
                lineHeight: 1.5, minHeight: 60,
              }}
              onFocus={e => e.target.style.borderColor = T.accent}
              onBlur={e => e.target.style.borderColor = T.border}
            />
          </div>
          <div>
            <label style={labelStyle}>Tags</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {allTags.map(t => (
                <LibraTag key={t} label={t} active={tags.includes(t)}
                  onClick={() => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])} />
              ))}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: 10, marginTop: 28, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '10px 20px', borderRadius: T.radius, border: `1px solid ${T.border}`,
            background: T.card, color: T.textMid, fontFamily: T.sans, fontSize: 14, cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={handleSubmit} style={{
            padding: '10px 24px', borderRadius: T.radius, border: 'none',
            background: title.trim() ? T.accent : T.border,
            color: title.trim() ? '#fff' : T.textLight,
            fontFamily: T.sans, fontSize: 14, fontWeight: 600, cursor: title.trim() ? 'pointer' : 'default',
            transition: 'background .15s',
          }}>Add to Library</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AddBookModal });
