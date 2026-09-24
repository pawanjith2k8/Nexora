const { nip19, verifyEvent } = require('nostr-tools');
const WebSocket = require('ws');
const config = require('../config');

// Ensure global WebSocket is available for nostr-tools SimplePool if needed
if (!global.WebSocket) {
  global.WebSocket = WebSocket;
}

/**
 * Normalizes an npub (or hex string) to 64-character lowercase hex pubkey.
 */
function normalizeToHexPubkey(pubkeyOrNpub) {
  if (!pubkeyOrNpub || typeof pubkeyOrNpub !== 'string') {
    throw new Error('Public key or npub is required.');
  }

  const clean = pubkeyOrNpub.trim();
  if (clean.startsWith('npub1')) {
    const decoded = nip19.decode(clean);
    if (decoded.type !== 'npub') {
      throw new Error(`Invalid bech32 type: expected npub, got ${decoded.type}`);
    }
    return decoded.data;
  }

  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    return clean.toLowerCase();
  }

  throw new Error('Invalid format: Must be either an npub (npub1...) or a 64-character hex public key.');
}

/**
 * Converts a 64-char hex public key to an npub.
 */
function hexToNpub(hexPubkey) {
  return nip19.npubEncode(hexPubkey.toLowerCase());
}

/**
 * Creates an unsigned Nostr event template for publishing a BIP47 Payment Code.
 * Kind 30078 is Parameterized Replaceable Application Data (NIP-78).
 */
function createPaymentCodeEventTemplate(pubkeyHex, paymentCode, relayHint = '') {
  return {
    kind: config.SILENT_LEDGER_NOSTR_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', 'silent-ledger/payment-code'],
      ['bip47', paymentCode],
      ['client', 'silent-ledger'],
      ['version', '1.0.0']
    ],
    content: JSON.stringify({
      type: 'silent-ledger/payment-code',
      paymentCode,
      advertisedAt: new Date().toISOString()
    }),
    pubkey: pubkeyHex
  };
}

/**
 * Creates a NIP-17 Private Handshake wrapper payload structure.
 * NIP-17 direct messages wrap a Rumor (kind 14) inside a Seal (kind 13) inside a Gift Wrap (kind 1059).
 */
function createNip17HandshakeTemplate({ senderPubkeyHex, receiverPubkeyHex, senderPaymentCode }) {
  const timestamp = Math.floor(Date.now() / 1000);
  const rumor = {
    kind: 14, // Chat message rumor
    created_at: timestamp,
    pubkey: senderPubkeyHex,
    tags: [['p', receiverPubkeyHex]],
    content: JSON.stringify({
      protocol: 'silent-ledger/nip17-handshake',
      action: 'initiate_payment_channel',
      senderPaymentCode,
      message: 'Silent Ledger private payment channel established. Deriving shared address sequence.'
    })
  };

  return {
    description: 'NIP-17 Handshake Message Blueprint',
    rumor,
    flow: [
      '1. Sender creates Rumor (kind 14) containing their BIP47 payment code.',
      '2. Sender encrypts Rumor using NIP-44 and wraps in Seal (kind 13).',
      '3. Sender creates random one-time ephemeral key and wraps Seal in Gift Wrap (kind 1059) addressed to receiver.',
      '4. Gift Wrap is published to Nostr relays with zero visible sender or receiver metadata.',
      '5. Receiver decrypts Gift Wrap -> Seal -> Rumor, recovers sender payment code, and derives identical Bitcoin addresses.'
    ]
  };
}

/**
 * Queries public Nostr relays for a user's BIP47 payment code event (kind 30078).
 */
async function resolvePaymentCode(pubkeyOrNpub, relays = config.NOSTR_RELAYS, timeoutMs = 6000) {
  const hexPubkey = normalizeToHexPubkey(pubkeyOrNpub);
  const npub = hexToNpub(hexPubkey);

  const filter = {
    kinds: [config.SILENT_LEDGER_NOSTR_KIND],
    authors: [hexPubkey],
    '#d': ['silent-ledger/payment-code']
  };

  return new Promise((resolve) => {
    let resolved = false;
    let pendingRelays = relays.length;
    const errors = [];

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          hexPubkey,
          npub,
          paymentCode: null,
          message: 'Relay query timed out without finding a published payment code for this npub.',
          checkedRelays: relays,
          errors
        });
      }
    }, timeoutMs);

    relays.forEach(relayUrl => {
      try {
        const ws = new WebSocket(relayUrl);
        const subId = 'sl_' + Math.random().toString(36).substring(2, 8);

        const cleanup = () => {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(['CLOSE', subId]));
              ws.close();
            }
          } catch {}
        };

        ws.on('open', () => {
          ws.send(JSON.stringify(['REQ', subId, filter]));
        });

        ws.on('message', (data) => {
          try {
            const parsed = JSON.parse(data.toString());
            const [type, incomingSubId, event] = parsed;

            if (type === 'EVENT' && incomingSubId === subId && event) {
              // Verify event signature
              if (verifyEvent(event)) {
                // Extract BIP47 payment code from tags or content
                let paymentCode = null;
                const bip47Tag = event.tags?.find(t => t[0] === 'bip47');
                if (bip47Tag && bip47Tag[1]) {
                  paymentCode = bip47Tag[1];
                } else {
                  try {
                    const contentObj = JSON.parse(event.content);
                    paymentCode = contentObj.paymentCode;
                  } catch {}
                }

                if (paymentCode && !resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  cleanup();
                  return resolve({
                    success: true,
                    hexPubkey,
                    npub,
                    paymentCode,
                    event,
                    discoveredOnRelay: relayUrl
                  });
                }
              }
            } else if (type === 'EOSE' && incomingSubId === subId) {
              cleanup();
              pendingRelays--;
              if (pendingRelays === 0 && !resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve({
                  success: false,
                  hexPubkey,
                  npub,
                  paymentCode: null,
                  message: 'No Silent Ledger payment code event found on relays for this identity.',
                  checkedRelays: relays
                });
              }
            }
          } catch (e) {
            errors.push(`${relayUrl}: ${e.message}`);
          }
        });

        ws.on('error', (err) => {
          errors.push(`${relayUrl}: ${err.message}`);
          pendingRelays--;
        });
      } catch (err) {
        errors.push(`${relayUrl}: ${err.message}`);
        pendingRelays--;
      }
    });
  });
}

/**
 * Checks connectivity and responsiveness of standard public Nostr relays.
 */
async function checkRelays(relays = config.NOSTR_RELAYS, timeoutMs = 4000) {
  const results = await Promise.all(
    relays.map(url => new Promise((resolve) => {
      const start = Date.now();
      try {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
          try { ws.terminate(); } catch {}
          resolve({ url, status: 'timeout', latencyMs: timeoutMs, online: false });
        }, timeoutMs);

        ws.on('open', () => {
          clearTimeout(timer);
          const latencyMs = Date.now() - start;
          try { ws.close(); } catch {}
          resolve({ url, status: 'connected', latencyMs, online: true });
        });

        ws.on('error', (e) => {
          clearTimeout(timer);
          resolve({ url, status: 'error', error: e.message, online: false });
        });
      } catch (e) {
        resolve({ url, status: 'error', error: e.message, online: false });
      }
    }))
  );

  return {
    relays: results,
    onlineCount: results.filter(r => r.online).length,
    totalCount: results.length
  };
}

module.exports = {
  normalizeToHexPubkey,
  hexToNpub,
  createPaymentCodeEventTemplate,
  createNip17HandshakeTemplate,
  resolvePaymentCode,
  checkRelays,
  verifyEvent
};
