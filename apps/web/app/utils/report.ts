/**
 * Report a problem and Suggest a feature (the About menu): the GitHub new-issue link, built from what
 * the person typed, as Drafter does it. Frotzlens has no server and keeps no token, so it posts
 * nothing: it opens GitHub's issue form with the text filled in, and the person reviews it and
 * submits it there. The story file never goes in, only what they choose to write about it.
 *
 * GitHub's issue forms (.github/ISSUE_TEMPLATE/bug.yml, idea.yml) take each field's text from a query
 * parameter named by the field's id, beside `template`, `title` and `labels`.
 */
export const REPO_URL = 'https://github.com/cschweda/frotzlens'
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new`
export const SECURITY_URL = `${REPO_URL}/blob/main/SECURITY.md`
/** A new-issue link stays under this, which every browser and GitHub take. */
export const MAX_ISSUE_URL = 7500
export const TRIMMED_NOTE = '… [Trimmed to fit the link. Paste the rest here.]'

export type IssueKind = 'problem' | 'idea'

export interface IssueDraft {
  kind: IssueKind
  title: string
  happened: string
  expected: string
  story: string
  idea: string
  /** Adds the technical details: Frotzlens's version and build, and the browser. */
  includeDetails: boolean
}

export const KINDS: Record<IssueKind, { name: string; template: string; label: string; fields: { id: string; label: string; key: 'happened' | 'expected' | 'story' | 'idea' }[] }> = {
  problem: {
    name: 'Report a problem',
    template: 'bug.yml',
    label: 'bug',
    fields: [
      { id: 'what-happened', label: 'What happened', key: 'happened' },
      { id: 'expected', label: 'What you expected', key: 'expected' },
      { id: 'story', label: 'The story file', key: 'story' },
    ],
  },
  idea: {
    name: 'Suggest a feature',
    template: 'idea.yml',
    label: 'enhancement',
    fields: [{ id: 'idea', label: "What you'd like", key: 'idea' }],
  },
}
export const DETAILS_FIELD = { id: 'version', label: 'Technical details' } as const

/** Text safe for a link: well formed, plain line ends, no control characters but tab and newline. */
export function clean(text: string): string {
  // eslint-disable-next-line no-control-regex
  const formed = text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD')
  return formed.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
}

export interface IssueField { id: string; label: string; value: string }

/** The fields with text, in the form's order, the technical details last when included. */
export function issueFields(draft: IssueDraft, details: string): IssueField[] {
  const fields = KINDS[draft.kind].fields.map(f => ({ id: f.id, label: f.label, value: clean(draft[f.key]).trim() }))
  if (draft.includeDetails && details.trim()) fields.push({ ...DETAILS_FIELD, value: clean(details).trim() })
  return fields.filter(f => f.value)
}

/** The title on one line, at most GitHub's 256 characters. */
export const issueTitle = (title: string) => Array.from(clean(title).replace(/\s+/g, ' ').trim()).slice(0, 256).join('')

const enc = encodeURIComponent

export function issueUrl(kind: IssueKind, title: string, fields: IssueField[]): string {
  const { template, label } = KINDS[kind]
  const params = [`template=${enc(template)}`, ...(title ? [`title=${enc(title)}`] : []), `labels=${enc(label)}`, ...fields.map(f => `${enc(f.id)}=${enc(f.value)}`)]
  return `${NEW_ISSUE_URL}?${params.join('&')}`
}

/**
 * The link for a draft, with the longest field cut (and marked) until the link fits. The whole text
 * is also on the clipboard when the link opens, so nothing is lost to a cut.
 */
export function issueLink(draft: IssueDraft, details: string): { url: string; trimmed: boolean } {
  const title = issueTitle(draft.title)
  const fields = issueFields(draft, details)
  let url = issueUrl(draft.kind, title, fields)
  let trimmed = false
  while (url.length > MAX_ISSUE_URL) {
    const longest = fields.reduce((a, b) => (b.value.length > a.value.length ? b : a))
    const chars = Array.from(longest.value)
    const keep = Math.max(0, chars.length - Math.ceil((url.length - MAX_ISSUE_URL) / 3) - TRIMMED_NOTE.length - 1)
    longest.value = chars.slice(0, keep).join('') + TRIMMED_NOTE
    trimmed = true
    url = issueUrl(draft.kind, title, fields)
    if (keep === 0) break
  }
  return { url, trimmed }
}

/** The whole report as text (for the clipboard): the title, then each field under its heading. */
export function reportText(draft: IssueDraft, details: string): string {
  const title = issueTitle(draft.title)
  const body = issueFields(draft, details).map(f => `### ${f.label}\n\n${f.value}`).join('\n\n')
  return [title && `Title: ${title}`, body].filter(Boolean).join('\n\n')
}
