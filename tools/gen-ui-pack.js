const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const AdmZip = require(path.join(__dirname, '..', 'node_modules', 'adm-zip'))

const GAME_JAR = process.argv[2] || 'C:/Users/MCServer/AppData/Roaming/.minecraft/versions/fabric-loader-0.19.3-1.21.11/fabric-loader-0.19.3-1.21.11.jar'
const OUT = path.join(__dirname, '..', 'ui-pack')
const BG_DIR = path.join(__dirname, 'backgrounds')
const zip = new AdmZip(GAME_JAR)

const CRCT = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t })()
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRCT[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0 }
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0); t.copy(out, 4); data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4) }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png')
  let w, h, idat = [], bit, color, palette = null, trns = null
  let off = 8
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8); const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bit = data[8]; color = data[9] }
    else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') trns = data
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  const channels = [1, 0, 3, 1, 2, 0, 4][color]
  if (!channels) throw new Error('unsupported png color type ' + color)
  const bitsPerPx = channels * bit
  const rowBytes = Math.ceil(w * bitsPerPx / 8)
  const bpp = Math.max(1, Math.ceil(bitsPerPx / 8))
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const dec = Buffer.alloc(rowBytes * h)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (rowBytes + 1)]
    const row = dec.subarray(y * rowBytes, (y + 1) * rowBytes)
    const prev = y > 0 ? dec.subarray((y - 1) * rowBytes, y * rowBytes) : null
    for (let x = 0; x < rowBytes; x++) {
      const v = raw[y * (rowBytes + 1) + 1 + x]
      const a = x >= bpp ? row[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0
      let p
      if (f === 0) p = v
      else if (f === 1) p = v + a
      else if (f === 2) p = v + b
      else if (f === 3) p = v + ((a + b) >> 1)
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - c - c); p = v + ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)) }
      else throw new Error('bad filter ' + f)
      row[x] = p & 0xFF
    }
  }
  const out = Buffer.alloc(w * h * 4)
  const mask = (1 << bit) - 1
  const scale = bit < 8 ? 255 / mask : 1
  for (let y = 0; y < h; y++) {
    const rowBase = y * rowBytes
    for (let x = 0; x < w; x++) {
      const vals = new Array(channels)
      for (let chn = 0; chn < channels; chn++) {
        const bitPos = (x * channels + chn) * bit
        let v
        if (bit === 16) { const bi = rowBase + (bitPos >> 3); v = (dec[bi] << 8) | dec[bi + 1] }
        else if (bit === 8) v = dec[rowBase + (bitPos >> 3)]
        else { const bi = rowBase + (bitPos >> 3); const rem = 8 - bit - (bitPos & 7); v = (dec[bi] >> rem) & mask }
        vals[chn] = bit === 16 ? (v >> 8) : (color === 3 ? v : Math.round(v * scale))
      }
      const o = (y * w + x) * 4
      if (color === 0) { out[o] = vals[0]; out[o + 1] = vals[0]; out[o + 2] = vals[0]; out[o + 3] = 255 }
      else if (color === 2) { out[o] = vals[0]; out[o + 1] = vals[1]; out[o + 2] = vals[2]; out[o + 3] = 255 }
      else if (color === 4) { out[o] = vals[0]; out[o + 1] = vals[0]; out[o + 2] = vals[0]; out[o + 3] = vals[1] }
      else if (color === 6) { out[o] = vals[0]; out[o + 1] = vals[1]; out[o + 2] = vals[2]; out[o + 3] = vals[3] }
      else if (color === 3) {
        const idx = vals[0]
        out[o] = palette[idx * 3]; out[o + 1] = palette[idx * 3 + 1]; out[o + 2] = palette[idx * 3 + 2]
        out[o + 3] = (trns && idx < trns.length) ? trns[idx] : 255
      }
    }
  }
  return { w, h, data: out }
}

const canvas = (w, h) => ({ w, h, data: Buffer.alloc(w * h * 4) })
function px(c, x, y, col, a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return
  const i = (y * c.w + x) * 4
  c.data[i] = col[0]; c.data[i + 1] = col[1]; c.data[i + 2] = col[2]; c.data[i + 3] = a
}
function fillRect(c, x0, y0, x1, y1, col, a) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) px(c, x, y, col, a) }
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] }
function vgrad(c, top, bot) { for (let y = 0; y < c.h; y++) { const t = y / (c.h - 1); const col = lerp(top, bot, t); fillRect(c, 0, y, c.w - 1, y, col, 255) } }
const written = new Set()
function write(c, rel) { written.add(rel); const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, encodePNG(c.w, c.h, c.data)) }
function copyFromJar(rel) { const e = zip.getEntry('assets/minecraft/' + rel); if (!e) return null; const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, e.getData()); return true }

function resize(img, nw, nh) {
  const c = canvas(nw, nh)
  for (let y = 0; y < nh; y++) {
    const sy = ((y + 0.5) * img.h / nh) - 0.5
    for (let x = 0; x < nw; x++) {
      const sx = ((x + 0.5) * img.w / nw) - 0.5
      const x0 = Math.max(0, Math.min(img.w - 1, Math.floor(sx))), x1 = Math.min(img.w - 1, x0 + 1)
      const y0 = Math.max(0, Math.min(img.h - 1, Math.floor(sy))), y1 = Math.min(img.h - 1, y0 + 1)
      const fx = sx - x0, fy = sy - y0
      for (let ch = 0; ch < 4; ch++) {
        const a = img.data[(y0 * img.w + x0) * 4 + ch], b = img.data[(y0 * img.w + x1) * 4 + ch]
        const c1 = img.data[(y1 * img.w + x0) * 4 + ch], d = img.data[(y1 * img.w + x1) * 4 + ch]
        c.data[(y * nw + x) * 4 + ch] = Math.round(a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c1 * (1 - fx) * fy + d * fx * fy)
      }
    }
  }
  return c
}

function squareCrop(img, variant) {
  const side = Math.min(img.w, img.h)
  let x = (img.w - side) / 2
  let y = (img.h - side) / 2
  const room = Math.max(img.w - side, img.h - side)
  if (room > 0) {
    const off = room * (0.45 * (variant ? 1 : -1))
    if (img.w > img.h) x = Math.max(0, Math.min(img.w - side, x + off))
    else y = Math.max(0, Math.min(img.h - side, y + off))
  }
  const c = canvas(side, side)
  for (let yy = 0; yy < side; yy++) for (let xx = 0; xx < side; xx++) {
    const i = ((y + yy) * img.w + (x + xx)) * 4
    const j = (yy * side + xx) * 4
    c.data[j] = img.data[i]; c.data[j + 1] = img.data[i + 1]; c.data[j + 2] = img.data[i + 2]; c.data[j + 3] = img.data[i + 3]
  }
  return c
}

const C = {
  ACC: [232, 67, 107], ACC_HI: [255, 94, 126], ACC_HI2: [255, 143, 165],
  DARK: [178, 39, 74], DARKER: [143, 31, 59], DESAT: [104, 66, 78],
  LIGHT: [255, 217, 226], LIGHTER: [255, 227, 236], WHITE: [255, 240, 245],
  MID: [255, 179, 198], TEXT: [122, 74, 89]
}

fs.rmSync(OUT, { recursive: true, force: true })

const bgs = []
for (let i = 0; i < 3; i++) {
  const f = path.join(BG_DIR, `bg-${i}.png`)
  if (fs.existsSync(f)) bgs.push(decodePNG(fs.readFileSync(f)))
}
if (bgs.length) {
  const src = bgs[0]
  for (let n = 0; n < 6; n++) {
    const face = resize(squareCrop(src, 0), 1024, 1024)
    write(face, `assets/minecraft/textures/gui/title/background/panorama_${n}.png`)
  }
  console.log('panorama: static, all faces from bg-0')
} else {
  for (let n = 0; n < 6; n++) {
    const c = canvas(1024, 1024)
    vgrad(c, lerp(C.MID, C.WHITE, n / 7), lerp(C.LIGHT, C.ACC, n / 7))
    write(c, `assets/minecraft/textures/gui/title/background/panorama_${n}.png`)
  }
  console.log('panorama: no background images found, using gradient')
}
const ov = canvas(1, 1)
fillRect(ov, 0, 0, 0, 0, C.DARK, 78)
write(ov, 'assets/minecraft/textures/gui/title/background/panorama_overlay.png')

function buttonSprite(hi, dis) {
  const c = canvas(200, 20)
  const top = dis ? [217, 168, 180] : hi ? C.ACC : C.DARK
  const bot = dis ? [196, 140, 156] : hi ? C.ACC_HI : C.ACC
  vgrad(c, top, bot)
  fillRect(c, 0, 0, 199, 0, dis ? C.DESAT : hi ? C.ACC_HI2 : C.DARKER, 255)
  fillRect(c, 0, 19, 199, 19, dis ? C.DESAT : hi ? C.ACC : C.DARKER, 255)
  fillRect(c, 0, 0, 0, 19, dis ? C.DESAT : hi ? C.ACC_HI2 : C.DARKER, 255)
  fillRect(c, 199, 0, 199, 19, dis ? C.DESAT : hi ? C.ACC : C.DARKER, 255)
  fillRect(c, 2, 2, 197, 2, dis ? [235, 200, 210] : hi ? [255, 190, 205] : C.ACC_HI2, 120)
  return c
}
write(buttonSprite(false, false), 'assets/minecraft/textures/gui/sprites/widget/button.png')
write(buttonSprite(true, false), 'assets/minecraft/textures/gui/sprites/widget/button_highlighted.png')
write(buttonSprite(false, true), 'assets/minecraft/textures/gui/sprites/widget/button_disabled.png')

function textFieldSprite(hi) {
  const c = canvas(200, 20)
  fillRect(c, 0, 0, 199, 19, [110, 24, 50], 235)
  fillRect(c, 1, 1, 198, 18, [150, 34, 66], 230)
  fillRect(c, 0, 0, 199, 0, hi ? C.ACC_HI2 : [255, 200, 214], 255)
  fillRect(c, 199, 0, 199, 19, hi ? C.ACC_HI2 : [255, 200, 214], 255)
  fillRect(c, 0, 0, 0, 19, hi ? C.ACC_HI2 : [255, 200, 214], 255)
  fillRect(c, 0, 19, 199, 19, [70, 14, 34], 255)
  return c
}
write(textFieldSprite(false), 'assets/minecraft/textures/gui/sprites/widget/text_field.png')
write(textFieldSprite(true), 'assets/minecraft/textures/gui/sprites/widget/text_field_highlighted.png')

function sliderSprite(hi) {
  const c = canvas(200, 20)
  vgrad(c, hi ? [255, 150, 175] : C.LIGHT, hi ? C.MID : [255, 198, 212])
  fillRect(c, 0, 0, 199, 0, C.DARK, 255)
  fillRect(c, 0, 19, 199, 19, C.DARK, 255)
  fillRect(c, 0, 0, 0, 19, C.DARK, 255)
  fillRect(c, 199, 0, 199, 19, C.DARK, 255)
  fillRect(c, 5, 8, 12, 11, hi ? C.ACC_HI2 : C.ACC, 255)
  return c
}
write(sliderSprite(false), 'assets/minecraft/textures/gui/sprites/widget/slider.png')
write(sliderSprite(true), 'assets/minecraft/textures/gui/sprites/widget/slider_highlighted.png')

function sliderHandle(hi) {
  const c = canvas(8, 20)
  vgrad(c, hi ? C.ACC_HI2 : C.ACC_HI, C.ACC)
  fillRect(c, 0, 0, 7, 0, hi ? [255, 210, 220] : [255, 190, 205], 255)
  fillRect(c, 7, 0, 7, 19, C.DARKER, 255)
  fillRect(c, 0, 0, 0, 19, C.DARKER, 255)
  fillRect(c, 0, 19, 7, 19, C.DARKER, 255)
  return c
}
write(sliderHandle(false), 'assets/minecraft/textures/gui/sprites/widget/slider_handle.png')
write(sliderHandle(true), 'assets/minecraft/textures/gui/sprites/widget/slider_handle_highlighted.png')

function checkSprite(sel, hi) {
  const c = canvas(20, 20)
  const fill = sel ? (hi ? [255, 110, 140] : C.ACC) : hi ? [255, 245, 248] : C.WHITE
  fillRect(c, 2, 2, 17, 17, fill, 255)
  fillRect(c, 1, 1, 18, 1, hi ? C.ACC_HI : C.DARK, 255)
  fillRect(c, 1, 18, 18, 18, hi ? C.ACC_HI : C.DARK, 255)
  fillRect(c, 1, 1, 1, 18, hi ? C.ACC_HI : C.DARK, 255)
  fillRect(c, 18, 1, 18, 18, hi ? C.ACC_HI : C.DARK, 255)
  if (sel) {
    fillRect(c, 6, 10, 8, 12, [255, 255, 255], 255)
    fillRect(c, 8, 12, 9, 13, [255, 255, 255], 255)
    fillRect(c, 9, 7, 11, 9, [255, 255, 255], 255)
    fillRect(c, 11, 5, 13, 7, [255, 255, 255], 255)
  }
  return c
}
write(checkSprite(false, false), 'assets/minecraft/textures/gui/sprites/widget/checkbox.png')
write(checkSprite(false, true), 'assets/minecraft/textures/gui/sprites/widget/checkbox_highlighted.png')
write(checkSprite(true, false), 'assets/minecraft/textures/gui/sprites/widget/checkbox_selected.png')
write(checkSprite(true, true), 'assets/minecraft/textures/gui/sprites/widget/checkbox_selected_highlighted.png')

function tabSprite(sel, hi) {
  const c = canvas(130, 24)
  vgrad(c, sel ? (hi ? C.ACC_HI : C.ACC) : hi ? [255, 190, 205] : C.LIGHT, sel ? (hi ? C.ACC_HI2 : C.ACC_HI) : hi ? C.LIGHT : [255, 200, 212])
  fillRect(c, 0, 0, 129, 0, sel ? C.ACC_HI2 : C.DARKER, 255)
  fillRect(c, 0, 1, 129, 1, sel ? C.ACC_HI2 : C.ACC, 200)
  fillRect(c, 0, 0, 0, 23, C.DARKER, 255)
  fillRect(c, 129, 0, 129, 23, C.DARKER, 255)
  return c
}
write(tabSprite(false, false), 'assets/minecraft/textures/gui/sprites/widget/tab.png')
write(tabSprite(false, true), 'assets/minecraft/textures/gui/sprites/widget/tab_highlighted.png')
write(tabSprite(true, false), 'assets/minecraft/textures/gui/sprites/widget/tab_selected.png')
write(tabSprite(true, true), 'assets/minecraft/textures/gui/sprites/widget/tab_selected_highlighted.png')

function scroller(hi) {
  const c = canvas(6, 32)
  vgrad(c, hi ? C.ACC_HI2 : C.ACC_HI, C.ACC)
  fillRect(c, 0, 0, 5, 0, [255, 200, 214], 255)
  fillRect(c, 0, 0, 0, 31, C.DARKER, 255)
  fillRect(c, 5, 0, 5, 31, C.DARKER, 255)
  fillRect(c, 0, 31, 5, 31, C.DARKER, 255)
  return c
}
write(scroller(false), 'assets/minecraft/textures/gui/sprites/widget/scroller.png')
const sc = canvas(6, 32)
fillRect(sc, 0, 0, 5, 31, [160, 50, 84], 60)
fillRect(sc, 0, 0, 5, 0, [255, 143, 165], 90)
fillRect(sc, 0, 31, 5, 31, [90, 20, 45], 90)
write(sc, 'assets/minecraft/textures/gui/sprites/widget/scroller_background.png')

function menuBg(alpha, noise) {
  const c = canvas(16, 16)
  fillRect(c, 0, 0, 15, 15, C.DARK, alpha)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const cell = ((x >> 2) + (y >> 2)) & 1
    if (cell === 1) { const i = (y * 16 + x) * 4; c.data[i + 3] = Math.max(0, c.data[i + 3] - noise) }
  }
  return c
}
write(menuBg(170, 26), 'assets/minecraft/textures/gui/menu_background.png')
write(menuBg(155, 30), 'assets/minecraft/textures/gui/menu_list_background.png')
write(menuBg(135, 24), 'assets/minecraft/textures/gui/inworld_menu_background.png')
write(menuBg(120, 28), 'assets/minecraft/textures/gui/inworld_menu_list_background.png')
const thb = canvas(16, 16)
fillRect(thb, 0, 0, 15, 15, [255, 150, 175], 150)
write(thb, 'assets/minecraft/textures/gui/tab_header_background.png')

function sep(inworld) {
  const c = canvas(32, 2)
  const a = inworld ? 170 : 210
  fillRect(c, 0, 0, 31, 0, C.ACC_HI, a)
  fillRect(c, 0, 1, 31, 1, C.ACC, 80)
  return c
}
write(sep(false), 'assets/minecraft/textures/gui/header_separator.png')
write(sep(false), 'assets/minecraft/textures/gui/footer_separator.png')
write(sep(true), 'assets/minecraft/textures/gui/inworld_header_separator.png')
write(sep(true), 'assets/minecraft/textures/gui/inworld_footer_separator.png')

const demo = canvas(256, 256)
vgrad(demo, C.LIGHTER, C.MID)
for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
  const d = Math.max(Math.abs(x - 128), Math.abs(y - 128)) / 128
  if (d > 0.85) { const i = (y * 256 + x) * 4; demo.data[i] = C.DARK[0]; demo.data[i + 1] = C.DARK[1]; demo.data[i + 2] = C.DARK[2]; demo.data[i + 3] = Math.round(60 * ((d - 0.85) / 0.15)) }
}
write(demo, 'assets/minecraft/textures/gui/demo_background.png')

function recolor(img) {
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue
    const l = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
    const col = l < 128 ? lerp(C.TEXT, C.ACC, l / 128) : lerp(C.ACC, C.LIGHT, (l - 128) / 127)
    img.data[i] = Math.round(col[0]); img.data[i + 1] = Math.round(col[1]); img.data[i + 2] = Math.round(col[2])
  }
  return img
}
function recolorTitle(img) {
  for (let y = 0; y < img.h; y++) {
    const gy = y / Math.max(1, img.h - 1)
    const base = lerp(lerp(C.LIGHTER, C.MID, 0.35), lerp(C.ACC, C.DARK, 0.45), gy)
    for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4
      if (img.data[i + 3] === 0) continue
      const l = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
      const col = lerp(base, C.WHITE, Math.pow(l / 255, 1.4) * 0.72)
      img.data[i] = Math.round(col[0]); img.data[i + 1] = Math.round(col[1]); img.data[i + 2] = Math.round(col[2])
    }
  }
  return img
}
for (const name of ['title/minecraft.png', 'title/edition.png']) {
  const e = zip.getEntry('assets/minecraft/textures/gui/' + name)
  const img = decodePNG(e.getData())
  write(recolorTitle(img), 'assets/minecraft/textures/gui/' + name)
}
{
  const e = zip.getEntry('assets/minecraft/textures/gui/title/realms.png')
  const img = decodePNG(e.getData())
  write(recolor(img), 'assets/minecraft/textures/gui/title/realms.png')
}
{
  const splashes = [
    '67 Skid approved!',
    'Skid it to win it!',
    'Exploit free since day one!',
    'Modded and loaded!',
    'Fabric go brrr!',
    'No anti-cheat, no problem!',
    'Clean client, dirty gameplay!',
    'Skid harder!',
    'Client diff!',
    'Grief resistant!',
    'Build hacks enabled!',
    'Skybasing intensifies!',
    'Crystal pvp ready!',
    'Mesh kit included!',
    'Auto pearl on!',
    'Fast break, fast place!',
    '67 Skid: the only way to play!'
  ]
  const f = path.join(OUT, 'assets/minecraft/splashes.txt')
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, splashes.join('\n') + '\n')
  console.log('splashes: ' + splashes.length + ' splash texts')
}

for (const mc of ['button', 'button_highlighted', 'button_disabled', 'text_field', 'text_field_highlighted', 'slider', 'slider_highlighted', 'slider_handle', 'slider_handle_highlighted', 'tab', 'tab_highlighted', 'tab_selected', 'tab_selected_highlighted', 'scroller', 'scroller_background']) {
  copyFromJar('textures/gui/sprites/widget/' + mc + '.png.mcmeta')
}

let recolored = 0, skipped = 0, failed = 0
for (const e of zip.getEntries()) {
  const m = e.entryName.match(/^(assets\/minecraft\/textures\/gui\/.*\.png)$/)
  if (!m) continue
  if (written.has(m[1])) { skipped++; continue }
  try {
    const img = decodePNG(e.getData())
    write(recolor(img), m[1])
    recolored++
    copyFromJar(m[1].replace(/^assets\//, '') + '.mcmeta')
  } catch (err) {
    failed++
  }
}
console.log(`gui recolor: ${recolored} recolored, ${skipped} already themed, ${failed} skipped (non-rgba/err)`)

const packIcon = canvas(128, 128)
vgrad(packIcon, C.LIGHTER, C.MID)
fillRect(packIcon, 32, 26, 44, 100, C.ACC, 255)
fillRect(packIcon, 84, 26, 96, 100, C.ACC, 255)
fillRect(packIcon, 43, 32, 44, 38, C.ACC, 255)
fillRect(packIcon, 84, 38, 85, 45, C.ACC, 255)
fillRect(packIcon, 56, 64, 57, 72, C.ACC, 255)
fillRect(packIcon, 73, 72, 74, 80, C.ACC, 255)
fillRect(packIcon, 62, 90, 63, 96, C.ACC, 255)
fillRect(packIcon, 66, 98, 67, 100, C.ACC, 255)
write(packIcon, 'pack.png')

fs.writeFileSync(path.join(OUT, 'pack.mcmeta'), JSON.stringify({
  pack: {
    pack_format: 64,
    supported_formats: { min_inclusive: 34, max_inclusive: 64 },
    description: '67 Skid Launcher UI'
  }
}, null, 2))

console.log('pack generated ->', OUT)
