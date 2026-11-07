// Another origin serving stories over HTTPS, for the ?story= tests: /cors/<file> with
// Access-Control-Allow-Origin, /nocors/<file> without. (HTTPS because the site's CSP allows
// connect-src https: only; a self-signed certificate made here, which the tests accept.) Test use only.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createServer } from 'node:https'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'frotzplay-certs-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-days', '1', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
const samples = new URL('../../../samples/', import.meta.url)
const port = Number(process.env.STORY_PORT ?? 4192)

createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) }, (req, res) => {
  const m = /^\/(cors|nocors)\/([\w.-]+\.z[3458])$/.exec(req.url ?? '')
  if (!m) return res.writeHead(404).end()
  let body
  try {
    body = readFileSync(new URL(m[2], samples))
  } catch {
    return res.writeHead(404).end()
  }
  const headers = { 'Content-Type': 'application/octet-stream' }
  if (m[1] === 'cors') headers['Access-Control-Allow-Origin'] = '*'
  res.writeHead(200, headers).end(body)
}).listen(port, () => console.log(`stories on https://localhost:${port}`))
