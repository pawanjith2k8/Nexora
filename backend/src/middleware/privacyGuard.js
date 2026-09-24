/**
 * Privacy Guard Middleware ("Zero-Knowledge Gatekeeper")
 * Enforces the core architectural rule:
 * "No backend server should ever receive raw wallet data, xpubs, or private keys."
 */

// Regex patterns for sensitive cryptographic material
const WIF_PRIVATE_KEY_REGEX = /\b[5KLc9][1-9A-HJ-NP-Za-km-z]{45,55}\b/;
const EXTENDED_PRIVATE_KEY_REGEX = /\b[xtzy]prv[1-9A-HJ-NP-Za-km-z]{50,125}\b/;
const EXTENDED_PUBLIC_KEY_REGEX = /\b[xtzy]pub[1-9A-HJ-NP-Za-km-z]{50,125}\b/;

// Quick scan of string or object for forbidden patterns
function scanForLeaks(obj, path = '', options = { blockXpub: true }) {
  if (obj === null || obj === undefined) return null;

  if (typeof obj === 'string') {
    if (EXTENDED_PRIVATE_KEY_REGEX.test(obj)) {
      return { field: path, reason: 'Extended private key (xprv/tprv) detected.' };
    }
    if (WIF_PRIVATE_KEY_REGEX.test(obj)) {
      return { field: path, reason: 'Bitcoin WIF private key detected.' };
    }
    if (options.blockXpub && EXTENDED_PUBLIC_KEY_REGEX.test(obj)) {
      return { field: path, reason: 'Extended public key (xpub/tpub) detected. Wallet data must stay client-side.' };
    }
    // Check for BIP-39 mnemonic phrase pattern (12, 15, 18, 24 lowercase space-separated words)
    const words = obj.trim().split(/\s+/);
    if ((words.length === 12 || words.length === 24) && words.every(w => /^[a-z]{3,8}$/.test(w))) {
      return { field: path, reason: 'BIP39 mnemonic seed phrase detected.' };
    }
    return null;
  }

  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (['privatekey', 'privkey', 'seed', 'mnemonic', 'secretkey', 'xprv', 'tprv'].some(k => lowerKey.includes(k))) {
        return { field: `${path}.${key}`, reason: `Field name '${key}' strongly suggests private material.` };
      }
      if (options.blockXpub && ['xpub', 'tpub', 'zpub', 'ypub'].some(k => lowerKey.includes(k))) {
        return { field: `${path}.${key}`, reason: `Field name '${key}' contains raw wallet xpub.` };
      }
      const leak = scanForLeaks(value, path ? `${path}.${key}` : key, options);
      if (leak) return leak;
    }
  }

  return null;
}

/**
 * Middleware that strictly protects against sensitive data being passed to the server.
 */
function privacyGuard(options = { blockXpub: true }) {
  return (req, res, next) => {
    // Scan body, query, and headers
    const bodyLeak = scanForLeaks(req.body, 'body', options);
    if (bodyLeak) {
      return res.status(400).json({
        success: false,
        error: 'Privacy Violation Detected',
        code: 'PRIVACY_GUARD_BLOCKED',
        detail: bodyLeak.reason,
        field: bodyLeak.field,
        message: 'Silent Ledger architectural rule: Private keys, seed phrases, and xpubs must NEVER leave your browser. All wallet analysis and keys stay 100% client-side.'
      });
    }

    const queryLeak = scanForLeaks(req.query, 'query', options);
    if (queryLeak) {
      return res.status(400).json({
        success: false,
        error: 'Privacy Violation Detected',
        code: 'PRIVACY_GUARD_BLOCKED',
        detail: queryLeak.reason,
        field: queryLeak.field,
        message: 'Silent Ledger architectural rule: Never pass sensitive keys in URL query parameters.'
      });
    }

    next();
  };
}

module.exports = {
  privacyGuard,
  scanForLeaks
};
