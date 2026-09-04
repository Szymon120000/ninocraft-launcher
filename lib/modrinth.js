const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const http = require('./http')

const API = 'https://api.modrinth.com/v2'
const UA = { 'User-Agent': '67Skid-Launcher/2.0' }

let config = () => ({})
let emit = () => {}

function init(getConfig, bus) {
  config = getConfig
  emit = bus
}

function getJSON(url) {
  return http.getJSON(url, UA)
}

async function search({ query = '', type = 'mod', limit = 24, offset = 0 }) {
  const cfg = config()
  const facets = []
  if (type === 'mod') {
    const loaderFacet = { fabric: 'fabric', forge: 'forge', neoforge: 'neoforge', quilt: 'quilt' }[cfg.loader]
    if (loaderFacet) facets.push([`categories:${loaderFacet}`])
    if (cfg.mcVersion) facets.push([`versions:${cfg.mcVersion}`])
  } else {
    facets.push(['project_type:modpack'])
    if (cfg.mcVersion) facets.push([`versions:${cfg.mcVersion}`])
  }
  const params = new URLSearchParams({
    query,
    facets: JSON.stringify(facets),
    limit: String(limit),
    offset: String(offset),
    index: type === 'modpack' ? 'relevance' : 'downloads'
  })
  const data = await getJSON(`${API}/search?${params}`)
  return data
}

async function getProject(id) {
  return getJSON(`${API}/project/${id}`)
}

async function getProjectVersions(id, mc, loader) {
  const p = new URLSearchParams()
  if (mc) p.append('game_versions', JSON.stringify([mc]))
  if (loader && loader !== 'vanilla') p.append('loaders', JSON.stringify([loader]))
  return getJSON(`${API}/project/${id}/version?${p}`)
}

async function getVersion(id) {
  return getJSON(`${API}/version/${id}`)
}

function pickFile(version) {
  const primary = (version.files || []).find((f) => f.primary)
  return primary || (version.files || [])[0]
}

async function installMod(project, version) {
  const cfg = config()
  const file = pickFile(version)
  if (!file) throw new Error('Mod has no downloadable file')
  const modsDir = path.join(cfg.gameDir, 'mods')
  fs.mkdirSync(modsDir, { recursive: true })
  const dest = path.join(modsDir, file.filename)
  const indexFile = path.join(modsDir, '.ninocraft-mods.json')
  const index = readJSON(indexFile, {})

  if (fs.existsSync(dest)) {
    const sha = await sha1File(dest)
    if (file.hashes && file.hashes.sha1 && sha === file.hashes.sha1) {
      throw new Error('Already installed')
    }
  }

  emit('progress', { label: `Downloading ${file.filename}`, current: 0, total: 0 })
  await http.download(file.url, dest, {
    headers: UA,
    onProgress: (cur, total) => emit('progress', { label: `Downloading ${file.filename}`, current: cur, total })
  })
  emit('progress', { label: `Downloaded ${file.filename}`, current: 1, total: 1 })

  index[file.filename] = {
    projectId: project.id,
    projectSlug: project.slug,
    title: project.title,
    icon: project.icon_url || '',
    versionId: version.id,
    versionName: version.version_number,
    fileHash: file.hashes ? file.hashes.sha1 : '',
    installedAt: Date.now()
  }
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2))
  return { fileName: file.filename, meta: index[file.filename] }
}

async function installModpack(project, version) {
  const cfg = config()
  const file = pickFile(version)
  if (!file) throw new Error('Modpack has no downloadable file')

  emit('progress', { label: `Downloading ${file.filename}`, current: 0, total: 0 })
  const tmp = path.join(cfg.gameDir, 'mods', '.ninocraft-tmp.mrpack')
  await http.download(file.url, tmp, {
    headers: UA,
    onProgress: (cur, total) => emit('progress', { label: `Downloading ${file.filename}`, current: cur, total })
  })

  const zip = new AdmZip(tmp)
  const idxEntry = zip.getEntry('modrinth.index.json')
  if (!idxEntry) throw new Error('Invalid modpack (no modrinth.index.json)')
  const index = JSON.parse(idxEntry.getData().toString('utf8'))

  const modsDir = path.join(cfg.gameDir, 'mods')
  fs.mkdirSync(modsDir, { recursive: true })
  const manifest = readJSON(path.join(modsDir, '.ninocraft-modpacks.json'), {})
  const record = {
    slug: project.slug,
    title: project.title,
    icon: project.icon_url || '',
    versionId: version.id,
    versionName: version.version_number,
    files: [],
    overrides: []
  }

  for (const f of index.files || []) {
    const env = f.env || {}
    if (env.client === false) continue
    const rel = f.path.split('/').join(path.sep)
    if (rel.startsWith('overrides' + path.sep)) {
      const entry = zip.getEntry(f.path)
      if (entry) {
        const dest = path.join(cfg.gameDir, rel)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, entry.getData())
        record.overrides.push(rel)
      }
    } else if (f.downloads && f.downloads.length) {
      const dest = path.join(cfg.gameDir, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      let ok = false
      for (const u of f.downloads) {
        try {
          emit('progress', { label: `Installing ${f.path}`, current: 0, total: 0 })
          await http.download(u, dest, { headers: UA, onProgress: (cur, total) => emit('progress', { label: `Installing ${f.path}`, current: cur, total }) })
          ok = true
          break
        } catch { /* try next mirror */ }
      }
      if (!ok) throw new Error(`Failed to download ${f.path}`)
      record.files.push(rel)
    }
  }

  try { fs.unlinkSync(tmp) } catch { /* ignore */ }

  manifest[project.slug] = record
  fs.writeFileSync(path.join(modsDir, '.ninocraft-modpacks.json'), JSON.stringify(manifest, null, 2))
  return record
}

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback }
}

function listMods() {
  const cfg = config()
  const modsDir = path.join(cfg.gameDir, 'mods')
  const index = readJSON(path.join(modsDir, '.ninocraft-mods.json'), {})
  const result = []
  if (!fs.existsSync(modsDir)) return result
  for (const name of fs.readdirSync(modsDir)) {
    if (!name.endsWith('.jar')) continue
    const meta = index[name]
    const stat = fs.statSync(path.join(modsDir, name))
    result.push({
      fileName: name,
      managed: !!meta,
      title: meta ? meta.title : name.replace(/\.jar$/, ''),
      slug: meta ? meta.projectSlug : '',
      icon: meta ? meta.icon : '',
      versionName: meta ? meta.versionName : '',
      size: stat.size,
      installedAt: meta ? meta.installedAt : 0
    })
  }
  return result
}

function removeMod(fileName) {
  const cfg = config()
  const modsDir = path.join(cfg.gameDir, 'mods')
  const target = path.join(modsDir, fileName)
  if (fs.existsSync(target)) fs.unlinkSync(target)
  const indexFile = path.join(modsDir, '.ninocraft-mods.json')
  const index = readJSON(indexFile, {})
  delete index[fileName]
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2))
  return true
}

function listModpacks() {
  const cfg = config()
  const manifest = readJSON(path.join(cfg.gameDir, 'mods', '.ninocraft-modpacks.json'), {})
  return Object.values(manifest)
}

function removeModpack(slug) {
  const cfg = config()
  const modsDir = path.join(cfg.gameDir, 'mods')
  const manifestFile = path.join(modsDir, '.ninocraft-modpacks.json')
  const manifest = readJSON(manifestFile, {})
  const record = manifest[slug]
  if (!record) return false
  for (const rel of [...(record.files || []), ...(record.overrides || [])]) {
    const p = path.join(cfg.gameDir, rel)
    try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* ignore */ }
  }
  delete manifest[slug]
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
  cleanEmptyDirs(path.join(cfg.gameDir, 'mods'))
  return true
}

function cleanEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) {
      cleanEmptyDirs(p)
      try { fs.rmdirSync(p) } catch { /* not empty */ }
    }
  }
}

function sha1File(p) {
  const crypto = require('crypto')
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1')
    const s = fs.createReadStream(p)
    s.on('data', (d) => hash.update(d))
    s.on('end', () => resolve(hash.digest('hex')))
    s.on('error', reject)
  })
}

module.exports = {
  init, search, getProject, getProjectVersions, getVersion, installMod, installModpack,
  listMods, removeMod, listModpacks, removeModpack, pickFile
}
