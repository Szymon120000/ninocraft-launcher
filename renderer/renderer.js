const ninoApi = window.nino
const $ = (id) => document.getElementById(id)

let settings = null
let installedMods = []
let installedPacks = []
let gameRunning = false
let searchController = null

function log(msg) {
  const el = $('console')
  const text = typeof msg === 'string' ? msg : String(msg)
  const lines = el.textContent.split('\n')
  lines.push(text)
  if (lines.length > 600) lines.splice(0, lines.length - 600)
  el.textContent = lines.join('\n')
  el.scrollTop = el.scrollHeight
}

function setStatus(id, text, isError) {
  const el = $(id)
  el.textContent = text
  el.className = 'status-line' + (isError ? ' error' : '')
}

function showProgress(label, current, total) {
  const wrap = $('progress-wrap')
  wrap.hidden = false
  $('progress-label').textContent = label || ''
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : current > 0 ? 100 : 12
  $('progress-fill').style.width = pct + '%'
}

function hideProgress() {
  $('progress-wrap').hidden = true
  $('progress-fill').style.width = '0%'
}

async function saveSettings() {
  settings = await ninoApi.settings.set(settings)
}

function fmtSize(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1024).toFixed(0) + ' KB'
}

function fmtCount(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

/* ---------- titlebar ---------- */
function setupTitlebar() {
  $('btn-minimize').addEventListener('click', () => nino.titlebar.minimize())
  $('btn-maximize').addEventListener('click', () => nino.titlebar.maximize())
  $('btn-close').addEventListener('click', () => nino.titlebar.close())
}

/* ---------- tabs ---------- */
function setupTabs() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'))
      $('tab-' + btn.dataset.tab).classList.add('active')
      if (btn.dataset.tab === 'mods') refreshInstalledMods()
      if (btn.dataset.tab === 'modpacks') refreshInstalledPacks()
      if (btn.dataset.tab === 'packs') refreshPacks()
      if (btn.dataset.tab === 'shaders') refreshShaders()
      if (btn.dataset.tab === 'account') renderAccount()
    })
  })
}

/* ---------- versions ---------- */
async function loadVersions() {
  const data = await ninoApi.versions()
  if (!settings.mcVersion) {
    settings.mcVersion = data.latest.release
    await saveSettings()
  }
  const select = $('mc-version')
  select.innerHTML = ''
  const releases = data.versions.filter((v) => v.type === 'release')
  const snapshots = data.versions.filter((v) => v.type === 'snapshot')
  const group = (title, arr) => {
    const optgroup = document.createElement('optgroup')
    optgroup.label = title
    arr.forEach((v) => {
      const opt = document.createElement('option')
      opt.value = v.id
      opt.textContent = v.id
      optgroup.appendChild(opt)
    })
    select.appendChild(optgroup)
  }
  group('Releases', releases)
  group('Snapshots', snapshots.slice(0, 15))
  select.value = settings.mcVersion
  $('play-status').textContent = ''
}

/* ---------- play tab ---------- */
function setupPlay() {
  $('mc-version').addEventListener('change', async () => {
    settings.mcVersion = $('mc-version').value
    await saveSettings()
  })
  $('mc-loader').addEventListener('change', async () => {
    settings.loader = $('mc-loader').value
    await saveSettings()
  })
  $('ram-slider').addEventListener('input', () => {
    $('ram-label').textContent = $('ram-slider').value
  })
  $('ram-slider').addEventListener('change', async () => {
    settings.ram = parseInt($('ram-slider').value, 10)
    await saveSettings()
  })

  $('btn-play').addEventListener('click', onPlay)
  $('btn-stop').addEventListener('click', async () => {
    await ninoApi.game.stop()
    log('Stopping Minecraft...')
  })
  $('btn-official').addEventListener('click', async () => {
    const r = await ninoApi.game.openOfficialLauncher()
    log(r.launched ? `Opened official launcher (${r.path})` : 'Official launcher not found')
  })
  $('btn-open-mods').addEventListener('click', () => ninoApi.game.openModsFolder())

  ninoApi.onProgress((p) => showProgress(p.label, p.current || 0, p.total || 0))
  ninoApi.onLog((line) => {
    hideProgress()
    log(line)
  })
  ninoApi.onGameExit(() => {
    gameRunning = false
    $('btn-play').disabled = false
    $('btn-play').textContent = 'Launch'
    $('btn-stop').hidden = true
    hideProgress()
  })
}

async function onPlay() {
  if (gameRunning) return
  setStatus('play-status', 'Firing up...')
  $('btn-play').disabled = true
  $('btn-play').textContent = 'Launching...'
  $('btn-stop').hidden = false
  log('== 67 Skid launch session ==')
  try {
    await ninoApi.game.launch()
    gameRunning = true
    setStatus('play-status', 'Minecraft is running!')
    $('btn-play').disabled = true
    $('btn-play').textContent = 'In game...'
  } catch (e) {
    log('Error: ' + (e.message || e))
    setStatus('play-status', 'Launch failed: ' + (e.message || e), true)
    gameRunning = false
    $('btn-play').disabled = false
    $('btn-play').textContent = 'Launch'
    $('btn-stop').hidden = true
    hideProgress()
  }
}

/* ---------- modrinth helpers ---------- */
function bestVersion(versions) {
  return versions.find((v) => v.version_type === 'release') || versions[0]
}

function versionTag(ver) {
  const mc = (ver.game_versions || []).slice(0, 3).join('/')
  const ld = (ver.loaders || []).slice(0, 2).join('/')
  const parts = []
  if (mc) parts.push('MC ' + mc)
  if (ld) parts.push(ld)
  return (parts.length ? ' for ' : '') + parts.join(' + ')
}

function cardFor(hit, type) {
  const card = document.createElement('div')
  card.className = 'mcard'

  const head = document.createElement('div')
  head.className = 'mcard-head'
  const img = document.createElement('img')
  img.className = 'mcard-icon'
  img.src = hit.icon_url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44"><rect width="44" height="44" rx="12" fill="%23ffb3c6"/></svg>'
  img.alt = ''
  const title = document.createElement('div')
  title.className = 'mcard-title'
  title.textContent = hit.title
  head.appendChild(img)
  head.appendChild(title)

  const desc = document.createElement('div')
  desc.className = 'mcard-desc'
  desc.textContent = hit.description || ''

  const foot = document.createElement('div')
  foot.className = 'mcard-foot'
  const stats = document.createElement('div')
  stats.className = 'mcard-stats'
  stats.textContent = fmtCount(hit.downloads || 0) + ' downloads'
  const btn = document.createElement('button')
  btn.className = 'btn small'
  btn.textContent = type === 'modpack' ? 'Install pack' : 'Install'
  btn.addEventListener('click', async () => {
    btn.disabled = true
    btn.textContent = 'Loading...'
    setStatus(type === 'modpack' ? 'packs-status' : 'mods-status', 'Checking versions...')
    try {
      const versions = await ninoApi.modrinth.versions(hit.project_id)
      if (!versions.length) throw new Error('No version for your Minecraft version / loader')
      const ver = bestVersion(versions)
      if (type === 'modpack') {
        setStatus('packs-status', `Installing ${hit.title} v${ver.version_number}${versionTag(ver)}...`)
        await ninoApi.modpacks.install({ projectId: hit.project_id, versionId: ver.id })
        setStatus('packs-status', `Installed ${hit.title} v${ver.version_number}${versionTag(ver)}`)
        refreshInstalledPacks()
      } else {
        setStatus('mods-status', `Installing ${hit.title} v${ver.version_number}${versionTag(ver)}...`)
        await ninoApi.modrinth.install({ projectId: hit.project_id, versionId: ver.id })
        setStatus('mods-status', `Installed ${hit.title} v${ver.version_number}${versionTag(ver)}`)
        refreshInstalledMods()
      }
      hideProgress()
    } catch (e) {
      hideProgress()
      setStatus(type === 'modpack' ? 'packs-status' : 'mods-status', 'Failed: ' + (e.message || e), true)
    } finally {
      btn.disabled = false
      btn.textContent = type === 'modpack' ? 'Install pack' : 'Install'
    }
  })
  foot.appendChild(stats)
  foot.appendChild(btn)

  card.appendChild(head)
  card.appendChild(desc)
  card.appendChild(foot)
  return card
}

function setupSearch(inputId, btnId, resultsId, statusId, type) {
  const input = $(inputId)
  const run = async () => {
    const q = input.value.trim()
    const el = $(resultsId)
    el.innerHTML = ''
    if (!q) {
    setStatus(statusId, 'Type a search to find ' + (type === 'modpack' ? 'modpacks' : 'mods') + '.')
      return
    }
    setStatus(statusId, 'Searching...')
    try {
      const data = await ninoApi.modrinth.search({ query: q, type })
      const hits = data.hits || []
    setStatus(statusId, `Found ${hits.length} result${hits.length === 1 ? '' : 's'}.`)
      hits.forEach((h) => el.appendChild(cardFor(h, type)))
    } catch (e) {
    setStatus(statusId, 'Search failed: ' + (e.message || e), true)
    }
  }
  $(btnId).addEventListener('click', run)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run() })
}

/* ---------- installed ---------- */
function itemFor(entry, removeFn) {
  const item = document.createElement('div')
  item.className = 'item'
  const img = document.createElement('img')
  img.className = 'item-icon'
  img.src = entry.icon || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" rx="10" fill="%23ffb3c6"/></svg>'
  img.alt = ''
  const info = document.createElement('div')
  info.className = 'item-info'
  const t = document.createElement('div')
  t.className = 'item-title'
  t.textContent = entry.title
  const sub = document.createElement('div')
  sub.className = 'item-sub'
  sub.textContent = (entry.versionName ? 'v' + entry.versionName + ' · ' : '') + fmtSize(entry.size || 0) + (entry.managed ? '' : ' · unmanaged')
  info.appendChild(t)
  info.appendChild(sub)
  const rm = document.createElement('button')
  rm.className = 'btn ghost small'
  rm.textContent = 'Remove'
  rm.addEventListener('click', async () => {
    rm.disabled = true
    try {
      await removeFn()
    } finally { }
  })
  item.appendChild(img)
  item.appendChild(info)
  item.appendChild(rm)
  return item
}

async function refreshInstalledMods() {
  const el = $('installed-mods')
  el.innerHTML = ''
  try {
    installedMods = await ninoApi.mods.list()
  } catch (e) {
    installedMods = []
  }
  if (!installedMods.length) {
    el.innerHTML = '<div class="hint">Nothing here yet. Search above or drag .jar files in.</div>'
    return
  }
  installedMods.forEach((m) => {
    el.appendChild(itemFor(m, async () => {
      await ninoApi.mods.remove(m.fileName)
      setStatus('mods-status', `Removed ${m.fileName}`)
      refreshInstalledMods()
    }))
  })
}

async function refreshInstalledPacks() {
  const el = $('installed-packs')
  el.innerHTML = ''
  try {
    installedPacks = await ninoApi.modpacks.list()
  } catch (e) {
    installedPacks = []
  }
  if (!installedPacks.length) {
    el.innerHTML = '<div class="hint">No modpacks installed.</div>'
    return
  }
  installedPacks.forEach((p) => {
    el.appendChild(itemFor({ title: p.title, versionName: p.versionName, icon: p.icon, size: 0, managed: true }, async () => {
      await ninoApi.modpacks.remove(p.slug)
      setStatus('packs-status', `Removed ${p.title}`)
      refreshInstalledPacks()
    }))
  })
}

/* ---------- resource packs ---------- */
async function refreshPacks() {
  const el = $('packs-list')
  el.innerHTML = ''
  let list = []
  try {
    list = await ninoApi.packs.list()
  } catch (e) {
    setStatus('packs-status', 'Couldn\'t load packs: ' + (e.message || e), true)
    return
  }
  if (!list.length) {
    el.innerHTML = '<div class="hint">No packs found. Drop .zip resource packs here or into the folder.</div>'
    setStatus('packs-status', '')
    return
  }
  setStatus('packs-status', list.length + ' pack' + (list.length === 1 ? '' : 's') + ' found.')
  for (const p of list) {
    const item = document.createElement('div')
    item.className = 'item'
    const img = document.createElement('img')
    img.className = 'item-icon'
    img.src = p.icon || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" rx="10" fill="%23ffb3c6"/></svg>'
    img.alt = ''
    const info = document.createElement('div')
    info.className = 'item-info'
    const t = document.createElement('div')
    t.className = 'item-title'
    t.textContent = p.name
    const sub = document.createElement('div')
    sub.className = 'item-sub'
    sub.textContent = (p.description || 'no description') + (p.pack_format ? ' \u00b7 format ' + p.pack_format : '')
    info.appendChild(t)
    info.appendChild(sub)
    const btn = document.createElement('button')
    btn.className = 'btn small ' + (p.enabled ? 'ghost' : '')
    btn.textContent = p.enabled ? 'Disable' : 'Enable'
    btn.addEventListener('click', async () => {
      btn.disabled = true
      try {
        await ninoApi.packs.set(p.name, !p.enabled)
        refreshPacks()
      } catch (e) {
        setStatus('packs-status', 'Failed: ' + (e.message || e), true)
        btn.disabled = false
      }
    })
    item.appendChild(img)
    item.appendChild(info)
    item.appendChild(btn)
    el.appendChild(item)
  }
}

/* ---------- shaders ---------- */
async function refreshShaders() {
  const el = $('shaders-list')
  el.innerHTML = ''
  let data = null
  try {
    data = await ninoApi.shaders.list()
  } catch (e) {
    setStatus('shaders-status', 'Couldn\'t load shaders: ' + (e.message || e), true)
    return
  }
  $('shaders-warn').hidden = data.iris
  if (!data.packs.length) {
    el.innerHTML = '<div class="hint">No shaders found. Drop .zip shader packs here or into the folder.</div>'
  } else {
    for (const p of data.packs) {
      const item = document.createElement('div')
      item.className = 'item'
      const img = document.createElement('img')
      img.className = 'item-icon'
      img.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" rx="10" fill="%23e8436b"/><path d="M7 24 L14 15 L20 22 L26 13 L29 17 L29 27 Z" fill="%23ffd9e2"/></svg>'
      img.alt = ''
      const info = document.createElement('div')
      info.className = 'item-info'
      const t = document.createElement('div')
      t.className = 'item-title'
      t.textContent = p.name
      const sub = document.createElement('div')
      sub.className = 'item-sub'
      sub.textContent = fmtSize(p.size || 0) + (p.active ? ' \u00b7 active' : '')
      info.appendChild(t)
      info.appendChild(sub)
      const btn = document.createElement('button')
      btn.className = 'btn small ' + (p.active ? 'ghost' : '')
      btn.textContent = p.active ? 'Disable' : 'Use'
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await ninoApi.shaders.set(p.active ? null : p.name)
          refreshShaders()
        } catch (e) {
          setStatus('shaders-status', 'Failed: ' + (e.message || e), true)
          btn.disabled = false
        }
      })
      item.appendChild(img)
      item.appendChild(info)
      item.appendChild(btn)
      el.appendChild(item)
    }
  }
  setStatus('shaders-status', !data.iris ? 'Iris isn\'t installed \u2014 shaders need it.' : (data.active ? 'Active shader: ' + data.active : 'No shader active.'))
}

function setupPacks() {
  $('btn-packs-open').addEventListener('click', () => ninoApi.packs.openFolder())
  $('btn-shaders-open').addEventListener('click', () => ninoApi.shaders.openFolder())
  $('btn-install-iris').addEventListener('click', async () => {
    const btn = $('btn-install-iris')
    btn.disabled = true
    btn.textContent = 'Installing...'
    setStatus('shaders-status', 'Looking up Iris...')
    try {
      const r = await ninoApi.shaders.installIris()
      setStatus('shaders-status', 'Iris ' + r.version + ' installed for this profile.')
      refreshShaders()
    } catch (e) {
      setStatus('shaders-status', 'Iris install failed: ' + (e.message || e), true)
    } finally {
      btn.disabled = false
      btn.textContent = 'Install Iris'
    }
  })
}

/* ---------- account ---------- */
async function renderAccount() {
  const el = $('account-list')
  el.innerHTML = ''
  let data = null
  try {
    data = await ninoApi.accounts.list()
  } catch (e) {
    el.innerHTML = '<div class="hint">Couldn\'t load accounts.</div>'
    return
  }
  const { accounts, activeId } = data
  if (!accounts || !accounts.length) {
    el.innerHTML = '<div class="hint">No accounts yet. Add one above.</div>'
    return
  }
  const canRemove = accounts.length > 1
  for (const a of accounts) {
    const item = document.createElement('div')
    item.className = 'account-item' + (a.uuid === activeId ? ' active' : '')
    const av = document.createElement('div')
    av.className = 'avatar'
    av.textContent = (a.name || '?').charAt(0).toUpperCase()
    const info = document.createElement('div')
    info.className = 'item-info'
    const title = document.createElement('div')
    title.className = 'item-title'
    title.textContent = a.name
    const sub = document.createElement('div')
    sub.className = 'item-sub'
    sub.textContent = a.type === 'ms' ? 'Microsoft account' : 'Offline account'
    info.appendChild(title)
    info.appendChild(sub)
    const actions = document.createElement('div')
    actions.className = 'item-actions'
    if (a.uuid !== activeId) {
      const activateBtn = document.createElement('button')
      activateBtn.className = 'btn small'
      activateBtn.textContent = 'Use'
      activateBtn.addEventListener('click', async () => {
        activateBtn.disabled = true
        await ninoApi.accounts.setActive(a.uuid)
        setStatus('account-status', 'Switched to ' + a.name + '.')
        renderAccount()
      })
      actions.appendChild(activateBtn)
    } else {
      const badge = document.createElement('span')
      badge.className = 'hint'
      badge.textContent = 'Active'
      badge.style.color = 'var(--rose-dark)'
      badge.style.fontWeight = '700'
      actions.appendChild(badge)
    }
    if (canRemove) {
      const removeBtn = document.createElement('button')
      removeBtn.className = 'btn small ghost'
      removeBtn.textContent = 'Remove'
      removeBtn.addEventListener('click', async () => {
        removeBtn.disabled = true
        await ninoApi.accounts.remove(a.uuid)
        setStatus('account-status', 'Removed ' + a.name + '.')
        renderAccount()
      })
      actions.appendChild(removeBtn)
    }
    item.appendChild(av)
    item.appendChild(info)
    item.appendChild(actions)
    el.appendChild(item)
  }
}

function setupAccount() {
  $('btn-offline').addEventListener('click', async () => {
    const name = $('offline-name').value.trim() || settings.username || 'Player'
    try {
      await ninoApi.accounts.addOffline(name)
      $('offline-name').value = ''
      setStatus('account-status', 'Added offline account "' + name + '".')
      renderAccount()
    } catch (e) {
      setStatus('account-status', 'Couldn\'t add account: ' + (e.message || e), true)
    }
  })
  $('btn-ms').addEventListener('click', async () => {
    $('btn-ms').disabled = true
    $('ms-device').hidden = false
    setStatus('account-status', 'Starting Microsoft login...')
    try {
      await ninoApi.accounts.addMs()
      $('ms-device').hidden = true
      setStatus('account-status', 'Microsoft account added.')
      renderAccount()
    } catch (e) {
      $('ms-device').hidden = true
      setStatus('account-status', 'Login failed: ' + (e.message || e), true)
    } finally {
      $('btn-ms').disabled = false
    }
  })

  ninoApi.onAccountStatus((s) => {
    if (s && s.deviceCode) {
      $('ms-device').hidden = false
      $('ms-device-message').textContent = s.message || ''
      $('ms-device-code').textContent = s.deviceCode.user_code
    } else if (s && s.message) {
      setStatus('account-status', s.message)
    }
  })
}

/* ---------- settings ---------- */
function setupSettings() {
  $('game-dir').value = settings.gameDir
  $('java-path').value = settings.javaPath
  $('mc-loader').value = settings.loader
  $('ram-slider').value = settings.ram
  $('ram-label').textContent = settings.ram
  $('write-profiles').checked = !!settings.writeProfiles

  $('game-dir').addEventListener('change', async () => {
    settings.gameDir = $('game-dir').value.trim()
    await saveSettings()
    refreshInstalledMods()
    refreshInstalledPacks()
  })
  $('btn-browse').addEventListener('click', async () => {
    const dir = await ninoApi.settings.browseGameDir()
    if (dir) {
      settings.gameDir = dir
      $('game-dir').value = dir
      await saveSettings()
      refreshInstalledMods()
      refreshInstalledPacks()
    }
  })
  $('btn-open-dir').addEventListener('click', () => ninoApi.game.openGameDir())
  $('java-path').addEventListener('change', async () => {
    settings.javaPath = $('java-path').value.trim()
    await saveSettings()
  })
  $('btn-find-java').addEventListener('click', async () => {
    const j = await ninoApi.findJava()
    if (j) {
      settings.javaPath = j
      $('java-path').value = j
      await saveSettings()
      setStatus('play-status', 'Found Java: ' + j)
    } else {
      setStatus('play-status', 'No Java found. Install Java 21+.', true)
    }
  })
  $('write-profiles').addEventListener('change', async () => {
    settings.writeProfiles = $('write-profiles').checked
    await saveSettings()
  })
  $('btn-net-test').addEventListener('click', async () => {
    $('net-result').textContent = 'Testing...'
    const r = await ninoApi.test()
    $('net-result').textContent = r.ok ? 'Connected! Latest MC: ' + r.latest.release : 'Failed: ' + (r.error || 'unknown')
  })
}

/* ---------- update bubble ---------- */
function setupUpdate() {
  const bubble = $('update-bubble')
  const text = $('update-text')
  const ver = $('update-version')
  const bar = $('bubble-bar')
  const fill = $('update-fill')
  const dl = $('update-download')
  const inst = $('update-install')

  $('update-dismiss').addEventListener('click', () => bubble.classList.add('hidden'))

  dl.addEventListener('click', async () => {
    dl.disabled = true
    dl.textContent = 'Downloading\u2026'
    bar.classList.remove('hidden')
    await ninoApi.update.download()
  })

  inst.addEventListener('click', () => ninoApi.update.install())

  ninoApi.update.onAvailable((info) => {
    ver.textContent = 'v' + info.version
    text.textContent = '67 Skid Launcher v' + info.version + ' is ready to download.'
    dl.classList.remove('hidden')
    dl.disabled = false
    dl.textContent = 'Update now'
    inst.classList.add('hidden')
    bubble.classList.remove('hidden')
  })

  ninoApi.update.onProgress((p) => {
    fill.style.width = Math.min(100, p.percent) + '%'
  })

  ninoApi.update.onDownloaded(() => {
    dl.classList.add('hidden')
    inst.classList.remove('hidden')
    text.textContent = 'Update downloaded \u2014 restart to install it.'
  })

  ninoApi.update.onNone(() => {})

  ninoApi.update.onError((msg) => {
    if (bubble.classList.contains('hidden')) return
    text.textContent = 'Update failed: ' + msg
    dl.disabled = false
    dl.textContent = 'Retry'
  })

  ninoApi.update.check()
}

/* ---------- drag and drop ---------- */
function setupDragDropTab(tabId, opts) {
  const tab = $(tabId)
  if (!tab) return
  let dragCounter = 0

  tab.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })

  tab.addEventListener('dragenter', (e) => {
    e.preventDefault()
    dragCounter++
    tab.classList.add('drag-over')
  })

  tab.addEventListener('dragleave', (e) => {
    e.preventDefault()
    dragCounter--
    if (dragCounter <= 0) {
      dragCounter = 0
      tab.classList.remove('drag-over')
    }
  })

  tab.addEventListener('drop', async (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter = 0
    tab.classList.remove('drag-over')

    const files = e.dataTransfer.files
    if (!files || !files.length) return

    const matched = []
    for (let i = 0; i < files.length; i++) {
      const p = files[i].path
      if (!p) continue
      if (opts.filter(p)) matched.push(p)
    }
    if (!matched.length) {
      setStatus(opts.statusId, opts.emptyMsg, true)
      return
    }

    setStatus(opts.statusId, 'Importing ' + matched.length + ' file' + (matched.length === 1 ? '' : 's') + '...')
    let ok = 0
    let fail = 0
    for (const p of matched) {
      try {
        await opts.importFn(p)
        ok++
      } catch {
        fail++
      }
    }
    setStatus(opts.statusId, (ok ? 'Added ' + ok : '') + (fail ? ', ' + fail + ' failed' : '') + '.', fail > 0)
    if (opts.onDone) opts.onDone()
  })
}

function setupDragDrop() {
  setupDragDropTab('tab-mods', {
    filter: (p) => p.endsWith('.jar'),
    emptyMsg: 'Drop .jar files to add mods.',
    statusId: 'mods-status',
    importFn: (p) => ninoApi.mods.importJar(p),
    onDone: () => refreshInstalledMods()
  })
  setupDragDropTab('tab-modpacks', {
    filter: (p) => p.endsWith('.zip'),
    emptyMsg: 'Drop .zip modpacks here.',
    statusId: 'packs-status',
    importFn: (p) => ninoApi.modpacks.importZip(p),
    onDone: () => refreshInstalledPacks()
  })
  setupDragDropTab('tab-packs', {
    filter: (p) => p.endsWith('.zip'),
    emptyMsg: 'Drop .zip resource packs here.',
    statusId: 'packs-status',
    importFn: (p) => ninoApi.packs.importZip(p),
    onDone: () => refreshPacks()
  })
  setupDragDropTab('tab-shaders', {
    filter: (p) => p.endsWith('.zip'),
    emptyMsg: 'Drop .zip shader packs here.',
    statusId: 'shaders-status',
    importFn: (p) => ninoApi.shaders.importZip(p),
    onDone: () => refreshShaders()
  })
}

/* ---------- boot ---------- */
async function boot() {
  setupTitlebar()
  setupTabs()
  settings = await ninoApi.settings.get()
  setupSettings()
  setupPlay()
  setupAccount()
  setupPacks()
  setupSearch('mod-search', 'mod-search-btn', 'mod-results', 'mods-status', 'mod')
  setupSearch('pack-search', 'pack-search-btn', 'pack-results', 'packs-status', 'modpack')
  try {
    await loadVersions()
  } catch (e) {
    setStatus('play-status', 'Could not fetch Minecraft versions: ' + (e.message || e), true)
  }
  refreshInstalledMods()
  refreshInstalledPacks()
  renderAccount()
  refreshPacks()
  refreshShaders()
  setupUpdate()
  setupDragDrop()
}

boot()
