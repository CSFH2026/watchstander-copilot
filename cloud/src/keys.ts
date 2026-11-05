// Ed25519 through WebCrypto. Private keys are 32-byte seeds (the PyNaCl SigningKey format) held in
// Pages secrets named by keyName(); public keys come from the roster in the bundle.
import { bundle } from './bundle.ts';
import type { Env } from './types.ts';

// DER header that wraps a raw 32-byte Ed25519 seed as PKCS#8, the only private format WebCrypto imports.
const PKCS8_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);
const ALG = { name: 'Ed25519' };
const privateKeys = new Map<string, CryptoKey>();

export const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Same rule as secret_name() in scripts/keys_cloud.py.
export function keyName(identity: string): `WSC_KEY_${string}` {
  return `WSC_KEY_${identity.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

async function privateKey(env: Env, identity: string): Promise<CryptoKey> {
  const hit = privateKeys.get(identity);
  if (hit) return hit;
  const seed = env[keyName(identity)];
  if (!seed) throw new Error(`No signing key for ${identity}. Set the ${keyName(identity)} secret (scripts/keys_cloud.py).`);
  const der = new Uint8Array(PKCS8_PREFIX.length + 32);
  der.set(PKCS8_PREFIX);
  der.set(unb64(seed.trim()), PKCS8_PREFIX.length);
  const key = await crypto.subtle.importKey('pkcs8', der, ALG, false, ['sign']);
  privateKeys.set(identity, key);
  return key;
}

export async function sign(env: Env, identity: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign(ALG, await privateKey(env, identity), new TextEncoder().encode(message));
  return b64(new Uint8Array(sig));
}

export async function verify(identity: string, message: string, signature: string): Promise<boolean> {
  const pub = bundle.roster[identity];
  if (!pub) return false;
  try {
    const key = await crypto.subtle.importKey('raw', unb64(pub), ALG, false, ['verify']);
    return await crypto.subtle.verify(ALG, key, unb64(signature), new TextEncoder().encode(message));
  } catch {
    return false;
  }
}
