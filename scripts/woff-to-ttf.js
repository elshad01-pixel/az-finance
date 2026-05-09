// Converts a WOFF 1.0 font to TTF/SFNT format
// Usage: node scripts/woff-to-ttf.js input.woff output.ttf

const fs   = require('fs')
const zlib = require('zlib')

const [,, src, dst] = process.argv
if (!src || !dst) { console.error('Usage: node woff-to-ttf.js input.woff output.ttf'); process.exit(1) }

const woff = fs.readFileSync(src)

const sig = woff.readUInt32BE(0)
if (sig !== 0x774F4646) { console.error('Not a WOFF file'); process.exit(1) }

const flavor    = woff.readUInt32BE(4)
const numTables = woff.readUInt16BE(12)

// Parse WOFF table directory (starts at byte 44, 20 bytes per entry)
const tables = []
for (let i = 0; i < numTables; i++) {
  const base        = 44 + i * 20
  const tag         = woff.slice(base, base + 4).toString('latin1')
  const woffOffset  = woff.readUInt32BE(base + 4)
  const compLength  = woff.readUInt32BE(base + 8)
  const origLength  = woff.readUInt32BE(base + 12)
  const checksum    = woff.readUInt32BE(base + 16)

  const compressed  = woff.slice(woffOffset, woffOffset + compLength)
  const data        = compLength < origLength
    ? zlib.inflateSync(compressed)
    : Buffer.from(compressed)

  tables.push({ tag, data, origLength, checksum })
}

// Sort by tag (required by SFNT spec)
tables.sort((a, b) => a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0)

// SFNT header values
const maxPow2      = Math.pow(2, Math.floor(Math.log2(numTables)))
const searchRange  = maxPow2 * 16
const entrySelector = Math.log2(maxPow2)
const rangeShift   = numTables * 16 - searchRange

// Build SFNT header (12 bytes)
const sfntHeader = Buffer.alloc(12)
sfntHeader.writeUInt32BE(flavor, 0)
sfntHeader.writeUInt16BE(numTables, 4)
sfntHeader.writeUInt16BE(searchRange, 6)
sfntHeader.writeUInt16BE(entrySelector, 8)
sfntHeader.writeUInt16BE(rangeShift, 10)

// Build table directory (16 bytes × numTables) and collect table data
const tableDir = Buffer.alloc(numTables * 16)
const dataParts = [sfntHeader, tableDir]
let dataOffset = 12 + numTables * 16

for (let i = 0; i < tables.length; i++) {
  const { tag, data, origLength, checksum } = tables[i]

  tableDir.write(tag, i * 16, 4, 'latin1')
  tableDir.writeUInt32BE(checksum,   i * 16 + 4)
  tableDir.writeUInt32BE(dataOffset, i * 16 + 8)
  tableDir.writeUInt32BE(origLength, i * 16 + 12)

  // Pad to 4-byte boundary
  const padded = Math.ceil(origLength / 4) * 4
  const buf    = Buffer.alloc(padded, 0)
  data.copy(buf, 0, 0, Math.min(data.length, origLength))
  dataParts.push(buf)
  dataOffset += padded
}

const result = Buffer.concat(dataParts)
fs.writeFileSync(dst, result)
console.log(`${src} (${woff.length} B) → ${dst} (${result.length} B)`)
