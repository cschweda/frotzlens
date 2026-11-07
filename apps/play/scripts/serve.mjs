// Serves the generated site (.output/public) the way Netlify does, for the e2e tests: unknown paths
// get 200.html, and every response carries netlify.toml's headers (the Content-Security-Policy
// included), so a CSP violation fails a test here instead of on the live site. Local use only.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../.output/public/', import.meta.url))
const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8')
const site = toml.split('[[headers]]').find(b => b.includes('for = "/*"')) ?? ''
const headers = Object.fromEntries([...site.matchAll(/^\s*([\w-]+) = "([^"]+)"/gm)].map(m => [m[1], m[2]]).filter(([k]) => k !== 'for'))
if (!headers['Content-Security-Policy']) throw new Error('serve: no Content-Security-Policy for /* in netlify.toml')
const port = Number(process.env.PORT ?? 4210)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.z3': 'application/octet-stream', '.z4': 'application/octet-stream', '.z5': 'application/octet-stream', '.z8': 'application/octet-stream',
}

createServer((req, res) => {
  let path
  try {
    path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]))
  } catch {
    res.writeHead(400).end()
    return
  }
  let file = join(root, path)
  if (!file.startsWith(root.slice(0, -1))) {
    res.writeHead(403).end()
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) file = join(root, '200.html')
  res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(port, () => console.log(`frotzplay on http://localhost:${port}`))
