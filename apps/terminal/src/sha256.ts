/** SHA-256 of a string encoded as UTF-8. */
export async function sha256Text(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text))
}

export async function sha256Bytes(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}
