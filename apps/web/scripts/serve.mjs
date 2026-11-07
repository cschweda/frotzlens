// Serves the generated site (.output/public) the way Netlify does for the smoke test: unknown
// paths get 200.html, and every response carries netlify.toml's Content-Security-Policy, so a
// CSP violation fails the test here instead of on the live site. Local use only.
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../.output/public/', import.meta.url))
const toml = readFileSync(new URL('../../../netlify.toml', import.meta.url), 'utf8')
// The headers of each [[headers]] block: the site's ("/*") and the player's ("/play/*"), which overrides it.
const block = (path) => {
  const b = toml.split('[[headers]]').find(x => x.includes(`for = "${path}"`)) ?? ''
  return {
    csp: b.match(/Content-Security-Policy = "([^"]+)"/)?.[1],
    frame: b.match(/X-Frame-Options = "([^"]+)"/)?.[1],
    cors: b.match(/Access-Control-Allow-Origin = "([^"]+)"/)?.[1],
  }
}
const site = block('/*')
const player = block('/play/*')
if (!site.csp || !player.csp) throw new Error('serve: no Content-Security-Policy for /* and /play/* in netlify.toml')
const port = Number(process.env.PORT ?? 4175)

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.gif': 'image/gif',
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
  // As public/_redirects: an unknown /play/ path is a 404 page, never the app; anything else unknown is the app.
  let status = 200
  if (!existsSync(file)) {
    if (path.startsWith('/play/')) {
      file = join(root, 'play/404.html')
      status = 404
    } else file = join(root, '200.html')
  }
  // The player's headers for the player's own files (as netlify.toml's /play/* rule).
  const h = file.startsWith(join(root, 'play/')) ? { ...site, ...player } : site
  res.writeHead(status, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Security-Policy': h.csp,
    'X-Frame-Options': h.frame,
    ...(h.cors ? { 'Access-Control-Allow-Origin': h.cors } : {}),
  })
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`))
