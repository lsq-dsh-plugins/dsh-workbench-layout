/** DSH-compatible browser trust fence for the workbench Host route. */

import type { IncomingMessage } from 'node:http'

function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

function canonicalAuthority(entry: string, parsed: URL): string {
  const port = parsed.port !== '' ? parsed.port : new URL(`https://${entry}`).port
  return port === '' ? parsed.hostname : `${parsed.hostname}:${port}`
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/u.test(part) && Number(part) <= 255)
}

function isTrustedAuthority(host: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const trusted = parseAuthority(entry)
    if (trusted === undefined) return false
    return canonicalAuthority(entry, trusted) === trusted.hostname
      ? trusted.hostname === host.hostname
      : trusted.host === host.host
  })
}

/**
 * Match the official DSH API fence: bind every request to loopback or a
 * deployment-derived trusted Host, then reject explicit cross-site markers.
 */
export function isTrustedWorkbenchRequest(
  headers: IncomingMessage['headers'],
  trustedHosts: readonly string[],
): boolean {
  const authority = headers.host
  if (typeof authority !== 'string') return false
  const host = parseAuthority(authority)
  if (host === undefined) return false
  if (!isLoopbackHostname(host.hostname) && !isTrustedAuthority(host, trustedHosts)) return false
  if (headers['sec-fetch-site'] === 'cross-site') return false

  const origin = headers.origin
  if (origin === undefined) return true
  if (typeof origin !== 'string') return false
  try {
    return new URL(origin).host === host.host
  } catch {
    return false
  }
}
