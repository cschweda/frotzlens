/**
 * A small XML reader: elements, attributes, text and the five standard entities
 * plus numeric ones. Enough for Inform's gameinfo.dbg and Blorb's iFiction
 * metadata; no DTDs, namespaces or processing beyond skipping them. It runs in
 * a Web Worker (which has no DOMParser) and never throws: a malformed document
 * comes back as far as it could be read, with `error` set.
 */

export interface XmlElement {
  name: string
  attrs: Record<string, string>
  children: XmlElement[]
  /** The element's own text (its text children, joined), entities decoded. */
  text: string
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

/** XML 1.0's Char production: tab, newline, return, and the rest of Unicode but controls, surrogates, FFFE/FFFF. */
export const isXmlChar = (n: number) =>
  n === 0x9 || n === 0xa || n === 0xd || (n >= 0x20 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff)

/** The five standard entities and numeric references decoded; a reference to a character XML forbids becomes U+FFFD. */
export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      return isXmlChar(n) ? String.fromCodePoint(n) : '\ufffd'
    }
    return ENTITIES[e] ?? m
  })
}

/** A start tag, matched where it stands (sticky): its name, attributes and any closing slash. */
const TAG = /<([A-Za-z_:][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y

/** Elements nested deeper than this are a malformed (or hostile) document. */
const MAX_DEPTH = 256

export function parseXml(src: string): { root?: XmlElement; error?: string } {
  const top: XmlElement = { name: '#document', attrs: {}, children: [], text: '' }
  const stack: XmlElement[] = [top]
  let i = 0
  const fail = (error: string) => ({ ...(top.children[0] ? { root: top.children[0] } : {}), error })
  while (i < src.length) {
    const lt = src.indexOf('<', i)
    const cur = stack.at(-1)!
    if (lt < 0) {
      cur.text += decodeEntities(src.slice(i))
      break
    }
    if (lt > i) cur.text += decodeEntities(src.slice(i, lt))
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4)
      if (end < 0) return fail('An unclosed comment.')
      i = end + 3
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9)
      if (end < 0) return fail('An unclosed CDATA section.')
      cur.text += src.slice(lt + 9, end)
      i = end + 3
    } else if (src[lt + 1] === '?' || src[lt + 1] === '!') {
      const end = src.indexOf('>', lt)
      if (end < 0) return fail('An unclosed declaration.')
      i = end + 1
    } else if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt)
      if (end < 0) return fail('An unclosed end tag.')
      const name = src.slice(lt + 2, end).trim()
      if (stack.length < 2 || cur.name !== name) return fail(`</${name}> doesn't close <${cur.name}>.`)
      stack.pop()
      i = end + 1
    } else {
      TAG.lastIndex = lt
      const m = TAG.exec(src)
      if (!m) return fail(`A malformed tag at ${lt}.`)
      const attrs: Record<string, string> = {}
      for (const a of m[2]!.matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? '')
      const el: XmlElement = { name: m[1]!, attrs, children: [], text: '' }
      cur.children.push(el)
      if (!m[3]) {
        if (stack.length > MAX_DEPTH) return fail('Elements nested too deeply.')
        stack.push(el)
      }
      i = lt + m[0].length
    }
  }
  if (stack.length > 1) return fail(`<${stack.at(-1)!.name}> is never closed.`)
  if (!top.children[0]) return { error: 'No root element.' }
  if (top.children.length > 1) return fail(`More than one root element (<${top.children[1]!.name}> after the first).`)
  if (top.text.trim()) return fail('Text outside the root element.')
  return { root: top.children[0] }
}

/** The first child element called `name`. */
export const child = (el: XmlElement, name: string) => el.children.find(c => c.name === name)
/** The text of the first child called `name`, trimmed. */
export const childText = (el: XmlElement, name: string) => child(el, name)?.text.trim()
