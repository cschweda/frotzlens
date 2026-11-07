// A plain page embedding <frotz-play>, served with the strictest CSP an embedder might have
// (docs/15 §1): script-src 'self', style-src 'self', no 'unsafe-inline', no 'unsafe-eval', no
// 'wasm-unsafe-eval'. The embed test fails on any violation. Test use only.
import { createReadStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname } from 'node:path'

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
const here = new URL('./', import.meta.url)
const routes = [
  [/^\/$/, () => new URL('embed/index.html', here)],
  [/^\/embed\.css$/, () => new URL('embed/embed.css', here)],
  [/^\/frotz-play\.js$/, () => new URL('../dist/frotz-play.js', here)],
  [/^\/stories\/([\w.-]+)$/, m => new URL(`../dev/public/stories/${m[1]}`, here)],
  [/^\/fonts\/([\w.-]+)$/, m => new URL(`../fonts/${m[1]}`, here)],
]
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2' }
createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  for (const [re, to] of routes) {
    const m = re.exec(path)
    if (!m) continue
    const file = to(m)
    if (!existsSync(file)) break
    res.writeHead(200, { 'Content-Security-Policy': CSP, 'Content-Type': TYPES[extname(file.pathname)] ?? 'application/octet-stream' })
    return createReadStream(file).pipe(res)
  }
  res.writeHead(404, { 'Content-Security-Policy': CSP }).end()
}).listen(4182, () => console.log('embed page on http://localhost:4182'))
