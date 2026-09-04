const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const options = require('./options')

const PACK_NAME = '67 Skid UI'
const SRC = path.join(require('./paths').root(), 'ui-pack')
const MARKER = '.ninocraft-uipack.json'

function packDir(gameDir) {
  return path.join(gameDir, 'resourcepacks', PACK_NAME)
}

function sourceFingerprint() {
  const files = fs.readdirSync(SRC, { recursive: true })
  const h = crypto.createHash('sha1')
  for (const rel of files.sort()) {
    const full = path.join(SRC, rel)
    if (!fs.statSync(full).isFile()) continue
    h.update(rel)
    h.update(fs.readFileSync(full))
  }
  return h.digest('hex')
}

function installedFingerprint(gameDir) {
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(packDir(gameDir), MARKER), 'utf8'))
    return marker.fingerprint
  } catch {
    return null
  }
}

function copyPack(gameDir) {
  const dest = packDir(gameDir)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(SRC, dest, { recursive: true })
  fs.writeFileSync(path.join(dest, MARKER), JSON.stringify({ fingerprint: sourceFingerprint() }))
}

function apply(gameDir, enabled) {
  if (enabled) {
    if (!fs.existsSync(SRC)) return { ok: false, error: 'ui-pack source missing: ' + SRC }
    if (installedFingerprint(gameDir) !== sourceFingerprint()) copyPack(gameDir)
  }
  fs.mkdirSync(path.join(gameDir, 'resourcepacks'), { recursive: true })
  options.setEnabled(gameDir, PACK_NAME, !!enabled)
  return { ok: true }
}

function getState(gameDir) {
  return {
    installed: fs.existsSync(packDir(gameDir)),
    enabled: (options.getEnabledPacks(gameDir) || []).includes(PACK_NAME)
  }
}

module.exports = { PACK_NAME, apply, getState }