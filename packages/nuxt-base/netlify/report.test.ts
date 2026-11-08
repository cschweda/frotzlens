import { describe, expect, it, vi } from 'vitest'
import { createReportHandler } from './report.mjs'

const ENV: Record<string, string> = { RESEND_API_KEY: 're_test', REPORT_TO: 'owner@example.com', REPORT_FROM: 'app <reports@mail.example.com>' }
const ok = () => new Response('{"id":"1"}', { status: 200 })

function setup(env: Record<string, string> = ENV, now = () => 1_000_000) {
  const send = vi.fn(async () => ok())
  const handler = createReportHandler({ app: 'frotzlens', env: (n: string) => env[n], send, now })
  const post = (body: unknown, ip = '1.2.3.4') =>
    handler(new Request('https://x/.netlify/functions/report', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), { ip })
  return { send, post, handler }
}
const problem = { kind: 'problem', title: 'Map is blank', happened: 'The map shows nothing.', elapsed: 9000 }

describe('the report function', () => {
  it('sends a problem to the fixed address, never one from the form', async () => {
    const { send, post } = setup()
    const res = await post({ ...problem, replyTo: 'reader@example.org', to: 'victim@example.net' })
    expect(res.status).toBe(200)
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const sent = JSON.parse(String(init.body))
    expect(sent.to).toEqual(['owner@example.com'])
    expect(sent.from).toBe(ENV.REPORT_FROM)
    expect(sent.reply_to).toBe('reader@example.org')
    expect(sent.subject).toBe('[frotzlens] Problem: Map is blank')
    expect(sent.text).toContain('The map shows nothing.')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test')
  })

  it('answers 503 when Resend isn’t configured', async () => {
    const { send, post } = setup({})
    expect((await post(problem)).status).toBe(503)
    expect(send).not.toHaveBeenCalled()
  })

  it('pretends to accept a filled honeypot, and sends nothing', async () => {
    const { send, post } = setup()
    expect((await post({ ...problem, website: 'http://spam' })).status).toBe(200)
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses a form filled in too fast, a missing required field, a bad reply address, and junk', async () => {
    const { send, post } = setup()
    expect((await post({ ...problem, elapsed: 500 })).status).toBe(400)
    expect((await post({ ...problem, happened: '  ' })).status).toBe(400)
    expect((await post({ kind: 'idea', elapsed: 9000 })).status).toBe(400)
    expect((await post({ ...problem, replyTo: 'a@b.c\nBcc: x@y.z' })).status).toBe(400)
    expect((await post('not json')).status).toBe(400)
    expect((await post({ ...problem, kind: 'other' })).status).toBe(400)
    expect((await post('x'.repeat(40_000))).status).toBe(413)
    expect(send).not.toHaveBeenCalled()
  })

  it('allows only POST', async () => {
    const { handler } = setup()
    expect((await handler(new Request('https://x/'), {})).status).toBe(405)
  })

  it('limits each address to five a minute', async () => {
    const { post } = setup()
    const codes = []
    for (let i = 0; i < 6; i++) codes.push((await post(problem)).status)
    expect(codes).toEqual([200, 200, 200, 200, 200, 429])
    expect((await post(problem, '5.6.7.8')).status).toBe(200)
  })

  it('cuts long fields and strips control characters', async () => {
    const { send, post } = setup()
    await post({ kind: 'idea', idea: `a\u0007b${'x'.repeat(9000)}`, title: 't'.repeat(400), elapsed: 9000 })
    const sent = JSON.parse(String((send.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(sent.subject.length).toBeLessThanOrEqual(200)
    expect(sent.text).not.toContain('\u0007')
    expect(sent.text).toContain('ab')
  })

  it('says so when Resend fails', async () => {
    const send = vi.fn(async () => new Response('no', { status: 500 }))
    const h = createReportHandler({ app: 'a', env: (n: string) => ENV[n], send })
    const res = await h(new Request('https://x/', { method: 'POST', body: JSON.stringify(problem) }), { ip: '9' })
    expect(res.status).toBe(502)
  })
})
