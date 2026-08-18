const path = require('path')
const { app } = require('electron')

function root() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'appdata')
    : path.join(__dirname, '..')
}

module.exports = { root }
