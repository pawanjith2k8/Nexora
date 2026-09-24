const express = require('express');
const router = express.Router();
const { privacyGuard } = require('../middleware/privacyGuard');
const mempoolService = require('../services/mempool.service');

router.use(privacyGuard({ blockXpub: true }));

/**
 * GET /api/btc/address/:address/utxos
 * Fetches UTXOs for a testnet Bitcoin address.
 */
router.get('/address/:address/utxos', async (req, res, next) => {
  try {
    const { address } = req.params;
    if (!address) {
      return res.status(400).json({ success: false, error: 'Address parameter is required' });
    }

    const utxos = await mempoolService.getAddressUtxos(address);
    res.json({
      success: true,
      address,
      utxoCount: utxos.length,
      utxos
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/btc/address/:address/txs
 * Fetches recent transactions for a testnet Bitcoin address.
 */
router.get('/address/:address/txs', async (req, res, next) => {
  try {
    const { address } = req.params;
    const txs = await mempoolService.getAddressTransactions(address);
    res.json({
      success: true,
      address,
      txCount: txs.length,
      txs
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/btc/tx/:txid
 * Fetches transaction details.
 */
router.get('/tx/:txid', async (req, res, next) => {
  try {
    const { txid } = req.params;
    const tx = await mempoolService.getTransaction(txid);
    res.json({
      success: true,
      tx
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/btc/fees
 * Returns recommended testnet fee rates (sat/vB).
 */
router.get('/fees', async (req, res, next) => {
  try {
    const fees = await mempoolService.getRecommendedFees();
    res.json({
      success: true,
      fees
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/btc/broadcast
 * Broadcasts a signed raw transaction to the Bitcoin testnet.
 */
router.post('/broadcast', async (req, res, next) => {
  try {
    const { rawTx } = req.body;
    if (!rawTx || typeof rawTx !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid rawTx hex string is required.' });
    }

    const result = await mempoolService.broadcastTx(rawTx.trim());
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
