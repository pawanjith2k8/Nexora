const express = require('express');
const router = express.Router();
const { privacyGuard } = require('../middleware/privacyGuard');
const { isDbConnected, getDbState } = require('../services/db.service');
const Contact = require('../models/Contact');
const HandshakeChannel = require('../models/HandshakeChannel');
const AuditRecord = require('../models/AuditRecord');

// Enforce Zero-Knowledge Guard on all database operations
router.use(privacyGuard({ blockXpub: true }));

/**
 * GET /api/db/status
 * Returns database connection status and collection statistics.
 */
router.get('/status', async (req, res) => {
  const state = getDbState();

  if (!state.connected) {
    return res.json({
      success: true,
      ...state,
      counts: null,
      message: state.hasPlaceholder 
        ? 'MongoDB configured with placeholder <db_username>. Please set DB_USERNAME or update MONGODB_URI in your .env file.'
        : 'MongoDB is currently disconnected. In-memory mode is active.'
    });
  }

  try {
    const [contactCount, channelCount, auditCount] = await Promise.all([
      Contact.countDocuments(),
      HandshakeChannel.countDocuments(),
      AuditRecord.countDocuments()
    ]);

    res.json({
      success: true,
      ...state,
      counts: {
        contacts: contactCount,
        channels: channelCount,
        audits: auditCount
      }
    });
  } catch (err) {
    res.json({
      success: true,
      ...state,
      error: err.message
    });
  }
});

// -------------------------------------------------------------
// Contacts API (Nostr Identity -> BIP47 Payment Code mapping)
// -------------------------------------------------------------

router.get('/contacts', async (req, res, next) => {
  if (!isDbConnected()) {
    return res.status(503).json({
      success: false,
      error: 'DATABASE_DISCONNECTED',
      message: 'MongoDB is not connected. Update DB_USERNAME or MONGODB_URI in .env.'
    });
  }

  try {
    const contacts = await Contact.find().sort({ updatedAt: -1 });
    res.json({ success: true, count: contacts.length, contacts });
  } catch (err) {
    next(err);
  }
});

router.post('/contacts', async (req, res, next) => {
  if (!isDbConnected()) {
    return res.status(503).json({
      success: false,
      error: 'DATABASE_DISCONNECTED',
      message: 'MongoDB is not connected.'
    });
  }

  try {
    const { npub, hexPubkey, paymentCode, alias, notes, relaySource } = req.body;
    if (!npub || !paymentCode) {
      return res.status(400).json({ success: false, error: 'Both npub and paymentCode are required.' });
    }

    const contact = await Contact.findOneAndUpdate(
      { npub },
      {
        npub,
        hexPubkey: hexPubkey || '',
        paymentCode,
        alias: alias || 'Anonymous Contact',
        notes: notes || '',
        relaySource: relaySource || 'public-relay'
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, contact });
  } catch (err) {
    next(err);
  }
});

router.get('/contacts/:npub', async (req, res, next) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, error: 'DATABASE_DISCONNECTED' });

  try {
    const contact = await Contact.findOne({ npub: req.params.npub });
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });
    res.json({ success: true, contact });
  } catch (err) {
    next(err);
  }
});

router.delete('/contacts/:npub', async (req, res, next) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, error: 'DATABASE_DISCONNECTED' });

  try {
    await Contact.deleteOne({ npub: req.params.npub });
    res.json({ success: true, message: `Contact ${req.params.npub} deleted.` });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Handshake Channels API
// -------------------------------------------------------------

router.get('/channels', async (req, res, next) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, error: 'DATABASE_DISCONNECTED' });

  try {
    const channels = await HandshakeChannel.find().sort({ updatedAt: -1 });
    res.json({ success: true, count: channels.length, channels });
  } catch (err) {
    next(err);
  }
});

router.post('/channels', async (req, res, next) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, error: 'DATABASE_DISCONNECTED' });

  try {
    const {
      channelId,
      senderNpub,
      receiverNpub,
      senderPaymentCode,
      receiverPaymentCode,
      derivedAddresses = []
    } = req.body;

    if (!channelId || !senderNpub || !receiverNpub) {
      return res.status(400).json({ success: false, error: 'channelId, senderNpub, and receiverNpub are required.' });
    }

    const channel = await HandshakeChannel.findOneAndUpdate(
      { channelId },
      {
        channelId,
        senderNpub,
        receiverNpub,
        senderPaymentCode,
        receiverPaymentCode,
        derivedAddresses,
        lastDerivedIndex: derivedAddresses.length > 0 ? derivedAddresses.length - 1 : 0
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, channel });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------
// Zero-Knowledge Audit History API
// -------------------------------------------------------------

router.get('/audits', async (req, res, next) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, error: 'DATABASE_DISCONNECTED' });

  try {
    const audits = await AuditRecord.find().sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, count: audits.length, audits });
  } catch (err) {
    next(err);
  }
});

router.post('/audits', async (req, res, next) => {
  if (!isDbConnected()) return res.status(503).json({ success: false, error: 'DATABASE_DISCONNECTED' });

  try {
    const { walletTag, score, grade, flags, summary, aiCoachAnalysis, aiProvider } = req.body;

    if (score === undefined || score === null) {
      return res.status(400).json({ success: false, error: 'score is required.' });
    }

    const audit = await AuditRecord.create({
      walletTag: walletTag || 'Demo Wallet',
      score,
      grade: grade || 'MODERATE',
      flags: flags || [],
      summary: summary || {},
      aiCoachAnalysis: aiCoachAnalysis || '',
      aiProvider: aiProvider || 'silent-ledger-tutor-engine'
    });

    res.json({ success: true, audit });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
