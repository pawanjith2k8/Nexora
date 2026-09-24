/**
 * Privacy Auditor Service
 * Evaluates UTXOs and simulated transaction graphs for on-chain privacy leaks:
 * 1. Address Reuse
 * 2. Common-Input-Ownership Risk (CIOH)
 * 3. Dust Attacks (unsolicited tracking probes)
 * 4. Address-Type Mixing (Legacy vs SegWit vs Taproot)
 * 
 * Computes a standardized 0-100 Privacy Score with actionable security flags.
 */

const DUST_THRESHOLD_SATS = 1000; // Anything <= 1000 sats is flagged (546 is standard dust limit)

function detectAddressType(address) {
  if (!address || typeof address !== 'string') return 'unknown';
  if (address.startsWith('bc1p') || address.startsWith('tb1p')) return 'taproot_p2tr';
  if (address.startsWith('bc1q') || address.startsWith('tb1q')) return 'segwit_p2wpkh';
  if (address.startsWith('3') || address.startsWith('2')) return 'nested_segwit_p2sh';
  if (address.startsWith('1') || address.startsWith('m') || address.startsWith('n')) return 'legacy_p2pkh';
  return 'unknown';
}

function auditWallet({ utxos = [], transactions = [] }) {
  const flags = [];
  let score = 100;

  // --- 1. Address Reuse Detection ---
  const addressCounts = {};
  for (const utxo of utxos) {
    addressCounts[utxo.address] = (addressCounts[utxo.address] || 0) + 1;
  }
  for (const tx of transactions) {
    if (tx.vout) {
      for (const out of tx.vout) {
        if (out.scriptpubkey_address) {
          addressCounts[out.scriptpubkey_address] = (addressCounts[out.scriptpubkey_address] || 0) + 1;
        }
      }
    }
  }

  const reusedAddresses = Object.entries(addressCounts)
    .filter(([_, count]) => count > 1)
    .map(([addr, count]) => ({ address: addr, occurrences: count }));

  if (reusedAddresses.length > 0) {
    const totalExtraDeposits = reusedAddresses.reduce((acc, r) => acc + (r.occurrences - 1), 0);
    const penalty = Math.min(45, 20 + totalExtraDeposits * 10);
    score -= penalty;
    flags.push({
      type: 'ADDRESS_REUSE',
      severity: 'CRITICAL',
      penalty,
      title: 'Address Reuse Detected',
      details: `${reusedAddresses.length} address(es) have been used across multiple deposits or UTXOs (${totalExtraDeposits} duplicate uses).`,
      evidence: reusedAddresses,
      chainAnalysisRisk: 'Chain surveillance firms (Chainalysis, Elliptic) automatically cluster all transactions to identical addresses into a single identity profile.'
    });
  }

  // --- 2. Dust Deposit Detection ---
  const dustUtxos = utxos.filter(u => (u.value || u.amountSats || 0) <= DUST_THRESHOLD_SATS);
  if (dustUtxos.length > 0) {
    const penalty = Math.min(25, dustUtxos.length * 15);
    score -= penalty;
    flags.push({
      type: 'DUST_ATTACK',
      severity: 'HIGH',
      penalty,
      title: 'Dust Attack Deposits Detected',
      details: `Found ${dustUtxos.length} tiny incoming output(s) <= ${DUST_THRESHOLD_SATS} sats.`,
      evidence: dustUtxos.map(u => ({ txid: u.txid, vout: u.vout, valueSats: u.value || u.amountSats, address: u.address })),
      chainAnalysisRisk: 'Adversaries send tiny unsolicited amounts to tag your wallet. When your wallet consolidates this dust with other UTXOs, it links your entire coin history.'
    });
  }

  // --- 3. Address-Type Mixing Detection ---
  const observedTypes = new Set();
  utxos.forEach(u => observedTypes.add(detectAddressType(u.address)));
  const distinctTypes = Array.from(observedTypes).filter(t => t !== 'unknown');

  if (distinctTypes.length > 1) {
    const penalty = 15;
    score -= penalty;
    flags.push({
      type: 'ADDRESS_TYPE_MIXING',
      severity: 'MEDIUM',
      penalty,
      title: 'Address Script-Type Mixing',
      details: `Wallet contains UTXOs with multiple script types: ${distinctTypes.join(', ')}.`,
      evidence: { scriptTypes: distinctTypes },
      chainAnalysisRisk: 'Mixing Legacy, SegWit, and Taproot scripts creates unique fingerprint signatures, allowing heuristics to identify wallet software and distinguish change outputs.'
    });
  }

  // --- 4. Common Input Ownership Risk (CIOH) ---
  // Flagged if past transactions or pending spend combines multiple distinct previous addresses as inputs
  const multiInputSpends = transactions.filter(tx => {
    if (!tx.vin || tx.vin.length <= 1) return false;
    const inputAddresses = new Set();
    tx.vin.forEach(v => {
      const addr = v.prevout?.scriptpubkey_address || v.address || v.scriptpubkey_address;
      if (addr) inputAddresses.add(addr);
    });
    return inputAddresses.size > 1;
  });

  if (multiInputSpends.length > 0) {
    const penalty = 20;
    score -= penalty;
    flags.push({
      type: 'COMMON_INPUT_OWNERSHIP',
      severity: 'HIGH',
      penalty,
      title: 'Common-Input-Ownership Heuristic (CIOH) Risk',
      details: `${multiInputSpends.length} past transaction(s) combined coins from different addresses. Under CIOH, observers cluster them as belonging to the same entity.`,
      evidence: {
        multiInputSpendCount: multiInputSpends.length
      },
      chainAnalysisRisk: 'The Common-Input-Ownership Heuristic assumes that all inputs in a multi-input transaction belong to the same wallet owner.'
    });
  }

  // Final score clamping
  score = Math.max(0, Math.min(100, score));

  let grade = 'EXCELLENT';
  if (score < 40) grade = 'CRITICAL LEAK';
  else if (score < 60) grade = 'POOR PRIVACY';
  else if (score < 80) grade = 'MODERATE';
  else if (score < 95) grade = 'GOOD';

  return {
    score,
    grade,
    isPristine: score >= 95,
    summary: {
      totalUtxos: utxos.length,
      reusedAddressCount: reusedAddresses.length,
      dustCount: dustUtxos.length,
      scriptTypesFound: distinctTypes,
      ciohVulnerable: multiInputSpends.length > 0
    },
    flags,
    analyzedAt: new Date().toISOString()
  };
}

module.exports = {
  auditWallet,
  detectAddressType,
  DUST_THRESHOLD_SATS
};
