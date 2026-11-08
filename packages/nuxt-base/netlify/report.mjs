// Report a problem / Suggest a feature, by email: a Netlify Function that sends what the person
// wrote to the app's owner through Resend (https://resend.com). The browser never sees the API key;
// it posts to this function on its own site (so the CSP's connect-src 'self' covers it).
//
// Each app has a three-line netlify/functions/report.mjs:
//   import { createReportHandler } from '@frotzinc/nuxt-base/netlify/report'
//   export default createReportHandler({ app: 'frotzlens' })
//
// Configured by the site's environment variables (Netlify → Site configuration → Environment):
//   RESEND_API_KEY  the Resend key (secret)
//   REPORT_TO       where reports go: always this address, never one from the form
//   REPORT_FROM     the sender, on the domain verified in Resend: 'frotzlens <reports@mail.frotzinc.com>'
// Without them it answers 503, and the dialog sends people to GitHub instead.
//
// A public form that sends email is an abuse target, so: the recipient is fixed; a hidden field
// (`website`) that people never fill and bots do; a form filled in under three seconds is refused;
// every field has a size limit; and each address may send a few reports a minute per instance.

const LIMITS = { title: 256, happened: 8000, expected: 4000, story: 2000, idea: 8000, details: 4000, replyTo: 254 }
const MAX_BODY = 32 * 1024
const MIN_MS = 3000
const PER_MINUTE = 5

/** A plausible single address (Resend checks it properly); nothing that could add headers. */
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Text as it may go in an email: a string, line ends plain, no control characters but tab and newline, cut to `max`. */
function text(v, max) {
  if (typeof v !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return Array.from(v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')).slice(0, max).join('').trim()
}

/**
 * @param {{ app: string, env?: (name: string) => string | undefined, send?: typeof fetch, now?: () => number }} options
 *   `env`, `send` and `now` are for the tests; on Netlify they are the environment, fetch and the clock.
 */
export function createReportHandler({ app, env = name => globalThis.Netlify?.env?.get(name) ?? process.env[name], send = (...a) => fetch(...a), now = () => Date.now() }) {
  /** Reports per address in the current minute, for this instance. */
  const recent = new Map()

  return async function report(req, context) {
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
    const key = env('RESEND_API_KEY')
    const to = env('REPORT_TO')
    const from = env('REPORT_FROM')
    if (!key || !to || !from) return json(503, { error: 'Reports by email aren’t set up on this site.' })

    const raw = await req.text()
    if (raw.length > MAX_BODY) return json(413, { error: 'The report is too long.' })
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return json(400, { error: 'That wasn’t a report.' })
    }
    if (!body || typeof body !== 'object') return json(400, { error: 'That wasn’t a report.' })

    // A bot: say yes, send nothing.
    if (body.website) return json(200, { ok: true })
    if (!(Number(body.elapsed) >= MIN_MS)) return json(400, { error: 'That was quicker than a person types. Please try again.' })

    const kind = body.kind === 'idea' ? 'idea' : body.kind === 'problem' ? 'problem' : null
    if (!kind) return json(400, { error: 'That wasn’t a report.' })
    const f = Object.fromEntries(Object.entries(LIMITS).map(([k, max]) => [k, text(body[k], max)]))
    if (!(kind === 'problem' ? f.happened : f.idea)) return json(400, { error: kind === 'problem' ? 'Say what happened.' : 'Say what you’d like.' })
    if (f.replyTo && !EMAIL.test(f.replyTo)) return json(400, { error: 'That email address doesn’t look right.' })

    const ip = context?.ip ?? req.headers.get('x-nf-client-connection-ip') ?? 'unknown'
    const minute = Math.floor(now() / 60000)
    const seen = recent.get(ip)
    const count = seen?.minute === minute ? seen.count + 1 : 1
    recent.set(ip, { minute, count })
    if (recent.size > 1000) recent.clear()
    if (count > PER_MINUTE) return json(429, { error: 'That’s a lot of reports at once. Please wait a minute.' })

    const label = kind === 'problem' ? 'Problem' : 'Idea'
    const subject = `[${app}] ${label}: ${f.title || (kind === 'problem' ? f.happened : f.idea).split('\n')[0]}`.slice(0, 200)
    const sections = kind === 'problem'
      ? [['What happened', f.happened], ['What they expected', f.expected], ['The story file', f.story]]
      : [['What they’d like', f.idea]]
    const lines = [
      `${label} from ${app}${f.title ? `: ${f.title}` : ''}`,
      '',
      ...sections.filter(([, v]) => v).flatMap(([h, v]) => [`## ${h}`, v, '']),
      ...(f.details ? ['## Technical details', f.details, ''] : []),
      f.replyTo ? `Reply to: ${f.replyTo}` : 'No reply address given.',
    ]

    let res
    try {
      res = await send('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text: lines.join('\n'), ...(f.replyTo ? { reply_to: f.replyTo } : {}) }),
      })
    } catch {
      return json(502, { error: 'The report couldn’t be sent just now.' })
    }
    if (!res.ok) return json(502, { error: 'The report couldn’t be sent just now.' })
    return json(200, { ok: true })
  }
}
