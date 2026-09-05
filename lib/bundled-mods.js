const fs = require('fs')
const path = require('path')
const { root } = require('./paths')

function install(gameDir) {
  const result = { ok: true, modsInstalled: 0, profilesInstalled: 0 }

  // bundled mods
  const modsSrc = path.join(root(), '..', 'bundled-mods')
  if (fs.existsSync(modsSrc)) {
    const modsDir = path.join(gameDir, 'mods')
    fs.mkdirSync(modsDir, { recursive: true })
    const marker = path.join(modsDir, '.67skid-bundled')
    if (!fs.existsSync(marker)) {
      for (const f of fs.readdirSync(modsSrc)) {
        if (!f.endsWith('.jar')) continue
        const dest = path.join(modsDir, f)
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(path.join(modsSrc, f), dest)
          result.modsInstalled++
        }
      }
      fs.writeFileSync(marker, JSON.stringify({ ts: Date.now() }))
    }
  }

  // meteor-client profiles
  const metSrc = path.join(root(), '..', 'meteor-profile')
  if (fs.existsSync(metSrc)) {
    const metDir = path.join(gameDir, 'meteor-client', 'profiles')
    fs.mkdirSync(metDir, { recursive: true })
    const marker = path.join(metDir, '.67skid-meteor')
    if (!fs.existsSync(marker)) {
      copyDirSync(metSrc, metDir)
      result.profilesInstalled++
      fs.writeFileSync(marker, JSON.stringify({ ts: Date.now() }))
    }
  }

  return result
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(s, d)
    } else {
      if (!fs.existsSync(d)) fs.copyFileSync(s, d)
    }
  }
}

module.exports = { install }