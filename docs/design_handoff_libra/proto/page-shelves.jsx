/* ── Libra: Shelves Page ── */

function ShelvesPage({ books, onBookClick, shelves = ['Currently Reading', 'To Read', 'Completed'] }) {
  const T = LibraTokens;
  const grouped = {};
  shelves.forEach(s => grouped[s] = []);
  books.forEach(b => { if (grouped[b.shelf]) grouped[b.shelf].push(b); });

  return (
    <div style={{ flex: 1, padding: '28px 36px', overflow: 'auto', background: T.card }}>
      <h1 style={{ fontFamily: T.serif, fontSize: 30, color: T.text, letterSpacing: -0.5, marginBottom: 32 }}>Shelves</h1>

      {shelves.map(shelfName => {
        const shelfBooks = grouped[shelfName];
        return (
          <div key={shelfName} style={{ marginBottom: 44 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
              <span style={{ fontFamily: T.serif, fontSize: 22, color: T.text }}>{shelfName}</span>
              <span style={{ fontFamily: T.sans, fontSize: 13, color: T.textLight }}>{shelfBooks.length} books</span>
            </div>
            {shelfBooks.length > 0 ? (
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 20, paddingBottom: 16 }}>
                  {shelfBooks.map(book => (
                    <div key={book.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 100, flexShrink: 0 }}>
                      <LibraCover bookId={book.id} title={book.title} w={96} h={140} onClick={() => onBookClick(book.id)} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          fontFamily: T.sans, fontSize: 11, fontWeight: 500, color: T.text, lineHeight: 1.3,
                          overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        }}>{book.title}</div>
                        {book.pct > 0 && book.pct < 1 && (
                          <div style={{ marginTop: 4 }}><LibraProgress pct={book.pct} w={70} h={3} /></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Shelf line */}
                <div style={{ height: 3, background: `linear-gradient(90deg, ${T.accent}44, ${T.border})`, borderRadius: 2 }} />
                <div style={{ height: 8, background: `linear-gradient(180deg, rgba(0,0,0,.04), transparent)`, borderRadius: '0 0 4px 4px' }} />
              </div>
            ) : (
              <div style={{
                padding: '32px 0', textAlign: 'center', border: `1.5px dashed ${T.border}`, borderRadius: T.radius,
                fontFamily: T.sans, fontSize: 13, color: T.textLight,
              }}>No books on this shelf yet</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { ShelvesPage });
