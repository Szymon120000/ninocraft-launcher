const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const S = 256
const R = 52

function inHeart(x, y) {
  const hx = (x / S) * 3.0 - 1.5
  const hy = (y / S) * 3.0 - 1.35
  const v = Math.pow(hx * hx + hy * hy - 1, 3) - hx * hx * hy * hy * hy
  return v <= 0
}

function cornerAlpha(x, y) {
  const corners = [
    [R - 0.5, R - 0.5],
    [S - R - 0.5, R - 0.5],
    [R - 0.5, S - R - 0.5],
    [S - R - 0.5, S - R - 0.5]
  ]
  for (const [cx, cy] of corners) {
    if (Math.sign(x - cx) !== Math.sign(S / 2 - cx) && Math.sign(y - cy) !== Math.sign(S / 2 - cy)) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy > R * R) return 0
    }
  }
  return 255
}

const raw = Buffer.alloc((S * 4 + 1) * S)
for (let y = 0; y < S; y++) {
  const row = y * (S * 4 + 1)
  raw[row] = 0
  const t = y / S
  const top = [0xff, 0x5e, 0x7e]
  const bot = [0xe8, 0x43, 0x6b]
  const gr = Math.round(top[0] + (bot[0] - top[0]) * t)
  const gg = Math.round(top[1] + (bot[1] - top[1]) * t)
  const gb = Math.round(top[2] + (bot[2] - top[2]) * t)
  for (let x = 0; x < S; x++) {
    const o = row + 1 + x * 4
    const a = cornerAlpha(x, y)
    raw[o] = gr
    raw[o + 1] = gg
    raw[o + 2] = gb
    raw[o + 3] = a
    if (a === 0) continue
    if (inHeart(x, y)) {
      raw[o] = 0xff
      raw[o + 1] = 0xff
      raw[o + 2] = 0xff
    }
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(S, 0)
ihdr.writeUInt32BE(S, 4)
ihdr[8] = 8
ihdr[9] = 6

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const out = path.join(__dirname, '..', 'build', 'icon.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, png)
console.log('icon written:', out, png.length, 'bytes')