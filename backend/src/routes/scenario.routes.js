const express = require('express');
const router = express.Router();
const { auditWallet } = require('../services/privacyAuditor.service');
const bip47Service = require('../services/bip47.service');

/**
 * GET /api/scenarios/simulated-wallet-bad
 * Demonstrates the 4 classic on-chain privacy leaks for the hackathon demo:
 * 1. Address reuse
 * 2. Unsolicited dust attack (546 sats)
 * 3. Mixed address types (Legacy, Native SegWit, Taproot)
 * 4. Common-Input-Ownership co-spend risk
 */
router.get('/simulated-wallet-bad', (req, res) => {
  const simulatedUtxos = [
    // Address Reuse: 3 deposits to tb1qreused6v8g7k4u9w0h2y1a3s5d7f9g0h1j2k3l4
    {
      txid: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      vout: 0,
      address: 'tb1qreused6v8g7k4u9w0h2y1a3s5d7f9g0h1j2k3l4',
      value: 150000,
      label: 'Salary payment (Reused address deposit #1)'
    },
    {
      txid: 'b2c3d4e5f6a17890123456789abcdef0123456789abcdef0123456789abcdef1',
      vout: 1,
      address: 'tb1qreused6v8g7k4u9w0h2y1a3s5d7f9g0h1j2k3l4',
      value: 80000,
      label: 'Freelance payout (Reused address deposit #2)'
    },
    {
      txid: 'c3d4e5f6a1b27890123456789abcdef0123456789abcdef0123456789abcdef2',
      vout: 0,
      address: 'tb1qreused6v8g7k4u9w0h2y1a3s5d7f9g0h1j2k3l4',
      value: 200000,
      label: 'Online marketplace sale (Reused address deposit #3)'
    },
    // Dust Attack Deposit: 546 sats to track user
    {
      txid: 'd4e5f6a1b2c37890123456789abcdef0123456789abcdef0123456789abcdef3',
      vout: 0,
      address: 'tb1qdustprobe9x8y7w6v5u4t3s2r1q0p9o8n7m6l5k4',
      value: 546,
      label: 'Unsolicited micro-deposit (Dust attack probe)'
    },
    // Legacy P2PKH script type mixing
    {
      txid: 'e5f6a1b2c3d47890123456789abcdef0123456789abcdef0123456789abcdef4',
      vout: 2,
      address: 'mfg8v6K5gY8QyX2D4v7H8k2R4j5L6m7N8P',
      value: 50000,
      label: 'Old legacy deposit'
    },
    // Taproot P2TR script type mixing
    {
      txid: 'f6a1b2c3d4e57890123456789abcdef0123456789abcdef0123456789abcdef5',
      vout: 0,
      address: 'tb1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqvg32hk',
      value: 120000,
      label: 'Taproot swap output'
    }
  ];

  const simulatedTransactions = [
    {
      txid: '99887766554433221100aabbccddeeff99887766554433221100aabbccddeeff',
      vin: [
        { scriptpubkey_address: 'tb1qreused6v8g7k4u9w0h2y1a3s5d7f9g0h1j2k3l4' },
        { scriptpubkey_address: 'mfg8v6K5gY8QyX2D4v7H8k2R4j5L6m7N8P' }
      ],
      vout: [
        { scriptpubkey_address: 'tb1qnewrecipient872364872364872364872364', value: 180000 }
      ]
    }
  ];

  const audit = auditWallet({ utxos: simulatedUtxos, transactions: simulatedTransactions });

  res.json({
    success: true,
    scenario: 'Simulated Vulnerable Test Wallet (Demo Scenario)',
    description: 'A test wallet that made common privacy errors: address reuse, accepting dust, mixing script types, and risking CIOH.',
    totalBalanceSats: simulatedUtxos.reduce((acc, u) => acc + u.value, 0),
    utxos: simulatedUtxos,
    audit
  });
});

/**
 * GET /api/scenarios/simulated-wallet-clean
 * Demonstrates a pristine Silent Ledger wallet using BIP47 one-time addresses.
 */
router.get('/simulated-wallet-clean', (req, res) => {
  const simulatedUtxos = [
    {
      txid: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      vout: 0,
      address: 'tb1qrwkd27lqkk4mpldqhlervt4jqjmzsu6eplvng5',
      value: 150000,
      label: 'Bob -> Alice (Silent Ledger payment #0)'
    },
    {
      txid: '123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0',
      vout: 0,
      address: 'tb1q9jfq98u32fjsdkfj93847fsjdfklj34897fsjd',
      value: 200000,
      label: 'Bob -> Alice (Silent Ledger payment #1)'
    },
    {
      txid: '23456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef1',
      vout: 0,
      address: 'tb1qz87kjsdfkjhsdf98374ksdjfkj238947ksdfjk',
      value: 175000,
      label: 'Charlie -> Alice (Silent Ledger payment #0)'
    }
  ];

  const audit = auditWallet({ utxos: simulatedUtxos });

  res.json({
    success: true,
    scenario: 'Pristine Silent Ledger Wallet (Demo Scenario)',
    description: 'A wallet utilizing BIP47 one-time addresses discovered over Nostr. Zero reuse, zero dust, uniform SegWit.',
    totalBalanceSats: simulatedUtxos.reduce((acc, u) => acc + u.value, 0),
    utxos: simulatedUtxos,
    audit
  });
});

/**
 * GET /api/scenarios/alice-bob-flow
 * Complete end-to-end interactive demo script data for judges:
 * 1. Alice publishes payment code to Nostr
 * 2. Bob looks up Alice's npub
 * 3. Bob sends private NIP-17 handshake
 * 4. Both derive identical one-time addresses #0..#4
 * 5. Payment executed directly on-chain with zero traces
 */
router.get('/alice-bob-flow', (req, res) => {
  const demoPair = bip47Service.createDemoPair();

  res.json({
    success: true,
    title: 'Silent Ledger: End-to-End Payment Flow',
    steps: [
      {
        step: 1,
        title: 'Identity & Payment Code Publication',
        actor: 'Alice (Receiver)',
        action: 'Alice generates a BIP47 Payment Code and signs a Nostr kind 30078 event tied to her npub.',
        data: {
          npub: demoPair.alice.npub,
          paymentCode: demoPair.alice.paymentCode,
          eventKind: 30078,
          tag: ['d', 'silent-ledger/payment-code']
        }
      },
      {
        step: 2,
        title: 'Discovery over Nostr',
        actor: 'Bob (Sender)',
        action: 'Bob queries Nostr relays using Alice’s npub and verifies the event signature to extract her payment code.',
        data: {
          targetNpub: demoPair.alice.npub,
          resolvedPaymentCode: demoPair.alice.paymentCode,
          signatureVerified: true
        }
      },
      {
        step: 3,
        title: 'Private NIP-17 Handshake (Zero On-Chain Trace)',
        actor: 'Bob -> Alice',
        action: 'Bob delivers his own payment code to Alice in a metadata-hidden NIP-17 encrypted DM (Gift Wrap + Seal).',
        data: {
          handshakeProtocol: 'NIP-17 (NIP-59 Gift Wrap)',
          onChainNotificationTxNeeded: false,
          senderPaymentCode: demoPair.bob.paymentCode
        }
      },
      {
        step: 4,
        title: 'Independent ECDH One-Time Address Derivation',
        actor: 'Alice & Bob (Local Only)',
        action: 'Both parties compute the exact same ECDH shared secret and derive the one-time receiving address sequence.',
        data: {
          sharedSecretHex: demoPair.ecdh.sharedSecretHex,
          secretsMatchParity: demoPair.ecdh.secretsMatchParity,
          derivedAddressesMatch: demoPair.derivedAddressesMatch,
          derivedAddresses: demoPair.addresses
        }
      },
      {
        step: 5,
        title: 'On-Chain Payment to Unlinkable Address',
        actor: 'Bob -> Bitcoin Testnet',
        action: 'Bob pays directly to Alice’s derived Address #0. No Nostr message is sent for this or any future payments.',
        data: {
          destinationAddress: demoPair.addresses[0].address,
          reusableForNextPayment: 'Address #1 (' + demoPair.addresses[1].address + ')'
        }
      }
    ]
  });
});

module.exports = router;
