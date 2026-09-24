const express = require('express');
const router = express.Router();
const { privacyGuard } = require('../middleware/privacyGuard');
const nostrService = require('../services/nostr.service');
const config = require('../config');

router.use(privacyGuard({ blockXpub: true }));

/**
 * GET /api/nostr/relays
 * Returns default Nostr relays and checks their live websocket availability.
 */
router.get('/relays', async (req, res, next) => {
  try {
    const health = await nostrService.checkRelays();
    res.json({
      success: true,
      defaultRelays: config.NOSTR_RELAYS,
      health
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/nostr/resolve/:npub
 * Resolves an npub (or hex pubkey) to their published BIP47 Payment Code across public relays.
 */
router.get('/resolve/:npub', async (req, res, next) => {
  try {
    const { npub } = req.params;
    const result = await nostrService.resolvePaymentCode(npub);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/nostr/template/payment-code
 * Generates an unsigned Nostr event template (kind 30078) to publish a BIP47 Payment Code.
 * The client signs this locally using NIP-07 extension or local nsec.
 */
router.post('/template/payment-code', (req, res, next) => {
  try {
    const { pubkeyHex, paymentCode } = req.body;
    if (!pubkeyHex || !paymentCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'Both pubkeyHex and paymentCode are required.'
      });
    }

    const template = nostrService.createPaymentCodeEventTemplate(pubkeyHex, paymentCode);
    res.json({
      success: true,
      template,
      instructions: 'Sign this event using your Nostr private key (or NIP-07 browser extension) and publish to relays.'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/nostr/template/nip17-handshake
 * Generates a blueprint for the one-time NIP-17 private handshake DM.
 */
router.post('/template/nip17-handshake', (req, res, next) => {
  try {
    const { senderPubkeyHex, receiverPubkeyHex, senderPaymentCode } = req.body;
    if (!senderPubkeyHex || !receiverPubkeyHex || !senderPaymentCode) {
      return res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'senderPubkeyHex, receiverPubkeyHex, and senderPaymentCode are required.'
      });
    }

    const handshake = nostrService.createNip17HandshakeTemplate({
      senderPubkeyHex,
      receiverPubkeyHex,
      senderPaymentCode
    });

    res.json({
      success: true,
      handshake
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/nostr/verify-event
 * Verifies the Schnorr signature of a Nostr event.
 */
router.post('/verify-event', (req, res, next) => {
  try {
    const { event } = req.body;
    if (!event || typeof event !== 'object') {
      return res.status(400).json({ success: false, error: 'Event object is required.' });
    }

    const isValid = nostrService.verifyEvent(event);
    res.json({
      success: true,
      isValid,
      eventId: event.id,
      pubkey: event.pubkey,
      kind: event.kind
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
