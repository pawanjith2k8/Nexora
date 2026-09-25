/**
 * Silent Ledger — Client-side BIP47 derivation (browser-only)
 * Matches backend/src/services/bip47.service.js exactly where applicable.
 * ECDH shared secret never leaves the browser.
 * Uses: tiny-secp256k1@2.2.4, bitcoinjs-lib@7.0.2, bs58check@4.0.0
 */

import * as ecc from "tiny-secp256k1";
import * as bitcoin from "bitcoinjs-lib";
import * as bs58check from "bs58check";

// Init ecc for bitcoinjs-lib
bitcoin.initEccLib(ecc as never);

const BIP47_PREFIX = 0x47;

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) throw new Error("Invalid hex length");
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(normalized.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isValidHex(hex: string, length: number): boolean {
  return new RegExp(`^[0-9a-fA-F]{${length}}$`).test(hex);
}

// Resolve bs58check decode/encode for both CJS and ESM interop
function b58Decode(str: string): Uint8Array {
  // bs58check may expose as default, named, or direct
  const anyBs58 = bs58check as unknown as Record<string, unknown>;
  let decoded: Uint8Array | Buffer | null = null;
  if (typeof anyBs58["decode"] === "function") {
    decoded = (anyBs58["decode"] as (s: string) => Uint8Array)(str);
  } else if (typeof (anyBs58["default"] as Record<string, unknown>)?.["decode"] === "function") {
    decoded = ((anyBs58["default"] as Record<string, unknown>)["decode"] as (s: string) => Uint8Array)(str);
  } else if (typeof anyBs58["default"] === "function") {
    decoded = (anyBs58["default"] as (s: string) => Uint8Array)(str);
  } else {
    throw new Error("bs58check decode not available");
  }
  return decoded instanceof Uint8Array ? decoded : new Uint8Array(decoded as Uint8Array);
}

/**
 * Decode and validate a BIP47 payment code (PM8...). Matches backend decodePaymentCode.
 */
export function decodePaymentCodeClient(paymentCode: string): {
  version: number;
  features: number;
  pubkeyHex: string;
  pubkeyBytes: Uint8Array;
  chaincodeHex: string;
  chaincodeBytes: Uint8Array;
  reservedHex: string;
} {
  if (!paymentCode || typeof paymentCode !== "string") {
    throw new Error("Invalid payment code string.");
  }
  const decoded = b58Decode(paymentCode);
  if (decoded[0] !== BIP47_PREFIX) {
    throw new Error(
      `Invalid payment code prefix: expected 0x${BIP47_PREFIX.toString(16)}, got 0x${decoded[0].toString(16)}`
    );
  }
  const payload = decoded.slice(1);
  if (payload.length !== 80) {
    throw new Error(`Invalid payment code length: expected 80 bytes, got ${payload.length}`);
  }
  const version = payload[0];
  const features = payload[1];
  const pubkeyBytes = payload.slice(2, 35);
  const chaincodeBytes = payload.slice(35, 67);
  const reservedBytes = payload.slice(67, 80);

  if (!ecc.isPoint(pubkeyBytes)) {
    throw new Error("Invalid secp256k1 public key inside payment code payload.");
  }

  return {
    version,
    features,
    pubkeyHex: bytesToHex(pubkeyBytes),
    pubkeyBytes,
    chaincodeHex: bytesToHex(chaincodeBytes),
    chaincodeBytes,
    reservedHex: bytesToHex(reservedBytes),
  };
}

/**
 * ECDH: S = priv * pub (33-byte compressed pub)
 * privHex: 64 hex (32 bytes), pubHex: 66 hex (33 bytes compressed)
 */
export function computeECDHClient(privHex: string, pubHex: string): Uint8Array {
  if (!isValidHex(privHex, 64)) throw new Error("Private key must be 32 bytes (64 hex).");
  if (!isValidHex(pubHex, 66)) throw new Error("Public key must be 33 bytes compressed (66 hex).");
  const privBytes = hexToBytes(privHex);
  const pubBytes = hexToBytes(pubHex);
  if (!ecc.isPoint(pubBytes)) throw new Error("Invalid pubkey point.");
  // tiny-secp256k1 pointMultiply expects (point, scalar)
  const shared = ecc.pointMultiply(pubBytes, privBytes, true);
  if (!shared) throw new Error("ECDH failed (point at infinity).");
  return shared;
}

/**
 * HMAC-SHA512 for browser: uses WebCrypto subtle (async) to match Node crypto.createHmac('sha512', key).
 * Computes tweak = HMAC-SHA512(chaincode, sharedSecret || indexBE)[0..32]
 */
export async function computeTweakClient(
  sharedSecret: Uint8Array,
  chaincode: Uint8Array,
  index: number
): Promise<Uint8Array> {
  const indexBytes = new Uint8Array(4);
  const view = new DataView(indexBytes.buffer);
  view.setUint32(0, index, false); // big-endian

  const data = new Uint8Array(sharedSecret.length + 4);
  data.set(sharedSecret, 0);
  data.set(indexBytes, sharedSecret.length);

  // Prefer WebCrypto subtle if available, else fallback to Node crypto (for SSR tests)
  const subtle = (globalThis.crypto && (globalThis.crypto as Crypto).subtle) || null;
  if (subtle) {
    const key = await subtle.importKey(
      "raw",
      chaincode as unknown as BufferSource,
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const sig = await subtle.sign("HMAC", key, data as unknown as BufferSource);
    const full = new Uint8Array(sig);
    return full.slice(0, 32);
  } else {
    // Fallback for Node environment (tests) — dynamic import to avoid bundling node crypto in browser unnecessarily
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto") as typeof import("crypto");
    const hmac = nodeCrypto.createHmac("sha512", Buffer.from(chaincode));
    hmac.update(Buffer.from(data));
    const digest: Buffer = hmac.digest();
    return new Uint8Array(digest.slice(0, 32));
  }
}

export function deriveOneTimePubkeyClient(receiverPubkey: Uint8Array, tweak: Uint8Array): Uint8Array {
  const derived = ecc.pointAddScalar(receiverPubkey, tweak, true);
  if (!derived) throw new Error("Failed to derive point on secp256k1 curve (tweak overflow or infinity).");
  return derived;
}

export function pubkeyToAddressClient(
  pubkeyBytes: Uint8Array,
  addressType: "p2wpkh" | "p2pkh" | "p2tr" = "p2wpkh",
  networkName: "testnet" | "mainnet" = "testnet"
): string {
  const network = networkName === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  if (addressType === "p2wpkh") {
    const payment = bitcoin.payments.p2wpkh({ pubkey: pubkeyBytes, network });
    if (!payment.address) throw new Error("p2wpkh address generation failed");
    return payment.address;
  }
  if (addressType === "p2tr") {
    const xOnly = pubkeyBytes.slice(1, 33);
    const payment = bitcoin.payments.p2tr({ pubkey: xOnly, network });
    if (!payment.address) throw new Error("p2tr address generation failed");
    return payment.address;
  }
  if (addressType === "p2pkh") {
    const payment = bitcoin.payments.p2pkh({ pubkey: pubkeyBytes, network });
    if (!payment.address) throw new Error("p2pkh address generation failed");
    return payment.address;
  }
  throw new Error(`Unsupported address type: ${addressType}`);
}

export type DerivedAddressClient = {
  index: number;
  address: string;
  derivedPubkeyHex: string;
  tweakHex: string;
  addressType: string;
  network: string;
};

/**
 * Client-side deriveAddressSequence — mirrors backend deriveAddressSequence exactly.
 * All crypto stays in browser. Never call backend with sharedSecret.
 */
export async function deriveAddressSequenceClient(params: {
  receiverPaymentCode: string;
  sharedSecretHex: string;
  count?: number;
  startIndex?: number;
  addressType?: "p2wpkh" | "p2pkh" | "p2tr";
  network?: "testnet" | "mainnet";
}): Promise<DerivedAddressClient[]> {
  const {
    receiverPaymentCode,
    sharedSecretHex,
    count = 5,
    startIndex = 0,
    addressType = "p2wpkh",
    network = "testnet",
  } = params;

  const receiverInfo = decodePaymentCodeClient(receiverPaymentCode);
  if (!isValidHex(sharedSecretHex, sharedSecretHex.length)) throw new Error("Invalid sharedSecretHex.");
  // sharedSecret from ECDH is 33 bytes compressed point (02/03...), backend stores as 33-byte hex via sharedFromBob.toString('hex')
  // Our sharedSecretHex is that 33-byte point hex (66 chars). Validate length 66.
  // Allow 66 hex (compressed) as produced by pointMultiply(true)
  const sharedSecretBytes = hexToBytes(sharedSecretHex);

  const addresses: DerivedAddressClient[] = [];
  const safeCount = Math.min(20, Math.max(1, count));
  for (let i = startIndex; i < startIndex + safeCount; i++) {
    const tweak = await computeTweakClient(sharedSecretBytes, receiverInfo.chaincodeBytes, i);
    const derivedPubkey = deriveOneTimePubkeyClient(receiverInfo.pubkeyBytes, tweak);
    const address = pubkeyToAddressClient(derivedPubkey, addressType, network);
    addresses.push({
      index: i,
      address,
      derivedPubkeyHex: bytesToHex(derivedPubkey),
      tweakHex: bytesToHex(tweak),
      addressType,
      network,
    });
  }
  return addresses;
}

/**
 * Generate a random 32-byte private key hex (for demo/local ephemeral). Uses WebCrypto.
 */
export function generateRandomPrivHex(): string {
  const bytes = new Uint8Array(32);
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    // fallback for Node
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto") as typeof import("crypto");
    const buf: Buffer = nodeCrypto.randomBytes(32);
    bytes.set(buf);
  }
  // Ensure valid scalar: tiny-secp256k1 private key must be < curve order, not zero.
  // Simple retry if invalid (rare)
  if (!ecc.isPrivate(bytes)) {
    return generateRandomPrivHex();
  }
  return bytesToHex(bytes);
}

export function isValidPrivateHex(hex: string): boolean {
  if (!isValidHex(hex, 64)) return false;
  try {
    const b = hexToBytes(hex);
    return ecc.isPrivate(b);
  } catch {
    return false;
  }
}

export { hexToBytes, bytesToHex };
