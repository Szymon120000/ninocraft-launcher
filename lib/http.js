const { net } = require('electron')
const fs = require('fs')
const path = require('path')

function request(url, { method = 'GET', headers = {}, body = null, onData = null } = {}) {
  return new Promise((resolve, reject) => {
    let req
    try {
      req = net.request({ url, method })
    } catch (e) {
      return reject(e)
    }
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)
    req.on('response', (res) => {
      const chunks = []
      res.on('data', (c) => {
        if (onData) onData(c)
        else chunks.push(c)
      })
      res.on('end', () => {
        if (!onData) {
          const buf = Buffer.concat(chunks)
          resolve({ status: res.statusCode, body: buf, headers: res.headers })
        } else {
          resolve({ status: res.statusCode, headers: res.headers })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function getJSON(url, headers) {
  const r = await request(url, { headers })
  if (r.status >= 400) throw new Error(`HTTP ${r.status} ${url}`)
  return JSON.parse(r.body.toString('utf8'))
}

async function getText(url, headers) {
  const r = await request(url, { headers })
  if (r.status >= 400) throw new Error(`HTTP ${r.status} ${url}`)
  return r.body.toString('utf8')
}

function download(url, dest, { headers = {}, onProgress = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url })
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)
    req.on('response', (res) => {
      if (res.statusCode >= 400) {
        return reject(Object.assign(new Error(`HTTP ${res.statusCode} ${url}`), { status: res.statusCode }))
      }
      const total = Number(res.headers['content-length'] || 0)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      const ws = fs.createWriteStream(dest)
      let received = 0
      res.on('data', (c) => {
        received += c.length
        ws.write(c)
        if (onProgress) onProgress(received, total)
      })
      res.on('end', () => {
        ws.end()
        resolve(dest)
      })
      ws.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

async function postForm(url, fields, headers) {
  const body = new URLSearchParams(fields).toString()
  const r = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(headers || {}) },
    body
  })
  return { status: r.status, body: r.body.toString('utf8'), headers: r.headers }
}

async function postJSON(url, obj, headers) {
  const body = JSON.stringify(obj)
  const r = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body
  })
  return { status: r.status, body: r.body.toString('utf8'), headers: r.headers }
}

module.exports = { request, getJSON, getText, download, postForm, postJSON }
