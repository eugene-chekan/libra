/**
 * Builds a minimal but real EPUB, entirely in memory, for the one e2e spec
 * that has to reach `POST /api/books/upload` — the only endpoint here that
 * reads file bytes rather than JSON. `backend/tests/epub_factory.py` builds
 * the same kind of fixture for the Python suite; this is its TypeScript
 * counterpart, kept self-contained rather than shelling out across the
 * language boundary for one file.
 *
 * `buildMinimalEpub` carries only what `app/epub.py`'s `read_metadata` requires: a container
 * pointing at an OPF, and an OPF with a `<metadata>` element. No mimetype member, no manifest
 * content, no spine entries — the upload endpoint reads none of them.
 *
 * `buildReadableEpub` adds all three, because epub.js in the browser does read them.
 */

const CRC_TABLE = buildCrcTable()

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  name: string
  data: Buffer
}

/** A stored (uncompressed) zip — enough for `zipfile.is_zipfile`/`testzip` to accept it. */
function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // local file header signature
    local.writeUInt16LE(20, 4) // version needed to extract
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(0, 8) // method: stored
    local.writeUInt16LE(0, 10) // mod time
    local.writeUInt16LE(0, 12) // mod date
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18) // compressed size
    local.writeUInt32LE(size, 22) // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28) // extra field length
    localParts.push(local, nameBuf, entry.data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // central directory header signature
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0, 8) // flags
    central.writeUInt16LE(0, 10) // method
    central.writeUInt16LE(0, 12) // mod time
    central.writeUInt16LE(0, 14) // mod date
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(size, 20)
    central.writeUInt32LE(size, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30) // extra field length
    central.writeUInt16LE(0, 32) // comment length
    central.writeUInt16LE(0, 34) // disk number start
    central.writeUInt16LE(0, 36) // internal attributes
    central.writeUInt32LE(0, 38) // external attributes
    central.writeUInt32LE(offset, 42) // offset of local header
    centralParts.push(central, nameBuf)

    offset += local.length + nameBuf.length + entry.data.length
  }

  const centralDir = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // end of central directory signature
  end.writeUInt16LE(0, 4) // disk number
  end.writeUInt16LE(0, 6) // disk with central directory
  end.writeUInt16LE(entries.length, 8) // entries on this disk
  end.writeUInt16LE(entries.length, 10) // total entries
  end.writeUInt32LE(centralDir.length, 12)
  end.writeUInt32LE(offset, 16) // central directory offset
  end.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...localParts, centralDir, end])
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`

function opfXml({ title, author }: { title: string; author: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:identifier id="bookid">urn:uuid:e2e-fixture</dc:identifier>
  </metadata>
  <manifest/>
  <spine/>
</package>`
}

/** A real, parseable EPUB with the given title and author. */
export function buildMinimalEpub({ title, author }: { title: string; author: string }): Buffer {
  return buildZip([
    { name: 'META-INF/container.xml', data: Buffer.from(CONTAINER_XML, 'utf8') },
    { name: 'content.opf', data: Buffer.from(opfXml({ title, author }), 'utf8') },
  ])
}

/** A zip with no `META-INF/container.xml` — a real archive, but not a usable EPUB. */
export function buildMalformedEpub(): Buffer {
  return buildZip([{ name: 'readme.txt', data: Buffer.from('not an epub', 'utf8') }])
}

function chapterXhtml(label: string, index: number): string {
  const paragraphs = Array.from(
    { length: 12 },
    (_, n) => `<p>${label}, paragraph ${n + 1}. Something happens, at some length.</p>`
  ).join('\n    ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>${label}</title></head>
  <body>
    <h1 id="chapter-${index}">${label}</h1>
    ${paragraphs}
  </body>
</html>`
}

function navXhtml(labels: string[]): string {
  const items = labels
    .map((label, index) => `<li><a href="chapter${index + 1}.xhtml">${label}</a></li>`)
    .join('\n        ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <ol>
        ${items}
      </ol>
    </nav>
  </body>
</html>`
}

function readableOpfXml(title: string, author: string, labels: string[]): string {
  const manifest = [
    `<item id="front" href="titlepage.xhtml" media-type="application/xhtml+xml"/>`,
    ...labels.map(
      (_, index) =>
        `<item id="ch${index + 1}" href="chapter${index + 1}.xhtml" ` +
        `media-type="application/xhtml+xml"/>`
    ),
  ].join('\n    ')
  const spine = [
    `<itemref idref="front"/>`,
    ...labels.map((_, index) => `<itemref idref="ch${index + 1}"/>`),
  ].join('\n    ')
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">urn:uuid:e2e-readable</dc:identifier>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`
}

/**
 * An EPUB the reader can actually open: a real spine, real chapter documents, and a navigation
 * document for the contents drawer. `buildMinimalEpub` deliberately has none of those, because
 * the upload endpoint never reads them — epub.js in the browser does.
 */
export function buildReadableEpub({
  title,
  author,
  chapters,
}: {
  title: string
  author: string
  chapters: string[]
}): Buffer {
  return buildZip([
    { name: 'META-INF/container.xml', data: Buffer.from(CONTAINER_XML, 'utf8') },
    { name: 'content.opf', data: Buffer.from(readableOpfXml(title, author, chapters), 'utf8') },
    { name: 'nav.xhtml', data: Buffer.from(navXhtml(chapters), 'utf8') },
    // Front matter, first in the spine and absent from the contents — the shape of a real
    // book, and the reason a contents entry's position is not its spine position.
    { name: 'titlepage.xhtml', data: Buffer.from(chapterXhtml(title, 0), 'utf8') },
    ...chapters.map((label, index) => ({
      name: `chapter${index + 1}.xhtml`,
      data: Buffer.from(chapterXhtml(label, index + 1), 'utf8'),
    })),
  ])
}
