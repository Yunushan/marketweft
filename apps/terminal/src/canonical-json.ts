/** Encode JSON with UTF-16 code-unit key ordering and significant array order. */
export function canonicalJson(value: unknown, invalid: string): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  if (Array.isArray(value)) return '[' + value.map(item => canonicalJson(item, invalid)).join(',') + ']'
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return '{' + Object.keys(record).sort()
      .map(key => JSON.stringify(key) + ':' + canonicalJson(record[key], invalid)).join(',') + '}'
  }
  throw Error(invalid)
}
