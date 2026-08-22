import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('published package metadata', () => {
  it('contains both Host and client entries plus an isolated patch row', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      name: string
      exports: Record<string, unknown>
      dsh: { bundle: { patch: string }; client: { platform: string } }
    }
    expect(manifest.name).toBe('@lsq64737/dsh-workbench-layout')
    expect(manifest.exports).toHaveProperty('./client')
    expect(manifest.dsh).toEqual(expect.objectContaining({
      bundle: { patch: './cordis.patch.yml' },
      client: expect.objectContaining({ platform: 'web' }),
    }))
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    expect(patch).toContain('inject: [webRuntime]')
  })

  it('does not publish personal paths or private-network examples in documentation', async () => {
    const docs = await Promise.all(['README.md', 'README.zh.md'].map(name => readFile(new URL(`../${name}`, import.meta.url), 'utf8')))
    for (const text of docs) {
      expect(text).not.toMatch(/\/(?:home|Users)\//u)
      expect(text).not.toMatch(/[A-Z]:\\/u)
      expect(text).not.toMatch(/(?:localhost|127\.0\.0\.1|192\.168\.)/u)
    }
  })
})
