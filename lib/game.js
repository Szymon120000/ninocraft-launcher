const { app } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const AdmZip = require('adm-zip')
const http = require('./http')

const UA = { 'User-Agent': 'NinoCraft-Launcher/1.0' }
const WIN_ARCH = process.arch === 'arm64' ? 'arm64' : 'x86_64'

let config = () => ({})
let emit = () => {}

let _manifest = null

function init(getConfig, bus) {
  config = getConfig
  emit = bus
}

function log(...args) {
  emit('log', args.join(' '))
}

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback }
}

function writeVersionJson(id, json) {
  const dir = path.join(config().gameDir, 'versions', id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(json, null, 2))
}

async function getManifest() {
  if (_manifest) return _manifest
  _manifest = await http.getJSON('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', UA)
  return _manifest
}

async function listAvailableVersions() {
  const m = await getManifest()
  return {
    latest: m.latest,
    versions: m.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }))
  }
}

async function ensureMojangVersion(mc) {
  const m = await getManifest()
  const entry = m.versions.find((v) => v.id === mc)
  if (!entry) throw new Error(`Unknown Minecraft version "${mc}"`)
  const dir = path.join(config().gameDir, 'versions', mc)
  if (fs.existsSync(path.join(dir, `${mc}.json`))) return
  emit('progress', { label: `Downloading version metadata for ${mc}`, current: 0, total: 0 })
  const vjson = await http.getJSON(entry.url, UA)
  writeVersionJson(mc, vjson)
}

function loadVersionJson(id, cache = {}) {
  if (cache[id]) return cache[id]
  const dir = path.join(config().gameDir, 'versions', id)
  const file = path.join(dir, `${id}.json`)
  if (!fs.existsSync(file)) return null
  let v = readJSON(file, null)
  if (!v) return null
  if (v.inheritsFrom) {
    const parent = loadVersionJson(v.inheritsFrom, cache)
    if (parent) v = mergeVersions(parent, v)
  }
  cache[id] = v
  return v
}

function libraryKey(lib) {
  const parts = (lib.name || '').split(':')
  if (parts.length < 2) return lib.name || ''
  const base = parts[0] + ':' + parts[1]
  return parts.length >= 4 ? base + ':' + parts[3] : base
}

function mergeVersions(parent, child) {
  const merged = { ...parent, ...child }
  merged.id = child.id
  delete merged.inheritsFrom
  merged.mainClass = child.mainClass || parent.mainClass
  merged.minecraftArguments = child.minecraftArguments || parent.minecraftArguments
  merged.assetIndex = child.assetIndex || parent.assetIndex
  const libMap = new Map()
  for (const lib of [...(parent.libraries || []), ...(child.libraries || [])]) libMap.set(libraryKey(lib), lib)
  merged.libraries = [...libMap.values()]
  merged.arguments = mergeArguments(parent.arguments, child.arguments)
  return merged
}

function mergeArguments(parent, child) {
  if (!child) return parent
  const out = { ...(parent || {}) }
  if (child.game || child.jvm) {
    out.game = [...(parent && parent.game || []), ...(child.game || [])]
    out.jvm = [...(parent && parent.jvm || []), ...(child.jvm || [])]
  }
  return out
}

function ruleMatches(rule) {
  if (rule.features) {
    return Object.keys(rule.features).every((k) => rule.features[k] === false)
  }
  if (!rule.os) return true
  const osMatch = !rule.os.name || rule.os.name === 'windows'
  const archMatch = !rule.os.arch || rule.os.arch === WIN_ARCH
  return osMatch && archMatch
}

function ruleAllows(entry) {
  if (!entry || !entry.rules || entry.rules.length === 0) return true
  let allowed = false
  for (const rule of entry.rules) {
    if (rule.action === 'disallow' && ruleMatches(rule)) return false
    if (rule.action === 'allow' && ruleMatches(rule)) allowed = true
  }
  return allowed
}

function nameToPath(name) {
  const parts = name.split(':')
  const group = parts[0].split('.').join('/')
  const artifact = parts[1]
  const version = parts[2]
  const classifier = parts[3]
  const base = `${group}/${artifact}/${version}/${artifact}-${version}`
  return `${base}${classifier ? '-' + classifier : ''}.jar`
}

function libraryRelPath(lib) {
  if (lib.downloads && lib.downloads.artifact) return lib.downloads.artifact.path
  return nameToPath(lib.name)
}

function nativeClassifierKey(lib) {
  const cls = (lib.downloads && lib.downloads.classifiers) || {}
  if (WIN_ARCH === 'arm64' && cls['natives-windows-arm64']) return 'natives-windows-arm64'
  if (cls['natives-windows']) return 'natives-windows'
  return null
}

async function pMap(list, limit, fn) {
  const results = new Array(list.length)
  let i = 0
  async function worker() {
    while (i < list.length) {
      const j = i++
      results[j] = await fn(list[j], j)
    }
  }
  const n = Math.min(limit, list.length)
  await Promise.all(Array.from({ length: n }, worker))
  return results
}

async function ensureFile(url, dest, expectedSize) {
  if (fs.existsSync(dest)) {
    if (!expectedSize || fs.statSync(dest).size === expectedSize) return dest
  }
  await http.download(url, dest, { headers: UA })
  return dest
}

async function ensureFileFallback(rel, repos) {
  const dest = path.join(config().gameDir, 'libraries', rel)
  if (fs.existsSync(dest)) return dest
  let lastErr = null
  for (const repo of repos) {
    try {
      await http.download(repo + rel.replace(/\\/g, '/'), dest, { headers: UA })
      return dest
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('download failed: ' + rel)
}

async function ensureLibraries(versionJson) {
  const libsDir = path.join(config().gameDir, 'libraries')
  const classList = []
  const natives = []
  const tasks = []

  for (const lib of versionJson.libraries || []) {
    if (!ruleAllows(lib)) continue
    const nativeKey = nativeClassifierKey(lib)
    if (nativeKey) {
      const art = lib.downloads.classifiers[nativeKey]
      const rel = art.path
      natives.push(rel)
      tasks.push(() => ensureFile(art.url, path.join(libsDir, rel), art.size))
      continue
    }
    const rel = libraryRelPath(lib)
    classList.push(rel)
    const art = lib.downloads && lib.downloads.artifact
    if (art) {
      tasks.push(() => ensureFile(art.url, path.join(libsDir, rel), art.size))
    } else {
      tasks.push(() => ensureFileFallback(rel, ['https://maven.fabricmc.net/', 'https://libraries.minecraft.net/']))
    }
  }

  let done = 0
  emit('progress', { label: 'Downloading libraries', current: 0, total: tasks.length })
  await pMap(tasks, 8, async (t) => {
    try {
      await t()
    } catch (e) {
      log(`library download failed: ${e.message}`)
    }
    done++
    emit('progress', { label: 'Downloading libraries', current: done, total: tasks.length })
  })
  return { classList, natives }
}

async function ensureAssets(assetIndex) {
  if (!assetIndex || !assetIndex.url) return
  const assetsDir = path.join(config().gameDir, 'assets')
  const idxPath = path.join(assetsDir, 'indexes', `${assetIndex.id}.json`)
  if (!fs.existsSync(idxPath)) {
    emit('progress', { label: `Downloading asset index ${assetIndex.id}`, current: 0, total: 0 })
    await http.download(assetIndex.url, idxPath, { headers: UA })
  }
  const idx = readJSON(idxPath, null)
  if (!idx || !idx.objects) return
  const objects = Object.entries(idx.objects)
  let done = 0
  emit('progress', { label: 'Downloading assets', current: 0, total: objects.length })
  await pMap(objects, 8, async ([key, meta]) => {
    const hash = meta && meta.hash ? meta.hash : key
    if (!/^[0-9a-f]{40}$/.test(hash)) return
    const rel = path.join('objects', hash.slice(0, 2), hash)
    const dest = path.join(assetsDir, rel)
    if (!fs.existsSync(dest)) {
      try {
        await http.download(`https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`, dest, { headers: UA })
      } catch (e) {
        log(`asset download failed: ${e.message}`)
      }
    }
    done++
    if (done % 50 === 0 || done === objects.length) emit('progress', { label: 'Downloading assets', current: done, total: objects.length })
  })
  emit('progress', { label: 'Assets ready', current: 1, total: 1 })
}

async function ensureNatives(versionJson, versionId) {
  const { natives } = await ensureLibraries(versionJson)
  if (!natives.length) return path.join(config().gameDir, 'versions', versionId, 'natives')
  const nativesDir = path.join(config().gameDir, 'versions', versionId, 'natives')
  fs.mkdirSync(nativesDir, { recursive: true })
  const libsDir = path.join(config().gameDir, 'libraries')
  let changed = false
  for (const rel of natives) {
    const jar = path.join(libsDir, rel)
    if (!fs.existsSync(jar)) continue
    let zip
    try { zip = new AdmZip(jar) } catch { continue }
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      const name = path.basename(entry.entryName)
      if (entry.entryName.includes('META-INF') && !entry.entryName.endsWith('.dll') && !entry.entryName.endsWith('.so') && !entry.entryName.endsWith('.dylib')) continue
      const dest = path.join(nativesDir, name)
      if (!fs.existsSync(dest)) {
        fs.writeFileSync(dest, entry.getData())
        changed = true
      }
    }
  }
  return nativesDir
}

function sortBuilds(versions, mc) {
  return versions
    .map((v) => ({ v, nums: v.slice(mc.length + 1).split(/[.-]/).map((x) => parseInt(x) || 0) }))
    .sort((a, b) => {
      const n = Math.max(a.nums.length, b.nums.length)
      for (let i = 0; i < n; i++) {
        const d = (b.nums[i] || 0) - (a.nums[i] || 0)
        if (d) return d
      }
      return 0
    })
    .map((x) => x.v)
}

async function installFabric(mc, ver) {
  let loader = ver
  if (!loader) {
    const list = await http.getJSON(`https://meta.fabricmc.net/v2/versions/loader/${mc}`, UA)
    if (!list.length) throw new Error(`Fabric has no loader for ${mc}`)
    loader = (list[0].loader && list[0].loader.version) || list[0].version
  }
  const prof = await http.getJSON(`https://meta.fabricmc.net/v2/versions/loader/${mc}/${loader}/profile/json`, UA)
  writeVersionJson(prof.id, prof)
  log(`Fabric loader ${loader} installed (${prof.id})`)
  return prof.id
}

async function installQuilt(mc, ver) {
  let loader = ver
  if (!loader) {
    const list = await http.getJSON(`https://meta.quiltmc.org/v3/versions/loader/${mc}`, UA)
    if (!list.length) throw new Error(`Quilt has no loader for ${mc}`)
    loader = (list[0].loader && list[0].loader.version) || list[0].version
  }
  const prof = await http.getJSON(`https://meta.quiltmc.org/v3/versions/loader/${mc}/${loader}/profile/json`, UA)
  writeVersionJson(prof.id, prof)
  log(`Quilt loader ${loader} installed (${prof.id})`)
  return prof.id
}

async function runInstaller(jarPath) {
  const cfg = config()
  const javaPath = cfg.javaPath || findJava()
  if (!javaPath) throw new Error('No Java found to run the installer')
  log(`Running installer: ${path.basename(javaPath)} -jar ${path.basename(jarPath)} --installClient`)
  fs.mkdirSync(cfg.gameDir, { recursive: true })
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, ['-jar', jarPath, '--installClient'], { cwd: cfg.gameDir, windowsHide: true })
    let err = ''
    child.stdout.on('data', (d) => log(d.toString().trim()))
    child.stderr.on('data', (d) => { const s = d.toString().trim(); log(s); err += s })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Installer exited with code ${code}${err ? ': ' + err.slice(0, 300) : ''}`))
    })
  })
}

function resolveInstalledVersionId(mc, fver, brand) {
  const base = path.join(config().gameDir, 'versions')
  if (!fs.existsSync(base)) return null
  const build = fver.slice(mc.length + 1)
  const names = [`${mc}-${brand}-${build}`, `${brand}-${fver}`, `${brand}-${build}`, `${mc}-${fver}`, fver]
  for (const n of names) {
    if (fs.existsSync(path.join(base, n, `${n}.json`))) return n
  }
  return null
}

async function installForge(mc, ver) {
  let fver = ver
  if (!fver) {
    const xml = await http.getText('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml', UA)
    const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]).filter((v) => v.startsWith(`${mc}-`))
    if (!versions.length) throw new Error(`Forge has no builds for ${mc}`)
    fver = sortBuilds(versions, mc)[0]
  }
  const existing = resolveInstalledVersionId(mc, fver, 'forge')
  if (existing) return existing
  emit('progress', { label: `Downloading Forge ${fver} installer`, current: 0, total: 0 })
  const tmp = path.join(os.tmpdir(), `forge-${fver}-installer.jar`)
  await http.download(`https://maven.minecraftforge.net/net/minecraftforge/forge/${fver}/forge-${fver}-installer.jar`, tmp, { headers: UA })
  emit('progress', { label: 'Running Forge installer', current: 0, total: 0 })
  ensureLauncherProfiles()
  await runInstaller(tmp)
  try { fs.unlinkSync(tmp) } catch { /* ignore */ }
  const vid = resolveInstalledVersionId(mc, fver, 'forge')
  if (!vid) throw new Error('Forge installed but its version could not be found')
  return vid
}

async function installNeoForge(mc, ver) {
  let fver = ver
  if (!fver) {
    const xml = await http.getText('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', UA)
    const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]).filter((v) => v.startsWith(`${mc}-`))
    if (!versions.length) throw new Error(`NeoForge has no builds for ${mc}`)
    fver = sortBuilds(versions, mc)[0]
  }
  const existing = resolveInstalledVersionId(mc, fver, 'neoforge')
  if (existing) return existing
  emit('progress', { label: `Downloading NeoForge ${fver} installer`, current: 0, total: 0 })
  const tmp = path.join(os.tmpdir(), `neoforge-${fver}-installer.jar`)
  await http.download(`https://maven.neoforged.net/releases/net/neoforged/neoforge/${fver}/neoforge-${fver}-installer.jar`, tmp, { headers: UA })
  emit('progress', { label: 'Running NeoForge installer', current: 0, total: 0 })
  ensureLauncherProfiles()
  await runInstaller(tmp)
  try { fs.unlinkSync(tmp) } catch { /* ignore */ }
  const vid = resolveInstalledVersionId(mc, fver, 'neoforge')
  if (!vid) throw new Error('NeoForge installed but its version could not be found')
  return vid
}

function javaMajor(javaPath) {
  const r = spawnSync(javaPath, ['-version'], { timeout: 8000, encoding: 'utf8' })
  const out = (r.stderr || '') + (r.stdout || '')
  const m = /version\s+"?(\d+)(?:\.(\d+))?/.exec(out)
  if (!m) return 0
  const major = parseInt(m[1], 10)
  if (major === 1) return parseInt(m[2] || 0, 10)
  return major
}

function findJava() {
  const cfg = config()
  const candidates = []
  if (cfg.javaPath && fs.existsSync(cfg.javaPath)) candidates.push(cfg.javaPath)

  const runtimeDir = path.join(cfg.gameDir, 'runtime')
  if (fs.existsSync(runtimeDir)) {
    for (const name of fs.readdirSync(runtimeDir)) {
      const exe = path.join(runtimeDir, name, 'bin', 'java.exe')
      if (fs.existsSync(exe)) candidates.push(exe)
    }
    candidates.sort((a, b) => path.basename(path.dirname(path.dirname(b))).localeCompare(path.basename(path.dirname(path.dirname(a)))))
  }

  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'))

  const where = spawnSync('where.exe', ['java'], { encoding: 'utf8' })
  if (where.status === 0) {
    for (const line of where.stdout.split('\r\n')) {
      if (line.trim()) candidates.push(line.trim())
    }
  }

  const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], path.join(process.env.LOCALAPPDATA || '', 'Programs')]
  const jdkDirs = ['Java', 'Eclipse Adoptium', 'Microsoft', 'BellSoft', 'Amazon Corretto', 'Zulu', 'Oracle', 'Temurin', 'AdoptOpenJDK']
  for (const root of roots) {
    if (!root) continue
    for (const dir of jdkDirs) {
      const base = path.join(root, dir)
      if (!fs.existsSync(base)) continue
      for (const child of fs.readdirSync(base)) {
        candidates.push(path.join(base, child, 'bin', 'java.exe'))
      }
    }
  }

  const seen = new Set()
  let best = null
  let bestMajor = 0
  for (const c of candidates) {
    if (seen.has(c) || !fs.existsSync(c)) continue
    seen.add(c)
    const r = spawnSync(c, ['-version'], { timeout: 8000, encoding: 'utf8' })
    if (r.status !== 0) continue
    const major = javaMajor(c)
    if (major > bestMajor) {
      bestMajor = major
      best = c
    }
  }
  return best
}

function ensureLauncherProfiles() {
  const cfg = config()
  const file = path.join(cfg.gameDir, 'launcher_profiles.json')
  if (fs.existsSync(file)) return
  try {
    fs.writeFileSync(file, JSON.stringify({ profiles: {}, settings: {}, version: 3 }, null, 2))
  } catch { /* ignore */ }
}

function writeLauncherProfile(versionId) {
  const cfg = config()
  const file = path.join(cfg.gameDir, 'launcher_profiles.json')
  let data = { profiles: {}, settings: {}, version: 3 }
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { /* fresh */ }
  data.profiles = data.profiles || {}
  data.profiles['NinoCraft'] = {
    name: 'NinoCraft',
    gameDir: cfg.gameDir,
    lastVersionId: versionId,
    icon: 'Cake',
    type: 'custom',
    created: new Date().toISOString(),
    lastUsed: new Date().toISOString()
  }
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)) } catch (e) { log(`Could not write launcher_profiles.json: ${e.message}`) }
}

async function prepare(cfg) {
  const mc = cfg.mcVersion
  if (!mc) throw new Error('No Minecraft version selected')
  let versionId
  switch (cfg.loader) {
    case 'fabric':
      await ensureMojangVersion(mc)
      versionId = await installFabric(mc, cfg.loaderVersion)
      break
    case 'quilt':
      await ensureMojangVersion(mc)
      versionId = await installQuilt(mc, cfg.loaderVersion)
      break
    case 'forge':
      versionId = await installForge(mc, cfg.loaderVersion)
      break
    case 'neoforge':
      versionId = await installNeoForge(mc, cfg.loaderVersion)
      break
    default:
      await ensureMojangVersion(mc)
      versionId = mc
  }
  const versionJson = loadVersionJson(versionId)
  if (!versionJson) throw new Error(`Could not load version ${versionId}`)
  emit('progress', { label: `Preparing ${versionId}`, current: 0, total: 0 })
  const { classList } = await ensureLibraries(versionJson)
  const classpath = [...classList]
  const forgeClientJar = path.join(config().gameDir, 'libraries', 'net', 'minecraft', 'client', mc, `client-${mc}-official.jar`)
  if (fs.existsSync(forgeClientJar) && !classpath.includes(forgeClientJar)) {
    classpath.unshift(forgeClientJar)
  }
  if (versionJson.downloads && versionJson.downloads.client) {
    const clientJar = path.join(config().gameDir, 'versions', versionId, `${versionId}.jar`)
    const clientMeta = versionJson.downloads.client
    if (!fs.existsSync(clientJar) || (clientMeta.size && fs.statSync(clientJar).size !== clientMeta.size)) {
      emit('progress', { label: `Downloading ${versionId}.jar`, current: 0, total: 0 })
      await http.download(clientMeta.url, clientJar, { headers: UA })
    }
    classpath.unshift(clientJar)
  }
  await ensureAssets(versionJson.assetIndex)
  const nativeDir = await ensureNatives(versionJson, versionId)
  if (cfg.writeProfiles) writeLauncherProfile(versionId)
  return { versionId, versionJson, classpath, nativeDir }
}

function substitute(value, ctx) {
  return value
    .replace(/\$\{launcher_name\}/g, 'NinoCraft')
    .replace(/\$\{launcher_version\}/g, '1.0.0')
    .replace(/\$\{game_directory\}/g, ctx.gameDir)
    .replace(/\$\{natives_directory\}/g, ctx.nativeDir)
    .replace(/\$\{library_directory\}/g, path.join(ctx.gameDir, 'libraries'))
    .replace(/\$\{classpath\}/g, ctx.classList)
    .replace(/\$\{version_name\}/g, ctx.versionId)
    .replace(/\$\{version_type\}/g, ctx.versionType)
    .replace(/\$\{assets_root\}/g, path.join(ctx.gameDir, 'assets'))
    .replace(/\$\{assets_index_name\}/g, ctx.assetIndexId)
    .replace(/\$\{auth_player_name\}/g, ctx.auth.name)
    .replace(/\$\{auth_uuid\}/g, ctx.auth.uuid)
    .replace(/\$\{auth_access_token\}/g, ctx.auth.accessToken)
    .replace(/\$\{auth_session\}/g, `${ctx.auth.accessToken}:${ctx.auth.uuid}`)
    .replace(/\$\{auth_xuid\}/g, ctx.auth.xuid || '')
    .replace(/\$\{clientid\}/g, ctx.auth.clientId || '')
    .replace(/\$\{user_type\}/g, ctx.auth.userType)
    .replace(/\$\{resolution_width\}/g, '854')
    .replace(/\$\{resolution_height\}/g, '480')
}

function buildLaunchArgs(prep, cfg, auth) {
  const ctx = {
    gameDir: cfg.gameDir,
    nativeDir: prep.nativeDir,
    versionId: prep.versionId,
    versionType: prep.versionJson.type || 'release',
    assetIndexId: (prep.versionJson.assetIndex || {}).id || 'legacy',
    classList: prep.classpath.map((p) => (path.isAbsolute(p) ? p : path.join(cfg.gameDir, 'libraries', p))).join(';'),
    auth
  }
  const args = [`-Xmx${cfg.ram}M`, '-Xms512M']

  const jvmFromJson = []
  for (const a of prep.versionJson.arguments && prep.versionJson.arguments.jvm || []) {
    if (typeof a === 'string') {
      if (/^(-cp|-classpath|-Djava\.library\.path|\$\{classpath\})/.test(a)) continue
      jvmFromJson.push(substitute(a, ctx))
    } else if (a && a.value && ruleAllows(a)) {
      const vals = Array.isArray(a.value) ? a.value : [a.value]
      for (const s of vals) {
        if (/^(-cp|-classpath|-Djava\.library\.path|\$\{classpath\})/.test(s)) continue
        jvmFromJson.push(substitute(s, ctx))
      }
    }
  }
  args.push('-Djava.library.path=' + prep.nativeDir)
  args.push(...jvmFromJson)
  args.push('-cp', ctx.classList)
  args.push(prep.versionJson.mainClass)

  if (prep.versionJson.arguments && prep.versionJson.arguments.game) {
    for (const a of prep.versionJson.arguments.game) {
      if (typeof a === 'string') args.push(substitute(a, ctx))
      else if (a && a.value && ruleAllows(a)) {
        const vals = Array.isArray(a.value) ? a.value : [a.value]
        for (const s of vals) args.push(substitute(s, ctx))
      }
    }
  } else if (prep.versionJson.minecraftArguments) {
    const tokens = prep.versionJson.minecraftArguments.split(' ').filter(Boolean)
    for (const t of tokens) args.push(substitute(t, ctx))
  }

  return args
}

let childProcess = null

function launch(auth) {
  return new Promise(async (resolve, reject) => {
    try {
      const cfg = config()
      const prep = await prepare(cfg)
      const javaPath = cfg.javaPath || findJava()
      if (!javaPath) throw new Error('Could not find Java. Install Java 21+ or set the path in Settings.')
      const requiredJava = (prep.versionJson.javaVersion && prep.versionJson.javaVersion.majorVersion) || 8
      const haveJava = javaMajor(javaPath)
      if (haveJava && haveJava < requiredJava) {
        throw new Error(`This Minecraft version requires Java ${requiredJava}+, but ${path.basename(javaPath)} provides Java ${haveJava}.`)
      }
      const args = buildLaunchArgs(prep, cfg, auth)
      log(`Launching with ${javaPath}`)
      log(`Version: ${prep.versionId}`)
      log(`User: ${auth.name}`)
      log('Starting Minecraft...')

      const child = spawn(javaPath, args, { cwd: cfg.gameDir, windowsHide: true })
      childProcess = child
      child.stdout.on('data', (d) => log(d.toString().replace(/\n+$/, '')))
      child.stderr.on('data', (d) => log(d.toString().replace(/\n+$/, '')))
      child.on('error', reject)
      child.on('exit', (code, signal) => {
        childProcess = null
        log(`Minecraft exited (code ${code}${signal ? ', ' + signal : ''})`)
        emit('game:exit', { code, signal })
      })
      resolve({ pid: child.pid })
    } catch (e) {
      reject(e)
    }
  })
}

function stopGame() {
  if (childProcess) {
    try { childProcess.kill() } catch { /* ignore */ }
  }
}

function isRunning() {
  return !!childProcess
}

module.exports = {
  init, listAvailableVersions, findJava, launch, stopGame, isRunning, prepare,
  loadVersionJson, getManifest, ensureMojangVersion, buildLaunchArgs,
  installFabric, installQuilt, installForge, installNeoForge
}
