// Serves the generated site (.output/public) the way Netlify does for the smoke test: unknown
// paths get 200.html, and every response carries netlify.toml's Content-Security-Policy, so a
// CSP violation fails the test here instead of on the live site. Local use only.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../.output/public/', import.meta.url))
const toml = readFileSync(new URL('../../../netlify.toml', import.meta.url), 'utf8')
const csp = toml.match(/Content-Security-Policy = "([^"]+)"/)?.[1]
if (!csp) throw new Error('serve: no Content-Security-Policy in netlify.toml')
const port = Number(process.env.PORT ?? 4175)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
}

createServer((req, res) => {
  let path
  try {
    path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]))
  } catch {
    res.writeHead(400).end() // a malformed escape: a bad request, not a crash
    return
  }
  let file = join(root, path)
  if (!file.startsWith(root.slice(0, -1))) {
    res.writeHead(403).end()
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) file = join(root, '200.html')
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': csp })
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`))
