/* ── Libra: Library Grid Page ── */

function LibraryPage({ books, onBookClick, searchQuery, setSearchQuery, activeTags = [] }) {
  const T = LibraTokens;

  // Parse #tag tokens from search query
  const { textQuery, hashTags } = React.useMemo(() => {
    const parts = searchQuery.split(/\s+/);
    const ht = [];
    const text = [];
    parts.forEach(p => {
      if (p.startsWith('#') && p.length > 1) {
        ht.push(p.slice(1).toLowerCase());
      } else if (p) {
        text.push(p);
      }
    });
    return { textQuery: text.join(' ').toLowerCase(), hashTags: ht };
  }, [searchQuery]);

  // Combine sidebar activeTags with #hash tags (OR logic)
  const allFilterTags = React.useMemo(() => {
    const combined = new Set([...activeTags.map(t => t.toLowerCase()), ...hashTags]);
    return [...combined];
  }, [activeTags, hashTags]);

  const filtered = books.filter(b => {
    const matchQ = !textQuery || b.title.toLowerCase().includes(textQuery) || b.author.toLowerCase().includes(textQuery);
    const matchTag = allFilterTags.length === 0 || b.tags.some(t => allFilterTags.includes(t.toLowerCase()));
    return matchQ && matchTag;
  });

  // Autocomplete suggestions for #
  const allTags = React.useMemo(() => [...new Set(books.flatMap(b => b.tags))].sort(), [books]);
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [cursorTag, setCursorTag] = React.useState('');

  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    // Check if currently typing a #tag
    const words = val.split(/\s+/);
    const last = words[words.length - 1];
    if (last.startsWith('#') && last.length > 0) {
      setCursorTag(last.slice(1).toLowerCase());
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const insertTag = (tagName) => {
    const words = searchQuery.split(/\s+/);
    words[words.length - 1] = '#' + tagName;
    setSearchQuery(words.join(' ') + ' ');
    setShowSuggestions(false);
  };

  const suggestions = allTags.filter(t =>
    t.toLowerCase().startsWith(cursorTag) && !hashTags.includes(t.toLowerCase())
  );

  return (
    <div style={{ flex: 1, padding: '28px 36px', overflow: 'auto', background: T.card }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ fontFamily: T.serif, fontSize: 30, color: T.text, letterSpacing: -0.5 }}>Library</h1>
        <span style={{ fontFamily: T.sans, fontSize: 13, color: T.textLight }}>{filtered.length} books</span>
      </div>

      {/* Search bar with #tag support */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.textLight} strokeWidth="2" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}>
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
        <input value={searchQuery} onChange={handleInputChange}
          placeholder="Search books, authors… or type #tag"
          onFocus={() => { const w = searchQuery.split(/\s+/); const l = w[w.length-1]; if (l.startsWith('#')) setShowSuggestions(true); }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          style={{
            width: '100%', height: 42, borderRadius: T.radius, border: '1px solid rgb(232, 228, 223)',
            background: T.bg, padding: '0px 0px 0px 40px', fontFamily: T.sans, fontSize: 14, color: T.text,
            outline: 'none', transition: 'border-color .15s',
          }}
          onFocusCapture={e => e.target.style.borderColor = T.accent}
          onBlurCapture={e => e.target.style.borderColor = T.border}
        />
        {/* Tag autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 20,
            background: T.card, borderRadius: T.radius, border: `1px solid ${T.border}`,
            boxShadow: '0 8px 24px rgba(0,0,0,.1)', maxHeight: 200, overflow: 'auto',
          }}>
            <div style={{ padding: '8px 12px', fontFamily: T.sans, fontSize: 11, color: T.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Tags
            </div>
            {suggestions.map(t => (
              <div key={t} onMouseDown={() => insertTag(t)} style={{
                padding: '8px 14px', fontFamily: T.sans, fontSize: 13, color: T.text, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.accentLighter}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8" strokeLinecap="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                  <circle cx="7" cy="7" r="1" fill={T.accent}/>
                </svg>
                <span>#{t}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active filter summary */}
      {allFilterTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: T.sans, fontSize: 12, color: T.textLight }}>Filtered by:</span>
          {allFilterTags.map(t => {
            const display = allTags.find(at => at.toLowerCase() === t) || t;
            return (
              <span key={t} style={{
                fontFamily: T.sans, fontSize: 12, fontWeight: 500, color: '#fff', background: T.accent,
                padding: '3px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {display}
              </span>
            );
          })}
          <span style={{ fontFamily: T.sans, fontSize: 11, color: T.textLight, fontStyle: 'italic' }}>(OR)</span>
        </div>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 28 }}>
        {filtered.map(book => (
          <div key={book.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <LibraCover bookId={book.id} title={book.title} w={160} h={232} onClick={() => onBookClick(book.id)}
              style={{ width: '100%' }} />
            <div>
              <div style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.3, marginBottom: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {book.title}
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 12, color: T.textLight, marginBottom: 6 }}>{book.author}</div>
              {book.pct > 0 && book.pct < 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LibraProgress pct={book.pct} />
                  <span style={{ fontFamily: T.sans, fontSize: 11, color: T.textLight, flexShrink: 0 }}>{Math.round(book.pct * 100)}%</span>
                </div>
              )}
              {book.pct === 1 && <LibraStars rating={book.rating} size={12} />}
              {book.pct === 0 && <span style={{ fontFamily: T.sans, fontSize: 11, color: T.textLight, fontStyle: 'italic' }}>Not started</span>}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: T.textLight, fontFamily: T.sans, fontSize: 14 }}>
          No books match your search.
        </div>
      )}
    </div>
  );
}

Object.assign(window, { LibraryPage });
