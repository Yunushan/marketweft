csv => {
  try {
    const symbol = 'NATIVESMOKE'
    const chart = document.querySelector(`canvas[aria-label^="${symbol} interactive candlestick"]`)
    if (chart) {
      const expected = new Map([['O', 27], ['H', 30], ['L', 26], ['C', 29], ['Vol', 800]])
      const cells = chart.closest('section.plot').querySelectorAll('.ohlc > span')
      const quote = new Map()
      for (const cell of cells) {
        const label = cell.querySelector('small')?.textContent
        if (expected.has(label)) {
          quote.set(label, Number(cell.textContent.slice(label.length).trim().replaceAll(',', '')))
        }
      }
      if (quote.size < expected.size) return 'waiting for the imported quote'
      for (const [label, value] of expected) {
        if (quote.get(label) !== value) return `error: expected ${label}=${value}, saw ${quote.get(label)}`
      }
      return 'verified'
    }

    const dialog = document.querySelector('dialog[open]')
    if (!dialog) {
      if (!document.querySelector('canvas[aria-label*="interactive"]')) return 'waiting for the starting chart'
      const open = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Import CSV')
      open?.click()
      return 'opening the CSV dialog'
    }
    if (dialog.dataset.marketweftFixture) {
      const error = dialog.querySelector('[role="alert"]')
      return error ? `error: ${error.textContent}` : 'waiting for the CSV import to finish'
    }
    const code = dialog.querySelector('input[placeholder="e.g. ABC"]')
    const file = dialog.querySelector('input[type="file"]')
    const submit = dialog.querySelector('button[type="submit"], .dialog-actions button.primary')
    if (!code || !file || !submit) return 'waiting for the CSV import controls'

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(code, symbol)
    code.dispatchEvent(new Event('input', { bubbles: true }))
    const transfer = new DataTransfer()
    transfer.items.add(new File([csv], 'native-verification.csv', { type: 'text/csv' }))
    file.files = transfer.files
    if (file.files[0]?.name !== 'native-verification.csv') return 'error: the WebView rejected the CSV file'
    file.dispatchEvent(new Event('change', { bubbles: true }))
    dialog.dataset.marketweftFixture = 'submitted'
    submit.click()
    return 'submitted the CSV'
  } catch (error) {
    return `error: ${String(error)}`
  }
}
