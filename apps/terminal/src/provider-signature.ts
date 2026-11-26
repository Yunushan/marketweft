import { canonicalJson } from './canonical-json'

export const MAX_PROVIDER_KEY_BYTES = 4096

export async function verifyProviderSignature(verificationKey: string, signature: unknown, manifest: unknown) {
  if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature))
    throw Error('Supply an unpadded base64url P-256 signature.')
  if (verificationKey.length > MAX_PROVIDER_KEY_BYTES)
    throw Error('The provider verification key exceeds 4 KiB.')
  const pem = /^-----BEGIN PUBLIC KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END PUBLIC KEY-----$/
    .exec(verificationKey.trim())
  let key: CryptoKey
  try {
    if (!pem) throw Error('Invalid public key PEM.')
    const der = Uint8Array.from(atob(pem[1].replace(/[\r\n]/g, '')), character => character.charCodeAt(0))
    key = await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  } catch {
    throw Error('Choose a PEM-encoded P-256 provider public key.')
  }
  const signed = new TextEncoder().encode(canonicalJson(manifest, 'The signed provider manifest contains an unsupported value.'))
  const bytes = Uint8Array.from(atob(signature.replaceAll('-', '+').replaceAll('_', '/')),
    character => character.charCodeAt(0))
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes, signed))
    throw Error('The provider history signature does not match the supplied key and manifest.')
}
