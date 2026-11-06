import { describe, expect, it } from 'vitest'
import { externalRules, parseRedirects, scriptProxies } from './redirects.mjs'

const TEXT = `
# analytics beacon only
/pa/event   https://plausible.io/api/event   200
/old        /new                             301
/x.js       https://cdn.example.com/x.js     200
`

describe('redirects helpers', () => {
  const rules = parseRedirects(TEXT)

  it('parses rules, dropping blanks and comments', () => {
    expect(rules).toEqual([
      ['/pa/event', 'https://plausible.io/api/event', '200'],
      ['/old', '/new', '301'],
      ['/x.js', 'https://cdn.example.com/x.js', '200'],
    ])
  })

  it('finds script proxies', () => {
    expect(scriptProxies(rules)).toEqual([['/x.js', 'https://cdn.example.com/x.js', '200']])
  })

  it('finds rules to other origins', () => {
    expect(externalRules(rules).map(([from]) => from)).toEqual(['/pa/event', '/x.js'])
  })
})
