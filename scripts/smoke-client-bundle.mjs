import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
globalThis.window = dom.window
globalThis.document = dom.window.document
dom.window.HTMLCanvasElement.prototype.getContext = () => ({})

let registration
window.__ModuleLoader__ = {
  load(value) { registration = value },
}

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
vm.runInThisContext(source, { filename: 'dsh-workbench-layout-client.js' })
assert.equal(registration?.id, '@lsq64737/dsh-workbench-layout')

const required = []
const exports = registration.factory((id) => {
  required.push(id)
  return {}
})
assert.equal(typeof exports.apply, 'function')
assert.deepEqual(required.sort(), [
  '@deepseek-ai/dsh-client-runtime/client',
  '@deepseek-ai/dsh-client-ui-primitives',
  'react',
  'react-dom',
  'react/jsx-runtime',
])
assert.ok(document.head.querySelector('style[data-plugin="@lsq64737/dsh-workbench-layout"]'))

console.log('workbench client bundle smoke passed')
