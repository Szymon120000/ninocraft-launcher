const fs = require('fs')
const path = require('path')

function optionsFile(gameDir) {
  return path.join(gameDir, 'options.txt')
}

function readLines(gameDir) {
  try {
    return fs.readFileSync(optionsFile(gameDir), 'utf8').split(/\r?\n/)
  } catch {
    return []
  }
}

function getEnabledPacks(gameDir) {
  for (const l of readLines(gameDir)) {
    const m = l.match(/^resourcePacks:(.+)$/)
    if (m) {
      try { return JSON.parse(m[1]) } catch { return [] }
    }
  }
  return []
}

function isPackEntry(x, name) {
  return x === name || x === 'file/' + name
}

function setEnabled(gameDir, packName, enabled) {
  const lines = readLines(gameDir)
  let hasPacks = false
  const out = lines.map((l) => {
    const m = l.match(/^(resourcePacks|incompatibleResourcePacks):(.+)$/)
    if (!m) return l
    let arr = []
    try { arr = JSON.parse(m[2]) } catch { arr = [] }
    if (m[1] === 'resourcePacks') {
      hasPacks = true
      arr = arr.filter((x) => !isPackEntry(x, packName))
      if (enabled) arr.push(packName)
    } else {
      arr = arr.filter((x) => !isPackEntry(x, packName))
    }
    return m[1] + ':' + JSON.stringify(arr)
  })
  if (enabled && !hasPacks) out.push('resourcePacks:["vanilla","' + packName + '"]')
  if (!enabled && !fs.existsSync(optionsFile(gameDir))) return
  fs.mkdirSync(path.dirname(optionsFile(gameDir)), { recursive: true })
  fs.writeFileSync(optionsFile(gameDir), out.join('\n'))
}

module.exports = { getEnabledPacks, setEnabled, readLines }
