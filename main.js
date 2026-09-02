const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const config = require('./lib/config')
const http = require('./lib/http')
const modrinth = require('./lib/modrinth')
const game = require('./lib/game')
const auth = require('./lib/auth')
const uipack = require('./lib/uipack')
const packs = require('./lib/packs')
const shaders = require('./lib/shaders')
const ninomod = require('./lib/ninocraft-mod')
const update = require('./lib/update')

let win = null

function send(channel, ...args) {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, ...args) } catch { /* ignore */ }
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 900,
    minHeight: 620,
    title: 'NinoCraft',
    backgroundColor: '#fff5f7',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.on('closed', () => { win = null })
}

function registerIpc() {
  ipcMain.handle('settings:get', () => config.load())

  ipcMain.handle('settings:set', (_e, patch) => {
    const cfg = config.load()
    const guarded = { ...patch }
    delete guarded.profiles
    delete guarded.activeProfile
    delete guarded.mcVersion
    delete guarded.loader
    delete guarded.loaderVersion
    delete guarded.ram
    Object.assign(cfg, guarded)
    config.save(cfg)
    return config.load()
  })

  ipcMain.handle('profiles:list', () => config.listProfiles())
  ipcMain.handle('profiles:setActive', (_e, id) => { config.setActive(id); return config.listProfiles() })
  ipcMain.handle('profiles:update', (_e, patch) => { config.updateActive(patch); return config.listProfiles() })
  ipcMain.handle('profiles:create', (_e, name) => { config.createProfile(name); return config.listProfiles() })
  ipcMain.handle('profiles:remove', (_e, id) => { config.removeProfile(id); return config.listProfiles() })

  ipcMain.handle('settings:browseGameDir', async (e) => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Choose .minecraft folder' })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('paths:get', () => {
    const cfg = config.load()
    return {
      gameDir: cfg.gameDir,
      modsDir: path.join(cfg.gameDir, 'mods'),
      versionsDir: path.join(cfg.gameDir, 'versions'),
      launcher: path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Minecraft Launcher', 'MinecraftLauncher.exe')
    }
  })

  ipcMain.handle('versions:list', () => game.listAvailableVersions())

  ipcMain.handle('java:find', () => game.findJava())

  ipcMain.handle('modrinth:search', (_e, args) => modrinth.search(args || {}))
  ipcMain.handle('modrinth:project', (_e, id) => modrinth.getProject(id))
  ipcMain.handle('modrinth:versions', (_e, id) => {
    const cfg = config.effective()
    return modrinth.getProjectVersions(id, cfg.mcVersion, cfg.loader)
  })

  ipcMain.handle('modrinth:install', async (_e, args) => {
    const [project, version] = await Promise.all([modrinth.getProject(args.projectId), modrinth.getVersion(args.versionId)])
    return modrinth.installMod(project, version)
  })

  ipcMain.handle('mods:list', () => modrinth.listMods())
  ipcMain.handle('mods:remove', (_e, fileName) => modrinth.removeMod(fileName))

  ipcMain.handle('modpacks:install', async (_e, args) => {
    const [project, version] = await Promise.all([modrinth.getProject(args.projectId), modrinth.getVersion(args.versionId)])
    return modrinth.installModpack(project, version)
  })
  ipcMain.handle('modpacks:list', () => modrinth.listModpacks())
  ipcMain.handle('modpacks:remove', (_e, slug) => modrinth.removeModpack(slug))

  ipcMain.handle('accounts:list', () => config.listAccounts())

  ipcMain.handle('accounts:addOffline', (_e, name) => {
    const acc = auth.offlineAccount(name)
    config.addAccount(acc)
    return config.listAccounts()
  })

  ipcMain.handle('accounts:addMs', async () => {
    const acc = await auth.msLogin()
    config.addAccount(acc)
    return config.listAccounts()
  })

  ipcMain.handle('accounts:remove', (_e, uuid) => {
    config.removeAccount(uuid)
    return config.listAccounts()
  })

  ipcMain.handle('accounts:setActive', (_e, uuid) => {
    config.setActiveAccount(uuid)
    return config.listAccounts()
  })

  ipcMain.handle('account:get', () => {
    const acc = config.getActiveAccount()
    if (!acc) return null
    return { type: acc.type, name: acc.name, uuid: acc.uuid, expiresAt: acc.expiresAt || null }
  })

  ipcMain.handle('game:launch', async () => {
    const cfg = config.load()
    if (cfg.uiPack !== false) uipack.apply(cfg.gameDir, true)
    let acc = config.getActiveAccount() || auth.offlineAccount(cfg.username)
    if (acc.type === 'ms') {
      const refreshed = await auth.refreshAccount(acc)
      if (refreshed !== acc) config.refreshAccountData(acc.uuid, refreshed)
      acc = refreshed
    }
    const result = await game.launch(acc)
    return result
  })

  ipcMain.handle('game:stop', () => game.stopGame())
  ipcMain.handle('game:running', () => game.isRunning())

  ipcMain.handle('game:openModsFolder', () => {
    const cfg = config.load()
    fs.mkdirSync(path.join(cfg.gameDir, 'mods'), { recursive: true })
    shell.openPath(path.join(cfg.gameDir, 'mods'))
  })

  ipcMain.handle('game:openGameDir', () => {
    const cfg = config.load()
    shell.openPath(cfg.gameDir)
  })

  ipcMain.handle('game:openOfficialLauncher', async () => {
    const candidates = [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Minecraft Launcher', 'MinecraftLauncher.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Minecraft Launcher', 'minecraft-launcher.exe'),
      path.join(process.env.ProgramFiles || '', 'Minecraft Launcher', 'MinecraftLauncher.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'Minecraft Launcher', 'MinecraftLauncher.exe')
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        spawn(c, [], { detached: true, stdio: 'ignore' }).unref()
        return { launched: true, path: c }
      }
    }
    return { launched: false }
  })

  ipcMain.handle('download:test', async () => {
    try {
      const m = await game.getManifest()
      return { ok: true, latest: m.latest }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('ui:getState', () => {
    const cfg = config.load()
    return uipack.getState(cfg.gameDir)
  })

  ipcMain.handle('ui:set', (_e, enabled) => {
    const cfg = config.load()
    cfg.uiPack = !!enabled
    config.save(cfg)
    const r = uipack.apply(cfg.gameDir, !!enabled)
    return { ok: r.ok, state: uipack.getState(cfg.gameDir) }
  })

  ipcMain.handle('ninomod:getState', () => {
    const cfg = config.load()
    return ninomod.getState(cfg.gameDir)
  })

  ipcMain.handle('ninomod:set', (_e, enabled) => {
    const cfg = config.load()
    cfg.ninoModules = !!enabled
    config.save(cfg)
    if (enabled) ninomod.install(cfg.gameDir)
    else ninomod.remove(cfg.gameDir)
    return ninomod.getState(cfg.gameDir)
  })

  ipcMain.handle('packs:list', () => {
    const cfg = config.load()
    return packs.listPacks(cfg.gameDir)
  })

  ipcMain.handle('packs:set', (_e, name, enabled) => {
    const cfg = config.load()
    return packs.setEnabled(cfg.gameDir, name, !!enabled)
  })

  ipcMain.handle('packs:openFolder', () => {
    const cfg = config.load()
    fs.mkdirSync(path.join(cfg.gameDir, 'resourcepacks'), { recursive: true })
    shell.openPath(path.join(cfg.gameDir, 'resourcepacks'))
  })

  ipcMain.handle('shaders:list', () => {
    const cfg = config.load()
    return shaders.listShaders(cfg.gameDir)
  })

  ipcMain.handle('shaders:set', (_e, name) => {
    const cfg = config.load()
    return shaders.setShader(cfg.gameDir, name)
  })

  ipcMain.handle('shaders:openFolder', () => {
    const cfg = config.load()
    fs.mkdirSync(path.join(cfg.gameDir, 'shaderpacks'), { recursive: true })
    shell.openPath(path.join(cfg.gameDir, 'shaderpacks'))
  })

  ipcMain.handle('shaders:installIris', async () => {
    const cfg = config.effective()
    const search = await modrinth.search({ query: 'iris', type: 'mod' })
    const proj = (search.hits || []).find((h) => h.slug === 'iris')
    if (!proj) throw new Error('Iris not found on Modrinth')
    const versions = await modrinth.getProjectVersions(proj.project_id, cfg.mcVersion, cfg.loader)
    if (!versions.length) throw new Error(`Iris has no version for Minecraft ${cfg.mcVersion} + ${cfg.loader}`)
    const ver = versions.find((v) => v.version_type === 'release') || versions[0]
    await modrinth.installMod(proj, ver)
    return { ok: true, version: ver.version_number }
  })
}

app.whenReady().then(() => {
  config.init(app)
  const cfg = config.load()
  const bus = (ch, ...a) => send(ch, ...a)
  modrinth.init(() => config.effective(), bus)
  game.init(() => config.effective(), bus)
  auth.init(bus)
  if (cfg.uiPack !== false) uipack.apply(cfg.gameDir, true)
  Menu.setApplicationMenu(null)
  createWindow()
  registerIpc()
  update.init(win)
})

app.on('window-all-closed', () => {
  game.stopGame()
  app.quit()
})

app.on('before-quit', () => game.stopGame())
