const config = require('../config');

// In-memory cache for API requests (15s TTL)
const cache = new Map();

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data, ttlSeconds = 15) {
  cache.set(key, {
    data,
    expires: Date.now() + ttlSeconds * 1000
  });
}

/**
 * Fetches UTXOs for a given Bitcoin address from mempool.space testnet.
 */
async function getAddressUtxos(address) {
  const cacheKey = `utxos:${address}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${config.MEMPOOL_API_BASE}/address/${address}/utxo`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      throw new Error(`Mempool API returned HTTP ${res.status}: ${res.statusText}`);
    }
    const utxos = await res.json();
    setCache(cacheKey, utxos, 15);
    return utxos;
  } catch (err) {
    console.warn(`[Mempool] Failed to fetch UTXOs for ${address}:`, err.message);
    // Return empty list instead of crashing, or simulate
    return [];
  }
}

/**
 * Fetches transaction history for an address.
 */
async function getAddressTransactions(address) {
  const cacheKey = `txs:${address}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${config.MEMPOOL_API_BASE}/address/${address}/txs`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      throw new Error(`Mempool API returned HTTP ${res.status}: ${res.statusText}`);
    }
    const txs = await res.json();
    setCache(cacheKey, txs, 20);
    return txs;
  } catch (err) {
    console.warn(`[Mempool] Failed to fetch TXs for ${address}:`, err.message);
    return [];
  }
}

/**
 * Fetches specific transaction by txid.
 */
async function getTransaction(txid) {
  const cacheKey = `tx:${txid}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${config.MEMPOOL_API_BASE}/tx/${txid}`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      throw new Error(`Mempool API returned HTTP ${res.status}`);
    }
    const tx = await res.json();
    setCache(cacheKey, tx, 60);
    return tx;
  } catch (err) {
    throw new Error(`Transaction ${txid} not found on mempool testnet: ${err.message}`);
  }
}

/**
 * Recommended fee estimates (sat/vB).
 */
async function getRecommendedFees() {
  const cacheKey = 'fees:recommended';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${config.MEMPOOL_API_BASE}/v1/fees/recommended`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fees = await res.json();
    setCache(cacheKey, fees, 60);
    return fees;
  } catch (err) {
    // Return standard testnet defaults if offline
    return {
      fastestFee: 15,
      halfHourFee: 10,
      hourFee: 5,
      minimumFee: 1
    };
  }
}

/**
 * Broadcasts a raw signed hex transaction to Bitcoin testnet.
 */
async function broadcastTx(rawTxHex) {
  const url = `${config.MEMPOOL_API_BASE}/tx`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: rawTxHex
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Broadcast failed (${res.status}): ${errText}`);
  }

  const txid = await res.text();
  return { success: true, txid };
}

module.exports = {
  getAddressUtxos,
  getAddressTransactions,
  getTransaction,
  getRecommendedFees,
  broadcastTx
};
