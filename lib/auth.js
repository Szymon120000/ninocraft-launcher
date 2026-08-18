const crypto = require('crypto')
const http = require('./http')

const CLIENT_ID = 'c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb'
const SCOPE = 'XboxLive.signin offline_access'

let emit = () => {}

function init(bus) {
  emit = bus
}

function randomUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex')
}

async function startDeviceCode() {
  const r = await http.postForm('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode', {
    client_id: CLIENT_ID,
    scope: SCOPE
  })
  if (r.status !== 200) throw new Error(`Device code request failed (${r.status}): ${r.body}`)
  const data = JSON.parse(r.body)
  emit('account:status', { message: `Visit ${data.verification_uri} and enter code ${data.user_code}` })
  return data
}

async function pollToken(device) {
  let interval = Math.max(device.interval || 5, 2) * 1000
  const deadline = Date.now() + (device.expires_in || 900) * 1000
  while (Date.now() < deadline) {
    await sleep(interval)
    const r = await http.postForm('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: CLIENT_ID,
      device_code: device.device_code
    })
    const data = JSON.parse(r.body)
    if (r.status === 200 && data.access_token) return data
    if (data.error === 'authorization_pending') continue
    if (data.error === 'slow_down') {
      interval += 5000
      continue
    }
    if (data.error === 'authorization_declined') throw new Error('Login declined')
    if (data.error === 'expired_token') throw new Error('Login code expired')
    throw new Error(`Token error: ${data.error} ${data.error_description || ''}`)
  }
  throw new Error('Login timed out')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function xblAuthenticate(mstoken) {
  const r = await http.postJSON('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: `d=${mstoken}`
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  }, { 'Content-Type': 'application/json' })
  if (r.status !== 200) throw new Error(`Xbox Live auth failed (${r.status}): ${r.body}`)
  const data = JSON.parse(r.body)
  return { token: data.Token, uhs: data.DisplayClaims.xui[0].uhs }
}

async function xstsAuthenticate(xblToken) {
  const r = await http.postJSON('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: {
      SandboxId: 'RETAIL',
      UserTokens: [xblToken]
    },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  }, { 'Content-Type': 'application/json' })
  const data = JSON.parse(r.body)
  if (r.status === 401) {
    throw new Error('This Microsoft account does not own Minecraft (XSTS 401)')
  }
  if (r.status !== 200) throw new Error(`XSTS auth failed (${r.status}): ${r.body}`)
  return { token: data.Token, uhs: data.DisplayClaims.xui[0].uhs }
}

async function mcLogin(uhs, xstsToken) {
  const r = await http.postJSON('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xstsToken}`
  }, { 'Content-Type': 'application/json' })
  if (r.status !== 200) throw new Error(`Minecraft login failed (${r.status}): ${r.body}`)
  const data = JSON.parse(r.body)
  return { accessToken: data.access_token, expiresIn: data.expires_in }
}

async function mcProfile(accessToken) {
  const r = await http.request('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (r.status === 404) return null
  if (r.status !== 200) throw new Error(`Profile request failed (${r.status}): ${r.body.toString('utf8')}`)
  return JSON.parse(r.body.toString('utf8'))
}

async function completeChain(mstoken) {
  emit('account:status', { message: 'Authenticating with Xbox Live...' })
  const xbl = await xblAuthenticate(mstoken)
  const xsts = await xstsAuthenticate(xbl.token)
  emit('account:status', { message: 'Logging into Minecraft services...' })
  const mc = await mcLogin(xsts.uhs, xsts.token)
  const profile = await mcProfile(mc.accessToken)
  if (!profile) {
    throw new Error('This Microsoft account does not own Minecraft.')
  }
  return {
    type: 'ms',
    name: profile.name,
    uuid: profile.id,
    xuid: xsts.uhs,
    accessToken: mc.accessToken,
    refreshToken: mstoken,
    expiresAt: Date.now() + mc.expiresIn * 1000 - 60000,
    userType: 'msa'
  }
}

async function msLogin() {
  const device = await startDeviceCode()
  emit('account:status', { deviceCode: device, message: device.message || `Enter code ${device.user_code} at ${device.verification_uri}` })
  const token = await pollToken(device)
  const account = await completeChain(token.access_token)
  emit('account:done', account)
  return account
}

async function refreshAccount(account) {
  if (account.type !== 'ms') return account
  if (account.expiresAt && Date.now() < account.expiresAt && account.accessToken) return account
  if (!account.refreshToken) return account
  try {
    const r = await http.postForm('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: account.refreshToken,
      scope: SCOPE
    })
    if (r.status !== 200) throw new Error(`Refresh failed (${r.status})`)
    const data = JSON.parse(r.body)
    return await completeChain(data.access_token)
  } catch (e) {
    emit('account:status', { message: `Token refresh failed: ${e.message}` })
    return account
  }
}

function offlineAccount(name) {
  const n = (name || 'Nino').trim() || 'Nino'
  return { type: 'offline', name: n, uuid: randomUUID(), xuid: '', accessToken: '0', userType: 'legacy' }
}

module.exports = { init, msLogin, refreshAccount, offlineAccount }
