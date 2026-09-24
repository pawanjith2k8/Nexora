const express = require('express');
const router = express.Router();
const bip47Service = require('../services/bip47.service');

/**
 * POST /api/crypto/bip47/encode
 * Encodes a compressed public key (33 bytes hex) and optional chaincode (32 bytes hex) into a BIP47 Payment Code.
 */
router.post('/bip47/encode', (req, res, next) => {
  try {
    const { pubkeyHex, chaincodeHex } = req.body;
    if (!pubkeyHex || typeof pubkeyHex !== 'string') {
      return res.status(400).json({ success: false, error: '33-byte compressed pubkeyHex is required.' });
    }

    const pubkeyBuffer = Buffer.from(pubkeyHex, 'hex');
    const chaincodeBuffer = chaincodeHex ? Buffer.from(chaincodeHex, 'hex') : null;
    const paymentCode = bip47Service.encodePaymentCode(pubkeyBuffer, chaincodeBuffer);

    res.json({
      success: true,
      paymentCode,
      pubkeyHex,
      chaincodeHex: chaincodeBuffer ? chaincodeHex : undefined
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/crypto/bip47/decode
 * Decodes and validates a BIP47 Payment Code string ('PM8...').
 */
router.post('/bip47/decode', (req, res, next) => {
  try {
    const { paymentCode } = req.body;
    if (!paymentCode) {
      return res.status(400).json({ success: false, error: 'paymentCode is required.' });
    }

    const decoded = bip47Service.decodePaymentCode(paymentCode);
    res.json({
      success: true,
      paymentCode,
      isValid: true,
      decoded: {
        version: decoded.version,
        features: decoded.features,
        pubkey: decoded.pubkey,
        chaincode: decoded.chaincode
      }
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      isValid: false,
      error: err.message
    });
  }
});

/**
 * POST /api/crypto/ecdh/derive-sequence
 * Derives a sequence of one-time addresses given receiver payment code and shared secret hex.
 */
router.post('/ecdh/derive-sequence', (req, res, next) => {
  try {
    const { receiverPaymentCode, sharedSecretHex, count = 5, startIndex = 0, addressType = 'p2wpkh', network = 'testnet' } = req.body;

    if (!receiverPaymentCode || !sharedSecretHex) {
      return res.status(400).json({
        success: false,
        error: 'Both receiverPaymentCode and sharedSecretHex are required.'
      });
    }

    const addresses = bip47Service.deriveAddressSequence({
      receiverPaymentCode,
      sharedSecretHex,
      count: Math.min(20, Math.max(1, count)),
      startIndex,
      addressType,
      network
    });

    res.json({
      success: true,
      receiverPaymentCode,
      addressType,
      network,
      count: addresses.length,
      addresses
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/crypto/demo-pair
 * Returns reproducible Alice & Bob cryptographic identities and proves that both derive identical addresses.
 */
router.get('/demo-pair', (req, res, next) => {
  try {
    const demo = bip47Service.createDemoPair();
    res.json({
      success: true,
      description: 'Deterministic Alice (Receiver) & Bob (Sender) test vector pair with cryptographic parity proof.',
      ...demo
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
