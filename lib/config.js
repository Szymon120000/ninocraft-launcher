const fs = require('fs')
const path = require('path')

let file = ''

function defaults() {
  return {
    gameDir: path.join(process.env.APPDATA || '', '.minecraft'),
    javaPath: '',
    username: 'Nino',
    accounts: {},
    activeAccountId: null,
    writeProfiles: true,
    uiPack: true,
    profiles: {
      default: { name: 'Default', mcVersion: '', loader: 'fabric', loaderVersion: '', ram: 4096 }
    },
    activeProfile: 'default'
  }
}

function init(app) {
  file = path.join(app.getPath('userData'), 'config.json')
  if (!fs.existsSync(file)) {
    const d = defaults()
    save(d)
    return d
  }
  return load()
}

function load() {
  let cfg
  let hadProfiles = true
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    hadProfiles = !!(parsed && parsed.profiles && Object.keys(parsed.profiles).length)
    cfg = { ...defaults(), ...parsed }
  } catch {
    cfg = defaults()
  }
  migrate(cfg, hadProfiles)
  return cfg
}

function migrate(cfg, hadProfiles) {
  let changed = false
  if (!hadProfiles) {
    cfg.profiles = {
      default: {
        name: 'Default',
        mcVersion: cfg.mcVersion || '',
        loader: cfg.loader || 'fabric',
        loaderVersion: cfg.loaderVersion || '',
        ram: cfg.ram || 4096
      }
    }
    cfg.activeProfile = 'default'
    changed = true
  }
  for (const k of ['mcVersion', 'loader', 'loaderVersion', 'ram']) delete cfg[k]
  if (!cfg.activeProfile || !cfg.profiles[cfg.activeProfile]) {
    cfg.activeProfile = Object.keys(cfg.profiles)[0] || 'default'
    changed = true
  }
  for (const [id, p] of Object.entries(cfg.profiles)) {
    if (!p || typeof p !== 'object') { cfg.profiles[id] = { name: id }; changed = true }
    if (!p.name) p.name = id
  }
  if (!cfg.accounts || typeof cfg.accounts !== 'object') cfg.accounts = {}
  if (cfg.account && typeof cfg.account === 'object' && cfg.account.uuid) {
    if (!cfg.accounts[cfg.account.uuid]) {
      cfg.accounts[cfg.account.uuid] = cfg.account
      changed = true
    }
    if (!cfg.activeAccountId) cfg.activeAccountId = cfg.account.uuid
    delete cfg.account
    changed = true
  }
  if (!cfg.activeAccountId || !cfg.accounts[cfg.activeAccountId]) {
    const keys = Object.keys(cfg.accounts)
    cfg.activeAccountId = keys.length ? keys[0] : null
    changed = true
  }
  if (changed) save(cfg)
  return cfg
}

function save(cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2))
}

function effective() {
  const raw = load()
  const prof = (raw.profiles && raw.profiles[raw.activeProfile]) || {}
  return {
    ...defaults(),
    ...raw,
    ...prof,
    profiles: raw.profiles,
    activeProfile: raw.activeProfile
  }
}

function listProfiles() {
  const c = load()
  const profiles = Object.entries(c.profiles || {}).map(([id, p]) => ({ id, name: p.name, mcVersion: p.mcVersion || '', loader: p.loader || 'fabric', loaderVersion: p.loaderVersion || '', ram: p.ram || 4096 }))
  return { profiles, active: c.activeProfile }
}

function setActive(id) {
  const c = load()
  if (c.profiles && c.profiles[id]) {
    c.activeProfile = id
    save(c)
  }
  return c.activeProfile
}

function updateActive(patch) {
  const c = load()
  const prof = c.profiles[c.activeProfile]
  if (prof && patch && typeof patch === 'object') {
    Object.assign(prof, patch)
    save(c)
  }
  return c.activeProfile
}

function createProfile(name) {
  const c = load()
  const template = c.profiles[c.activeProfile] || {}
  let n = Object.keys(c.profiles || {}).length + 1
  let id = 'profile' + n
  while (c.profiles[id]) id = 'profile' + (++n)
  c.profiles[id] = {
    name: (name && String(name).trim()) || 'Profile ' + n,
    mcVersion: template.mcVersion || '',
    loader: template.loader || 'fabric',
    loaderVersion: template.loaderVersion || '',
    ram: template.ram || 4096
  }
  c.activeProfile = id
  save(c)
  return id
}

function removeProfile(id) {
  const c = load()
  if (!c.profiles || !c.profiles[id]) return
  delete c.profiles[id]
  if (c.activeProfile === id) {
    const keys = Object.keys(c.profiles)
    c.activeProfile = keys.length ? keys[0] : 'default'
    if (!c.profiles[c.activeProfile]) { c.profiles[c.activeProfile] = { name: 'Default', loader: 'fabric', ram: 4096 } }
  }
  save(c)
}

function listAccounts() {
  const c = load()
  const accounts = Object.entries(c.accounts || {}).map(([id, a]) => ({
    uuid: id,
    name: a.name,
    type: a.type,
    userType: a.userType || '',
    active: id === c.activeAccountId
  }))
  return { accounts, activeId: c.activeAccountId }
}

function getActiveAccount() {
  const c = load()
  if (!c.activeAccountId || !c.accounts || !c.accounts[c.activeAccountId]) return null
  return c.accounts[c.activeAccountId]
}

function addAccount(account) {
  const c = load()
  if (!account || !account.uuid) return null
  c.accounts[account.uuid] = account
  c.activeAccountId = account.uuid
  save(c)
  return account.uuid
}

function removeAccount(uuid) {
  const c = load()
  if (!c.accounts || !c.accounts[uuid]) return false
  delete c.accounts[uuid]
  if (c.activeAccountId === uuid) {
    const keys = Object.keys(c.accounts)
    c.activeAccountId = keys.length ? keys[0] : null
  }
  save(c)
  return true
}

function setActiveAccount(uuid) {
  const c = load()
  if (!c.accounts || !c.accounts[uuid]) return c.activeAccountId
  c.activeAccountId = uuid
  save(c)
  return c.activeAccountId
}

function refreshAccountData(uuid, updated) {
  const c = load()
  if (!c.accounts || !c.accounts[uuid]) return
  Object.assign(c.accounts[uuid], updated)
  save(c)
}

module.exports = { init, load, save, defaults, effective, listProfiles, setActive, updateActive, createProfile, removeProfile, listAccounts, getActiveAccount, addAccount, removeAccount, setActiveAccount, refreshAccountData }
