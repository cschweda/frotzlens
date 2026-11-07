/**
 * Markdown to HTML, for the changelog only: headings, lists (nested by indentation), paragraphs,
 * links, **bold**, *emphasis* and `code`. The text is escaped first, so nothing in it becomes markup
 * of its own. Code spans are set aside before the other inline rules run, so their contents stay as
 * written. Links go out only to https: URLs, and a repository-relative link (docs/07-play.md) goes
 * to that file on GitHub.
 */
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(text: string, repo: string): string {
  // Code spans first, out of the way of the other rules (\u0000 can't occur in escaped text here).
  const codes: string[] = []
  let s = escape(text).replace(/`([^`]+)`/g, (_, c: string) => `\u0000${codes.push(c) - 1}\u0000`)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    const url = /^https:\/\//.test(href) ? href : /^[\w./#-]+$/.test(href) && !href.startsWith('/') ? `${repo}/blob/main/${href.replace(/^\.\//, '')}` : ''
    return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : label
  })
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${codes[Number(i)]}</code>`)
}

export function markdownToHtml(md: string, repo: string): string {
  const out: string[] = []
  // The open lists, by the indentation of their items. Each item stays open until the next item at
  // its level or above, so a nested list goes inside it (<li>…<ul>…</ul></li>).
  const lists: number[] = []
  let para: string[] = []
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '), repo)}</p>`)
    para = []
  }
  const closeTo = (indent: number) => {
    while (lists.length && lists.at(-1)! > indent) {
      out.push('</li></ul>')
      lists.pop()
    }
  }
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    const li = /^(\s*)- (.*)$/.exec(line)
    if (h) {
      flushPara()
      closeTo(-1)
      // The dialog's own heading is the page's: the file's levels move down one.
      const level = Math.min(6, h[1]!.length + 1)
      out.push(`<h${level}>${inline(h[2]!, repo)}</h${level}>`)
    } else if (li) {
      flushPara()
      const indent = li[1]!.length
      closeTo(indent)
      if (lists.at(-1) === indent) out.push('</li>')
      else {
        out.push('<ul>')
        lists.push(indent)
      }
      out.push(`<li>${inline(li[2]!, repo)}`)
    } else if (!line.trim()) {
      flushPara()
    } else if (lists.length && /^\s/.test(raw)) {
      // A list item's continuation (an indented line under it), or a paragraph inside it.
      out.push(` ${inline(line.trim(), repo)}`)
    } else {
      closeTo(-1)
      para.push(line.trim())
    }
  }
  flushPara()
  closeTo(-1)
  return out.join('\n')
}
