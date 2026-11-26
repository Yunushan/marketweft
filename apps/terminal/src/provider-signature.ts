import { canonicalJson } from './canonical-json'
import { sha256Bytes } from './sha256'

export const MAX_PROVIDER_VERIFICATION_BYTES = 65_536
const MAX_PROVIDER_KEY_BYTES = 4096
const MAX_REGISTRY_KEYS = 32
const MAX_KEYS_PER_PROVIDER = 4

export function validProvider(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 &&
    /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(value)
}

function providerKeys(text: string, provider: string): string[] {
  if (text.length > MAX_PROVIDER_VERIFICATION_BYTES)
    throw Error('The provider verification file exceeds 64 KiB.')
  if (!text.trimStart().startsWith('{')) return [text]
  let registry: unknown
  try {
    registry = JSON.parse(text)
  } catch {
    throw Error('Choose a valid JSON provider key registry.')
  }
  if (!registry || typeof registry !== 'object' || Object.keys(registry).length !== 3 ||
      !('format' in registry) || registry.format !== 'marketweft-provider-key-registry' ||
      !('version' in registry) || registry.version !== 1 ||
      !('keys' in registry) || !Array.isArray(registry.keys) ||
      registry.keys.length === 0 || registry.keys.length > MAX_REGISTRY_KEYS)
    throw Error('Choose a version 1 provider key registry with 1 through 32 keys.')
  const byProvider = new Map<string, string[]>()
  for (const entry of registry.keys) {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).length !== 2 ||
        !validProvider(entry.provider) || typeof entry.pem !== 'string' ||
        entry.pem.length === 0 || entry.pem.length > MAX_PROVIDER_KEY_BYTES)
      throw Error('Each registry entry requires a provider identifier and public key PEM.')
    const keys = byProvider.get(entry.provider) ?? []
    if (keys.length >= MAX_KEYS_PER_PROVIDER)
      throw Error('The provider key registry allows at most four keys per provider.')
    keys.push(entry.pem)
    byProvider.set(entry.provider, keys)
  }
  const selected = byProvider.get(provider)
  if (!selected)
    throw Error('The provider key registry has no key for this provider.')
  return selected
}

async function importKey(text: string) {
  if (text.length > MAX_PROVIDER_KEY_BYTES)
    throw Error('The provider verification key exceeds 4 KiB.')
  const pem = /^-----BEGIN PUBLIC KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END PUBLIC KEY-----$/
    .exec(text.trim())
  try {
    if (!pem) throw Error('Invalid public key PEM.')
    const der = Uint8Array.from(atob(pem[1].replace(/[\r\n]/g, '')), character => character.charCodeAt(0))
    const key = await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return { key, der }
  } catch {
    throw Error('Choose a PEM-encoded P-256 provider public key.')
  }
}

export async function verifyProviderSignature(
  verification: string, provider: string, signature: unknown, manifest: unknown,
): Promise<string> {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature))
    throw Error('Supply an unpadded base64url P-256 signature.')
  const keys = providerKeys(verification, provider)
  const signed = new TextEncoder().encode(canonicalJson(manifest, 'The signed provider manifest contains an unsupported value.'))
  const bytes = Uint8Array.from(atob(signature.replaceAll('-', '+').replaceAll('_', '/')),
    character => character.charCodeAt(0))
  for (const pem of keys) {
    const { key, der } = await importKey(pem)
    if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes, signed))
      return sha256Bytes(der)
  }
  throw Error('The provider history signature does not match the supplied key and manifest.')
}
