const crypto = require('crypto');
const ecc = require('tiny-secp256k1');
const bitcoin = require('bitcoinjs-lib');
const bs58checkRaw = require('bs58check');
const bs58check = bs58checkRaw.default || bs58checkRaw;

// Initialize ECC for bitcoinjs-lib
bitcoin.initEccLib(ecc);

const BIP47_PREFIX = 0x47; // Base58 prefix for BIP47 payment codes ('PM8...')

/**
 * Encodes a BIP47 payment code from a 33-byte compressed pubkey and 32-byte chaincode.
 * Total payload: 80 bytes (version: 1, features: 1, pubkey: 33, chaincode: 32, reserved: 13)
 */
function encodePaymentCode(pubkeyBuffer, chaincodeBuffer = null, version = 0x01) {
  if (pubkeyBuffer.length !== 33) {
    throw new Error('Public key must be 33 bytes compressed secp256k1.');
  }

  const chaincode = chaincodeBuffer || crypto.randomBytes(32);
  if (chaincode.length !== 32) {
    throw new Error('Chaincode must be 32 bytes.');
  }

  const payload = Buffer.alloc(80);
  payload[0] = version;     // Version (0x01)
  payload[1] = 0x01;        // Features (0x01 = bit 0 indicates compressed pubkeys)
  pubkeyBuffer.copy(payload, 2, 0, 33);
  chaincode.copy(payload, 35, 0, 32);
  // remaining 13 bytes left as 0x00 reserved

  const versionedPayload = Buffer.concat([Buffer.from([BIP47_PREFIX]), payload]);
  return bs58check.encode(versionedPayload);
}

/**
 * Decodes and validates a BIP47 payment code string.
 */
function decodePaymentCode(pcodeStr) {
  if (!pcodeStr || typeof pcodeStr !== 'string') {
    throw new Error('Invalid payment code string.');
  }

  const decoded = Buffer.from(bs58check.decode(pcodeStr));
  if (decoded[0] !== BIP47_PREFIX) {
    throw new Error(`Invalid payment code prefix: expected 0x${BIP47_PREFIX.toString(16)}, got 0x${decoded[0].toString(16)}`);
  }

  const payload = Buffer.from(decoded.slice(1));
  if (payload.length !== 80) {
    throw new Error(`Invalid payment code length: expected 80 bytes, got ${payload.length}`);
  }

  const version = payload[0];
  const features = payload[1];
  const pubkey = Buffer.from(payload.slice(2, 35));
  const chaincode = Buffer.from(payload.slice(35, 67));
  const reserved = Buffer.from(payload.slice(67, 80));

  if (!ecc.isPoint(pubkey)) {
    throw new Error('Invalid secp256k1 public key inside payment code payload.');
  }

  return {
    version,
    features,
    pubkey: pubkey.toString('hex'),
    pubkeyBuffer: pubkey,
    chaincode: chaincode.toString('hex'),
    chaincodeBuffer: chaincode,
    reserved: reserved.toString('hex')
  };
}

/**
 * Check if string is valid BIP47 payment code.
 */
function isValidPaymentCode(pcodeStr) {
  try {
    decodePaymentCode(pcodeStr);
    return true;
  } catch {
    return false;
  }
}

/**
 * Derives ECDH shared point S between Alice's pubkey and Bob's pubkey given one side's private key.
 * If only pubkeys are provided (for demonstration or verification), an ECDH point is computed or verified.
 */
function computeECDH(privkeyBuffer, pubkeyBuffer) {
  return Buffer.from(ecc.pointMultiply(pubkeyBuffer, privkeyBuffer));
}

/**
 * Computes scalar tweak for index i from shared secret S and chaincode.
 * tweak = HMAC-SHA512(chaincode, S || i)[0..32]
 */
function computeTweak(sharedSecretBuffer, chaincodeBuffer, index = 0) {
  const indexBuffer = Buffer.alloc(4);
  indexBuffer.writeUInt32BE(index, 0);

  const data = Buffer.concat([sharedSecretBuffer, indexBuffer]);
  const hmac = crypto.createHmac('sha512', chaincodeBuffer);
  hmac.update(data);
  const digest = hmac.digest();
  return digest.slice(0, 32);
}

/**
 * Derives the one-time public key for receiver given receiver pubkey and tweak:
 * P_i = P + tweak * G
 */
function deriveOneTimePubkey(receiverPubkeyBuffer, tweakBuffer) {
  const derivedPoint = ecc.pointAddScalar(receiverPubkeyBuffer, tweakBuffer);
  if (!derivedPoint) {
    throw new Error('Failed to derive point on secp256k1 curve (tweak overflow or infinity).');
  }
  return Buffer.from(derivedPoint);
}

/**
 * Converts a public key into a Bitcoin address.
 * Supported types: 'p2wpkh' (native segwit, default), 'p2tr' (taproot), 'p2pkh' (legacy)
 */
function pubkeyToAddress(pubkeyBuffer, addressType = 'p2wpkh', networkName = 'testnet') {
  const network = networkName === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;

  if (addressType === 'p2wpkh') {
    return bitcoin.payments.p2wpkh({ pubkey: pubkeyBuffer, network }).address;
  }
  if (addressType === 'p2tr') {
    // Taproot uses x-only 32-byte pubkey
    const xOnly = pubkeyBuffer.slice(1, 33);
    return bitcoin.payments.p2tr({ pubkey: xOnly, network }).address;
  }
  if (addressType === 'p2pkh') {
    return bitcoin.payments.p2pkh({ pubkey: pubkeyBuffer, network }).address;
  }
  throw new Error(`Unsupported address type: ${addressType}`);
}

/**
 * Generates an end-to-end address sequence for a sender-receiver pair.
 */
function deriveAddressSequence({
  receiverPaymentCode,
  sharedSecretHex,
  count = 5,
  startIndex = 0,
  addressType = 'p2wpkh',
  network = 'testnet'
}) {
  const receiverInfo = decodePaymentCode(receiverPaymentCode);
  const sharedSecretBuffer = Buffer.from(sharedSecretHex, 'hex');

  const addresses = [];
  for (let i = startIndex; i < startIndex + count; i++) {
    const tweak = computeTweak(sharedSecretBuffer, receiverInfo.chaincodeBuffer, i);
    const derivedPubkey = deriveOneTimePubkey(receiverInfo.pubkeyBuffer, tweak);
    const address = pubkeyToAddress(derivedPubkey, addressType, network);

    addresses.push({
      index: i,
      address,
      derivedPubkey: derivedPubkey.toString('hex'),
      tweak: tweak.toString('hex'),
      addressType,
      network
    });
  }

  return addresses;
}

/**
 * Deterministic Demo Identity Generator:
 * Generates Alice and Bob credentials (payment codes and verified shared secret) for testing and UI demo.
 */
function createDemoPair() {
  // Deterministic seeds for reproducible demo
  const alicePriv = crypto.createHash('sha256').update('silent-ledger-alice-demo-seed-2026').digest();
  const alicePub = Buffer.from(ecc.pointFromScalar(alicePriv));
  const aliceChain = crypto.createHash('sha256').update('alice-chain-code').digest();
  const alicePaymentCode = encodePaymentCode(alicePub, aliceChain);

  const bobPriv = crypto.createHash('sha256').update('silent-ledger-bob-demo-seed-2026').digest();
  const bobPub = Buffer.from(ecc.pointFromScalar(bobPriv));
  const bobChain = crypto.createHash('sha256').update('bob-chain-code').digest();
  const bobPaymentCode = encodePaymentCode(bobPub, bobChain);

  // Bob sends to Alice -> Shared secret S = bobPriv * alicePub = alicePriv * bobPub
  const sharedFromBob = computeECDH(bobPriv, alicePub);
  const sharedFromAlice = computeECDH(alicePriv, bobPub);
  const secretsMatch = Buffer.compare(sharedFromBob, sharedFromAlice) === 0;

  // Deriving first 5 addresses Alice can receive from Bob
  const aliceDerivedAddresses = [];
  const bobDerivedAddresses = [];

  for (let i = 0; i < 5; i++) {
    // Alice deriving her own receiving addresses
    const tweakAlice = computeTweak(sharedFromAlice, aliceChain, i);
    const pubAlice_i = deriveOneTimePubkey(alicePub, tweakAlice);
    const addrAlice = pubkeyToAddress(pubAlice_i, 'p2wpkh', 'testnet');
    aliceDerivedAddresses.push({ index: i, address: addrAlice });

    // Bob deriving Alice's receiving addresses using Alice's payment code + shared secret
    const tweakBob = computeTweak(sharedFromBob, aliceChain, i);
    const pubBob_i = deriveOneTimePubkey(alicePub, tweakBob);
    const addrBob = pubkeyToAddress(pubBob_i, 'p2wpkh', 'testnet');
    bobDerivedAddresses.push({ index: i, address: addrBob });
  }

  return {
    alice: {
      name: 'Alice (Receiver)',
      npub: 'npub1alice8q09n2x2f94s02347sdjfksdfjh283472934sdjkfsdf238',
      nostrPubkeyHex: crypto.createHash('sha256').update('alice-nostr-pub').digest('hex'),
      paymentCode: alicePaymentCode,
      pubkeyHex: alicePub.toString('hex')
    },
    bob: {
      name: 'Bob (Sender)',
      npub: 'npub1bob92k34j234klsdfjkl234jsdfjkl234sdfjkl234sdflkj23',
      nostrPubkeyHex: crypto.createHash('sha256').update('bob-nostr-pub').digest('hex'),
      paymentCode: bobPaymentCode,
      pubkeyHex: bobPub.toString('hex')
    },
    ecdh: {
      sharedSecretHex: sharedFromBob.toString('hex'),
      secretsMatchParity: secretsMatch
    },
    derivedAddressesMatch: aliceDerivedAddresses.every((a, idx) => a.address === bobDerivedAddresses[idx].address),
    addresses: aliceDerivedAddresses
  };
}

module.exports = {
  encodePaymentCode,
  decodePaymentCode,
  isValidPaymentCode,
  computeECDH,
  computeTweak,
  deriveOneTimePubkey,
  pubkeyToAddress,
  deriveAddressSequence,
  createDemoPair
};
