const fs = require('fs')
const path = require('path')

function irisPropsFile(gameDir) {
  return path.join(gameDir, 'config', 'iris.properties')
}

function irisInstalled(gameDir) {
  const mods = path.join(gameDir, 'mods')
  if (!fs.existsSync(mods)) return false
  return fs.readdirSync(mods).some((f) => /^iris[-_.]/i.test(f))
}

function readIrisProps(gameDir) {
  try {
    return fs.readFileSync(irisPropsFile(gameDir), 'utf8').split(/\r?\n/)
  } catch {
    return []
  }
}

function currentShader(gameDir) {
  for (const l of readIrisProps(gameDir)) {
    const m = l.match(/^shaderPack=(.*)$/)
    if (m) {
      const v = m[1].trim()
      if (!v || v === 'off' || v === 'internal') return null
      return path.basename(v).replace(/\.(zip|jar)$/i, '')
    }
  }
  return null
}

function listShaders(gameDir) {
  const dir = path.join(gameDir, 'shaderpacks')
  const packs = []
  if (fs.existsSync(dir)) {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n)
      let st
      try { st = fs.statSync(p) } catch { continue }
      const isZip = !st.isDirectory()
      if (st.isDirectory() && n.startsWith('.')) continue
      if (isZip && !/\.zip$/i.test(n)) continue
      packs.push({ name: n, base: n.replace(/\.zip$/i, ''), size: st.size, isZip })
    }
  }
  const active = currentShader(gameDir)
  return {
    active,
    iris: irisInstalled(gameDir),
    packs: packs.map((p) => ({ ...p, active: p.base === active }))
  }
}

function setShader(gameDir, name) {
  const active = currentShader(gameDir)
  const value = !name ? '' : name.replace(/\.zip$/i, '')
  if (value === active) return listShaders(gameDir)
  const lines = readIrisProps(gameDir)
  let hasEnable = false
  let hasPack = false
  const out = lines.map((l) => {
    if (/^enableShaders=/.test(l)) { hasEnable = true; return 'enableShaders=' + (name ? 'true' : 'false') }
    if (/^shaderPack=/.test(l)) { hasPack = true; return 'shaderPack=' + value }
    return l
  })
  if (!hasEnable) out.unshift('enableShaders=' + (name ? 'true' : 'false'))
  if (!hasPack) out.push('shaderPack=' + value)
  fs.mkdirSync(path.dirname(irisPropsFile(gameDir)), { recursive: true })
  fs.writeFileSync(irisPropsFile(gameDir), out.join('\n'))
  return listShaders(gameDir)
}

module.exports = { listShaders, setShader, irisInstalled }