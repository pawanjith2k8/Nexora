/**
 * Silent Ledger — Client-side Privacy Auditor
 * Reproduces backend/src/services/privacyAuditor.service.js logic exactly,
 * adapted for public blockchain data fetched via BTC endpoints.
 * Analysis stays entirely in the browser.
 */

import type { PrivacyFlag, AuditResult, AuditSummary } from "./types";

export const DUST_THRESHOLD_SATS = 1000;

export function detectAddressType(address: string | undefined | null): string {
  if (!address || typeof address !== "string") return "unknown";
  if (address.startsWith("bc1p") || address.startsWith("tb1p")) return "taproot_p2tr";
  if (address.startsWith("bc1q") || address.startsWith("tb1q")) return "segwit_p2wpkh";
  if (address.startsWith("3") || address.startsWith("2")) return "nested_segwit_p2sh";
  if (address.startsWith("1") || address.startsWith("m") || address.startsWith("n")) return "legacy_p2pkh";
  return "unknown";
}

type UtxoInput = {
  txid: string;
  vout: number;
  // backend scenarios use value, mempool uses value; both handled
  value?: number;
  amountSats?: number;
  address?: string;
  [key: string]: unknown;
};

type TxInput = {
  txid?: string;
  vin?: Array<{
    prevout?: { scriptpubkey_address?: string; scriptpubkey?: string; value?: number };
    address?: string;
    scriptpubkey_address?: string;
    [key: string]: unknown;
  }>;
  vout?: Array<{
    scriptpubkey_address?: string;
    scriptpubkey?: string;
    value?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

/**
 * Audit wallet — identical scoring to backend.
 * Accepts public UTXOs + transactions fetched for an address.
 * Does NOT require xpub/seed/private data.
 * If address is missing on a UTXO (mempool UTXO shape), caller should have normalized it.
 */
export function auditWallet(params: {
  utxos: UtxoInput[];
  transactions: TxInput[];
  queriedAddress?: string;
}): AuditResult {
  const { utxos = [], transactions = [], queriedAddress } = params;

  // Normalize UTXOs: ensure address field exists for analysis, infer from queriedAddress if needed
  const normalizedUtxos = utxos.map((u) => ({
    ...u,
    address: (u.address as string) || queriedAddress || "unknown",
    value: (u.value as number) ?? (u.amountSats as number) ?? 0,
  }));

  const flags: PrivacyFlag[] = [];
  let score = 100;

  // --- 1. Address Reuse Detection ---
  const addressCounts: Record<string, number> = {};
  for (const utxo of normalizedUtxos) {
    const addr = (utxo.address as string) || "unknown";
    addressCounts[addr] = (addressCounts[addr] || 0) + 1;
  }
  for (const tx of transactions) {
    const vout = (tx as { vout?: Array<{ scriptpubkey_address?: string }> }).vout;
    if (vout) {
      for (const out of vout) {
        if (out.scriptpubkey_address) {
          addressCounts[out.scriptpubkey_address] = (addressCounts[out.scriptpubkey_address] || 0) + 1;
        }
      }
    }
  }

  const reusedAddresses = Object.entries(addressCounts)
    .filter(([, count]) => count > 1)
    .map(([addr, count]) => ({ address: addr, occurrences: count as number }));

  if (reusedAddresses.length > 0) {
    const totalExtraDeposits = reusedAddresses.reduce((acc, r) => acc + (r.occurrences - 1), 0);
    const penalty = Math.min(45, 20 + totalExtraDeposits * 10);
    score -= penalty;
    flags.push({
      type: "ADDRESS_REUSE",
      severity: "CRITICAL",
      penalty,
      title: "Address Reuse Detected",
      details: `${reusedAddresses.length} address(es) have been used across multiple deposits or UTXOs (${totalExtraDeposits} duplicate uses).`,
      evidence: reusedAddresses,
      chainAnalysisRisk:
        "Chain surveillance firms (Chainalysis, Elliptic) automatically cluster all transactions to identical addresses into a single identity profile.",
    });
  }

  // --- 2. Dust Deposit Detection ---
  const dustUtxos = normalizedUtxos.filter((u) => {
    const v = ((u as unknown as { value?: number }).value ?? (u as unknown as { amountSats?: number }).amountSats ?? 0) as number;
    return v <= DUST_THRESHOLD_SATS;
  });
  if (dustUtxos.length > 0) {
    const penalty = Math.min(25, dustUtxos.length * 15);
    score -= penalty;
    flags.push({
      type: "DUST_ATTACK",
      severity: "HIGH",
      penalty,
      title: "Dust Attack Deposits Detected",
      details: `Found ${dustUtxos.length} tiny incoming output(s) <= ${DUST_THRESHOLD_SATS} sats.`,
      evidence: dustUtxos.map((u) => ({
        txid: (u as { txid: string }).txid,
        vout: (u as { vout: number }).vout,
        valueSats: ((u as unknown as { value?: number }).value ?? (u as unknown as { amountSats?: number }).amountSats) as number,
        address: (u as { address: string }).address,
      })),
      chainAnalysisRisk:
        "Adversaries send tiny unsolicited amounts to tag your wallet. When your wallet consolidates this dust with other UTXOs, it links your entire coin history.",
    });
  }

  // --- 3. Address-Type Mixing Detection ---
  const observedTypes = new Set<string>();
  normalizedUtxos.forEach((u) => observedTypes.add(detectAddressType((u as { address: string }).address)));
  const distinctTypes = Array.from(observedTypes).filter((t) => t !== "unknown");

  if (distinctTypes.length > 1) {
    const penalty = 15;
    score -= penalty;
    flags.push({
      type: "ADDRESS_TYPE_MIXING",
      severity: "MEDIUM",
      penalty,
      title: "Address Script-Type Mixing",
      details: `Wallet contains UTXOs with multiple script types: ${distinctTypes.join(", ")}.`,
      evidence: { scriptTypes: distinctTypes },
      chainAnalysisRisk:
        "Mixing Legacy, SegWit, and Taproot scripts creates unique fingerprint signatures, allowing heuristics to identify wallet software and distinguish change outputs.",
    });
  }

  // --- 4. Common Input Ownership Risk (CIOH) ---
  const multiInputSpends = transactions.filter((tx) => {
    const vin = (tx as { vin?: unknown[] }).vin;
    if (!vin || vin.length <= 1) return false;
    const inputAddresses = new Set<string>();
    for (const v of vin as Array<Record<string, unknown>>) {
      const addr =
        (v.prevout as { scriptpubkey_address?: string } | undefined)?.scriptpubkey_address ||
        (v as { address?: string }).address ||
        (v as { scriptpubkey_address?: string }).scriptpubkey_address;
      if (addr) inputAddresses.add(addr as string);
    }
    return inputAddresses.size > 1;
  });

  if (multiInputSpends.length > 0) {
    const penalty = 20;
    score -= penalty;
    flags.push({
      type: "COMMON_INPUT_OWNERSHIP",
      severity: "HIGH",
      penalty,
      title: "Common-Input-Ownership Heuristic (CIOH) Risk",
      details: `${multiInputSpends.length} past transaction(s) combined coins from different addresses. Under CIOH, observers cluster them as belonging to the same entity.`,
      evidence: {
        multiInputSpendCount: multiInputSpends.length,
      },
      chainAnalysisRisk:
        "The Common-Input-Ownership Heuristic assumes that all inputs in a multi-input transaction belong to the same wallet owner.",
    });
  }

  score = Math.max(0, Math.min(100, score));

  let grade = "EXCELLENT";
  if (score < 40) grade = "CRITICAL LEAK";
  else if (score < 60) grade = "POOR PRIVACY";
  else if (score < 80) grade = "MODERATE";
  else if (score < 95) grade = "GOOD";

  const summary: AuditSummary = {
    totalUtxos: normalizedUtxos.length,
    reusedAddressCount: reusedAddresses.length,
    dustCount: dustUtxos.length,
    scriptTypesFound: distinctTypes,
    ciohVulnerable: multiInputSpends.length > 0,
  };

  return {
    score,
    grade,
    isPristine: score >= 95,
    summary,
    flags,
    analyzedAt: new Date().toISOString(),
  };
}

export function getMitigation(flagType: string): string {
  switch (flagType) {
    case "ADDRESS_REUSE":
      return "Use a fresh address for each incoming payment. With Silent Ledger, share your BIP47 payment code instead of a static address — ECDH derives a unique one-time address per payment.";
    case "DUST_ATTACK":
      return "Do not spend dust outputs. Mark them as frozen / do-not-spend in your wallet’s coin control. Future receives should use fresh Silent Ledger addresses.";
    case "ADDRESS_TYPE_MIXING":
      return "Standardize on one script type (e.g., Native SegWit P2WPKH tb1q... or Taproot P2TR tb1p...). Avoid mixing legacy and modern scripts in the same wallet view.";
    case "COMMON_INPUT_OWNERSHIP":
      return "Avoid combining UTXOs from different sources in a single transaction. Use coin control or privacy-preserving techniques; Silent Ledger’s one-time addresses reduce linkage but coin selection still matters.";
    default:
      return "Review wallet coin selection and address management. Prefer single-UTXO spends and fresh receiving addresses.";
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return "border-red-200 bg-red-50 text-red-800";
    case "HIGH":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "MEDIUM":
      return "border-amber-100 bg-amber-50 text-amber-800";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-700";
  }
}
