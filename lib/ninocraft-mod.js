const fs = require('fs')
const path = require('path')

const MOD_FILE = 'ninocraft-modules-1.1.0.jar'
const BUNDLED = path.join(require('./paths').root(), 'tools', MOD_FILE)

function modPath(gameDir) {
  return path.join(gameDir, 'mods', MOD_FILE)
}

function isInstalled(gameDir) {
  return fs.existsSync(modPath(gameDir))
}

function install(gameDir) {
  if (!fs.existsSync(BUNDLED)) throw new Error('Bundled modules jar not found: ' + BUNDLED)
  fs.mkdirSync(path.join(gameDir, 'mods'), { recursive: true })
  for (const f of fs.readdirSync(path.join(gameDir, 'mods'))) {
    if (f !== MOD_FILE && /^ninocraft-modules-.*\.jar$/.test(f)) {
      try {
        fs.unlinkSync(path.join(gameDir, 'mods', f))
      } catch (e) {
        // old version in use by a running game; ignore
      }
    }
  }
  fs.copyFileSync(BUNDLED, modPath(gameDir))
  return true
}

function remove(gameDir) {
  if (isInstalled(gameDir)) fs.unlinkSync(modPath(gameDir))
  return true
}

function getState(gameDir) {
  return { installed: isInstalled(gameDir) }
}

module.exports = { install, remove, getState }