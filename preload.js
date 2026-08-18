const { contextBridge, ipcRenderer } = require('electron')

function on(channel, fn) {
  const wrapped = (_e, ...args) => fn(...args)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

contextBridge.exposeInMainWorld('nino', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    browseGameDir: () => ipcRenderer.invoke('settings:browseGameDir')
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    setActive: (id) => ipcRenderer.invoke('profiles:setActive', id),
    update: (patch) => ipcRenderer.invoke('profiles:update', patch),
    create: (name) => ipcRenderer.invoke('profiles:create', name),
    remove: (id) => ipcRenderer.invoke('profiles:remove', id)
  },
  packs: {
    list: () => ipcRenderer.invoke('packs:list'),
    set: (name, enabled) => ipcRenderer.invoke('packs:set', name, enabled),
    openFolder: () => ipcRenderer.invoke('packs:openFolder')
  },
  shaders: {
    list: () => ipcRenderer.invoke('shaders:list'),
    set: (name) => ipcRenderer.invoke('shaders:set', name),
    openFolder: () => ipcRenderer.invoke('shaders:openFolder'),
    installIris: () => ipcRenderer.invoke('shaders:installIris')
  },
  paths: () => ipcRenderer.invoke('paths:get'),
  versions: () => ipcRenderer.invoke('versions:list'),
  findJava: () => ipcRenderer.invoke('java:find'),
  modrinth: {
    search: (args) => ipcRenderer.invoke('modrinth:search', args),
    project: (id) => ipcRenderer.invoke('modrinth:project', id),
    versions: (id) => ipcRenderer.invoke('modrinth:versions', id),
    install: (args) => ipcRenderer.invoke('modrinth:install', args)
  },
  mods: {
    list: () => ipcRenderer.invoke('mods:list'),
    remove: (fileName) => ipcRenderer.invoke('mods:remove', fileName)
  },
  modpacks: {
    install: (args) => ipcRenderer.invoke('modpacks:install', args),
    list: () => ipcRenderer.invoke('modpacks:list'),
    remove: (slug) => ipcRenderer.invoke('modpacks:remove', slug)
  },
  account: {
    get: () => ipcRenderer.invoke('account:get'),
    loginOffline: (name) => ipcRenderer.invoke('account:loginOffline', name),
    msLogin: () => ipcRenderer.invoke('account:msLogin'),
    logout: () => ipcRenderer.invoke('account:logout')
  },
  game: {
    launch: () => ipcRenderer.invoke('game:launch'),
    stop: () => ipcRenderer.invoke('game:stop'),
    running: () => ipcRenderer.invoke('game:running'),
    openModsFolder: () => ipcRenderer.invoke('game:openModsFolder'),
    openGameDir: () => ipcRenderer.invoke('game:openGameDir'),
    openOfficialLauncher: () => ipcRenderer.invoke('game:openOfficialLauncher')
  },
  ui: {
    getState: () => ipcRenderer.invoke('ui:getState'),
    set: (enabled) => ipcRenderer.invoke('ui:set', enabled)
  },
  ninomod: {
    getState: () => ipcRenderer.invoke('ninomod:getState'),
    set: (enabled) => ipcRenderer.invoke('ninomod:set', enabled)
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onAvailable: (fn) => on('update:available', fn),
    onNone: (fn) => on('update:none', fn),
    onProgress: (fn) => on('update:progress', fn),
    onDownloaded: (fn) => on('update:downloaded', fn),
    onError: (fn) => on('update:error', fn)
  },
  test: () => ipcRenderer.invoke('download:test'),
  onProgress: (fn) => on('progress', fn),
  onLog: (fn) => on('log', fn),
  onGameExit: (fn) => on('game:exit', fn),
  onAccountStatus: (fn) => on('account:status', fn),
  onAccountDone: (fn) => on('account:done', fn)
})
