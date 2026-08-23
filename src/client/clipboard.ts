/** Copy plain text with a legacy fallback for browsers without Clipboard API access. */
export async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText !== undefined) {
    await navigator.clipboard.writeText(value)
    return
  }
  const input = document.createElement('textarea')
  input.value = value
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  const copied = document.execCommand?.('copy') === true
  input.remove()
  if (!copied) throw new Error('Clipboard unavailable')
}
