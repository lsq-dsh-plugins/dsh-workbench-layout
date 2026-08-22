import { describe, expect, it } from 'vitest'
import { isTrustedWorkbenchRequest } from '../src/request-trust.ts'

describe('workbench browser trust fence', () => {
  it('accepts loopback and deployment-trusted authorities', () => {
    expect(isTrustedWorkbenchRequest({ host: 'localhost:3080' }, [])).toBe(true)
    expect(isTrustedWorkbenchRequest({ host: '127.9.8.7:3080' }, [])).toBe(true)
    expect(isTrustedWorkbenchRequest({ host: '[::1]:3080' }, [])).toBe(true)
    expect(isTrustedWorkbenchRequest(
      { host: 'workbench.example:3080', origin: 'http://workbench.example:3080' },
      ['workbench.example'],
    )).toBe(true)
  })

  it('honors exact-port trusted entries', () => {
    const headers = { host: 'workbench.example:3080', origin: 'http://workbench.example:3080' }
    expect(isTrustedWorkbenchRequest(headers, ['workbench.example:3080'])).toBe(true)
    expect(isTrustedWorkbenchRequest(headers, ['workbench.example:4000'])).toBe(false)
  })

  it('rejects rebinding, cross-site, opaque, and malformed requests', () => {
    expect(isTrustedWorkbenchRequest({ host: 'untrusted.example' }, [])).toBe(false)
    expect(isTrustedWorkbenchRequest({ host: 'localhost:3080', 'sec-fetch-site': 'cross-site' }, [])).toBe(false)
    expect(isTrustedWorkbenchRequest({ host: 'localhost:3080', origin: 'https://other.example' }, [])).toBe(false)
    expect(isTrustedWorkbenchRequest({ host: 'localhost:3080', origin: 'null' }, [])).toBe(false)
    expect(isTrustedWorkbenchRequest({ host: 'bad host' }, [])).toBe(false)
    expect(isTrustedWorkbenchRequest({}, [])).toBe(false)
  })
})
