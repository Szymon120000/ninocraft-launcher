const fs = require('fs')
const path = require('path')
const { root } = require('./paths')

function install(gameDir) {
  const src = path.join(root(), '..', 'bundled-mods')
  if (!fs.existsSync(src)) return { ok: false, error: 'bundled-mods folder missing' }
  const modsDir = path.join(gameDir, 'mods')
  fs.mkdirSync(modsDir, { recursive: true })
  const marker = path.join(modsDir, '.67skid-bundled')
  if (fs.existsSync(marker)) return { ok: true, installed: 0 }
  let count = 0
  for (const f of fs.readdirSync(src)) {
    if (!f.endsWith('.jar')) continue
    const dest = path.join(modsDir, f)
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(src, f), dest)
      count++
    }
  }
  fs.writeFileSync(marker, JSON.stringify({ ts: Date.now() }))
  return { ok: true, installed: count }
}

module.exports = { install }