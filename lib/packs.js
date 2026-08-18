const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const options = require('./options')

const MAX_ICON = 262144

function readMeta(entry, isZip) {
  let mcmeta = null
  let icon = null
  if (isZip) {
    try {
      const zip = new AdmZip(entry)
      const m = zip.getEntry('pack.mcmeta')
      if (m) {
        try { mcmeta = JSON.parse(m.getData().toString('utf8')) } catch { mcmeta = null }
      }
      const im = zip.getEntry('pack.png')
      if (im) {
        const b = im.getData()
        if (b.length <= MAX_ICON) icon = 'data:image/png;base64,' + b.toString('base64')
      }
    } catch { /* ignore */ }
  } else {
    const f = path.join(entry, 'pack.mcmeta')
    if (fs.existsSync(f)) {
      try { mcmeta = JSON.parse(fs.readFileSync(f, 'utf8')) } catch { mcmeta = null }
    }
    const i = path.join(entry, 'pack.png')
    if (fs.existsSync(i)) {
      try {
        const b = fs.readFileSync(i)
        if (b.length <= MAX_ICON) icon = 'data:image/png;base64,' + b.toString('base64')
      } catch { /* ignore */ }
    }
  }
  const desc = mcmeta && mcmeta.pack ? mcmeta.pack.description : ''
  return {
    description: typeof desc === 'string' ? desc : JSON.stringify(desc || ''),
    pack_format: mcmeta && mcmeta.pack ? mcmeta.pack.pack_format : null,
    icon
  }
}

function listPacks(gameDir) {
  const dir = path.join(gameDir, 'resourcepacks')
  if (!fs.existsSync(dir)) return []
  const enabled = options.getEnabledPacks(gameDir) || []
  const packs = []
  for (const name of fs.readdirSync(dir)) {
    const entry = path.join(dir, name)
    let st
    try { st = fs.statSync(entry) } catch { continue }
    const isZip = !st.isDirectory()
    if (st.isDirectory() && name.startsWith('.')) continue
    if (isZip && !/\.zip$/i.test(name)) continue
    const meta = readMeta(entry, isZip)
    packs.push({
      name,
      isZip,
      enabled: enabled.includes(name) || enabled.includes('file/' + name),
      description: meta.description || '',
      pack_format: meta.pack_format,
      icon: meta.icon
    })
  }
  packs.sort((a, b) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1))
  return packs
}

function setEnabled(gameDir, name, enabled) {
  options.setEnabled(gameDir, name, !!enabled)
  return listPacks(gameDir)
}

module.exports = { listPacks, setEnabled }