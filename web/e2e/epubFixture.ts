/**
 * Builds a minimal but real EPUB, entirely in memory, for the one e2e spec
 * that has to reach `POST /api/books/upload` — the only endpoint here that
 * reads file bytes rather than JSON. `backend/tests/epub_factory.py` builds
 * the same kind of fixture for the Python suite; this is its TypeScript
 * counterpart, kept self-contained rather than shelling out across the
 * language boundary for one file.
 *
 * Only what `app/epub.py`'s `read_metadata` actually requires: a container
 * pointing at an OPF, and an OPF with a `<metadata>` element. No mimetype
 * member, no manifest content, no spine entries — none of those are read.
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
