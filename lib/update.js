const { app, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')

let win = null

function send(channel, ...args) {
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, ...args) } catch { /* ignore */ }
  }
}

function init(window) {
  win = window
  if (!app.isPackaged) return
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    send('update:available', { version: info.version, releaseDate: info.releaseDate })
  })
  autoUpdater.on('update-not-available', () => {
    send('update:none')
  })
  autoUpdater.on('error', (err) => {
    send('update:error', err ? err.message : 'update failed')
  })
  autoUpdater.on('download-progress', (p) => {
    send('update:progress', { percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond })
  })
  autoUpdater.on('update-downloaded', () => {
    send('update:downloaded')
  })

  ipcMain.handle('update:check', () => {
    if (!app.isPackaged) return { ok: false, error: 'dev mode' }
    autoUpdater.checkForUpdates().catch((err) => {
      send('update:error', err ? err.message : 'check failed')
    })
    return { ok: true }
  })

  ipcMain.handle('update:download', () => {
    autoUpdater.downloadUpdate().catch((err) => {
      send('update:error', err ? err.message : 'download failed')
    })
    return { ok: true }
  })

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
    return { ok: true }
  })

  setTimeout(() => {
    if (win && !win.isDestroyed()) {
      autoUpdater.checkForUpdates().catch(() => { /* network issues are silent at startup */ })
    }
  }, 4000)
}

module.exports = { init }
