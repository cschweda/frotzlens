/**
 * Markdown to HTML, for the changelog only: headings, lists (one level), paragraphs,
 * links, **bold**, *emphasis* and `code`. The text is escaped first, so nothing in it becomes markup
 * of its own; links go out only to https: URLs, and a repository-relative link (docs/07-play.md)
 * goes to that file on GitHub.
 */
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(text: string, repo: string): string {
  let s = escape(text)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
    const url = /^https:\/\//.test(href) ? href : /^[\w./#-]+$/.test(href) && !href.startsWith('/') ? `${repo}/blob/main/${href.replace(/^\.\//, '')}` : ''
    return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : label
  })
  return s
}

export function markdownToHtml(md: string, repo: string): string {
  const out: string[] = []
  let list = 0 // open <ul> depth
  let para: string[] = []
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '), repo)}</p>`)
    para = []
  }
  const closeLists = (to = 0) => {
    while (list > to) {
      out.push('</ul>')
      list--
    }
  }
  for (const raw of md.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    const h = /^(#{1,4})\s+(.*)$/.exec(line)
    const li = /^(\s*)- (.*)$/.exec(line)
    if (h) {
      flushPara()
      closeLists()
      // The page's own heading is the dialog's: the file's levels move down one.
      const level = Math.min(6, h[1]!.length + 1)
      out.push(`<h${level}>${inline(h[2]!, repo)}</h${level}>`)
    } else if (li) {
      flushPara()
      // One level: a nested bullet is shown at the same level (a <ul> inside a <ul> isn't valid HTML).
      if (!list) {
        out.push('<ul>')
        list = 1
      }
      out.push(`<li>${inline(li[2]!, repo)}</li>`)
    } else if (!line.trim()) {
      flushPara()
      closeLists()
    } else {
      closeLists()
      para.push(line.trim())
    }
  }
  flushPara()
  closeLists()
  return out.join('\n')
}
