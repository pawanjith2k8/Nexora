"use client";

import { useEffect, useState } from "react";
import { ApiError, getBtcUtxos, getBtcTxs, getBtcTx } from "@/lib/api";
import type { BtcUtxo, AuditResult } from "@/lib/types";
import { detectAddressType } from "@/lib/privacyAuditor";
import { useToast } from "@/components/ui/toast";

type FetchState = "idle" | "loading" | "success" | "error";

type TxSummary = {
  txid: string;
  version?: number;
  vin?: Array<Record<string, unknown>>;
  vout?: Array<Record<string, unknown>>;
  fee?: number;
  status?: {
    confirmed?: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  [key: string]: unknown;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const { showToast } = useToast();
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard", "success");
    } catch {
      showToast("Copy failed", "error");
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
    >
      {label}
    </button>
  );
}

function isValidTestnetAddress(address: string): boolean {
  const a = address.trim();
  if (!a) return false;
  return (
    a.startsWith("tb1q") ||
    a.startsWith("tb1p") ||
    a.startsWith("bc1q") ||
    a.startsWith("bc1p") ||
    a.startsWith("m") ||
    a.startsWith("n") ||
    a.startsWith("2") ||
    a.startsWith("3") ||
    a.startsWith("1")
  );
}

function formatTime(blockTime?: number): string {
  if (!blockTime) return "—";
  try {
    return new Date(blockTime * 1000).toLocaleString();
  } catch {
    return String(blockTime);
  }
}

function getTxidDisplay(txid: string): string {
  return txid.length > 16 ? `${txid.slice(0, 8)}...${txid.slice(-8)}` : txid;
}

export default function ActivityPage() {
  const { showToast } = useToast();
  const [address, setAddress] = useState("");
  const [queriedAddress, setQueriedAddress] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [utxos, setUtxos] = useState<BtcUtxo[]>([]);
  const [txs, setTxs] = useState<TxSummary[]>([]);
  const [selectedTxid, setSelectedTxid] = useState<string | null>(null);
  const [txDetail, setTxDetail] = useState<unknown | null>(null);
  const [txDetailState, setTxDetailState] = useState<FetchState>("idle");
  const [txDetailError, setTxDetailError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);

  // Load last audit context for display only (non-sensitive, reuse privacy auditor result)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("sl:lastAudit");
      if (raw) {
        const parsed = JSON.parse(raw) as AuditResult;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed && typeof parsed.score === "number") setAudit(parsed);
      }
      const lastAddr = sessionStorage.getItem("sl:lastPrivacyAddress");
      if (lastAddr && !address) setAddress(lastAddr);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLoadActivity() {
    const addr = address.trim();
    if (!addr) {
      setError("Enter a Bitcoin Testnet address.");
      return;
    }
    if (!isValidTestnetAddress(addr)) {
      setError("Address does not look like a valid Bitcoin address. Use a testnet address (tb1q..., tb1p..., m..., n..., 2...).");
      return;
    }

    setError(null);
    setQueriedAddress(addr);
    setFetchState("loading");
    setUtxos([]);
    setTxs([]);
    setSelectedTxid(null);
    setTxDetail(null);
    setTxDetailError(null);
    setTxDetailState("idle");

    try {
      // Only the public address leaves the browser — two public proxy calls
      const [utxoRes, txRes] = await Promise.all([getBtcUtxos(addr), getBtcTxs(addr)]);

      if (!utxoRes || !Array.isArray(utxoRes.utxos) || !txRes || !Array.isArray(txRes.txs)) {
        throw new Error("Malformed response from backend.");
      }

      // Persist queried address for convenience (public only, no secrets)
      try {
        sessionStorage.setItem("sl:lastPrivacyAddress", addr);
      } catch {}

      setUtxos(utxoRes.utxos as BtcUtxo[]);
      setTxs((txRes.txs as TxSummary[]).slice(0, 25)); // cap display, still real data
      setFetchState("success");
      if (utxoRes.utxos.length === 0 && (txRes.txs as unknown[]).length === 0) {
        showToast("No activity found for this address on Bitcoin Testnet.", "info");
      } else {
        showToast(`Loaded ${utxoRes.utxos.length} UTXO(s) and ${txRes.txs.length} transaction(s) from testnet.`, "success");
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Failed to load activity";
      const isOffline = e instanceof ApiError && e.status === 0;
      setError(isOffline ? `Backend unavailable: ${msg}. Check NEXT_PUBLIC_API_URL.` : msg);
      setFetchState("error");
      showToast(msg, "error");
    }
  }

  async function handleTxSelect(txid: string) {
    setSelectedTxid(txid);
    setTxDetail(null);
    setTxDetailError(null);
    setTxDetailState("loading");
    try {
      const res = await getBtcTx(txid);
      if (!res || !res.tx) throw new Error("Transaction not found");
      setTxDetail(res.tx);
      setTxDetailState("success");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Transaction not found";
      // Backend throws "Transaction ... not found on mempool testnet" for 404 — surface as not found
      const isNotFound = msg.toLowerCase().includes("not found");
      setTxDetailError(isNotFound ? `Transaction ${txid.slice(0, 12)}... not found on Bitcoin Testnet.` : msg);
      setTxDetailState("error");
    }
  }

  const totalBalance = utxos.reduce((acc, u) => acc + (u.value ?? 0), 0);

  return (
    <div className="space-y-8">
      <section aria-labelledby="activity-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 id="activity-heading" className="text-xl font-semibold text-zinc-900">
              Activity — Bitcoin Testnet History
            </h1>
            <p className="mt-2 max-w-prose text-sm text-zinc-600">
              View public transaction history and UTXOs for any Bitcoin Testnet address. Data is fetched from the backend
              mempool proxy (<code className="rounded bg-zinc-100 px-1">/api/btc/address/:address/txs</code> &amp;{" "}
              <code className="rounded bg-zinc-100 px-1">/utxos</code>) and rendered directly — no fake activity is
              created.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
            Bitcoin Testnet — Public Data
          </span>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Only the public address you enter is sent to the backend. Raw activity is not stored or sent to AI Coach.
        </p>
      </section>

      {/* Audit context — reuse, not recalculation */}
      {audit && (
        <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Privacy context (from Privacy page)</h2>
          <p className="mt-1 text-sm text-zinc-700">
            Score {audit.score}/100 — {audit.grade} • {audit.flags.length ? audit.flags.map((f) => f.type).join(", ") : "No flags"} •{" "}
            <span className="text-xs text-zinc-500">Analyzed locally at {new Date(audit.analyzedAt).toLocaleString()}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Displayed as context only — not recalculated here. Run a new analysis on the Privacy page to update.
          </p>
        </section>
      )}

      <Section
        title="Public Address Input"
        description="Enter a Bitcoin Testnet address to load real history. P2WPKH (tb1q...), P2TR (tb1p...), legacy (m/n/2) all supported. Nothing is persisted except the address you last queried (public, for convenience)."
      >
        <div className="space-y-2">
          <label htmlFor="activity-address" className="block text-sm font-medium text-zinc-700">
            Bitcoin Testnet address (public)
          </label>
          <input
            id="activity-address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="tb1q... / tb1p... / m... / n... / 2..."
            className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleLoadActivity}
              disabled={fetchState === "loading"}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {fetchState === "loading" ? "Loading..." : "Load activity"}
            </button>
            {queriedAddress && <span className="self-center text-xs text-zinc-500">Last queried: {queriedAddress}</span>}
          </div>
        </div>

        {fetchState === "idle" && !queriedAddress && !error && (
          <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm font-medium text-zinc-700">No address entered</p>
            <p className="mt-1 text-sm text-zinc-600">
              Enter a Bitcoin Testnet address above to view its public UTXOs and recent transactions.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              This is public blockchain data — no private keys, xpubs, or seeds are needed. Use an address you own on
              testnet or any public testnet address.
            </p>
          </div>
        )}

        {fetchState === "loading" && (
          <div className="space-y-1">
            <p className="text-sm text-zinc-500">Loading UTXOs and transactions from Bitcoin Testnet mempool proxy...</p>
            <p className="text-xs text-zinc-500">Only the public address leaves the browser; analysis stays local.</p>
          </div>
        )}

        {fetchState === "error" && error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">Unable to load activity</p>
            <p className="mt-1 text-sm text-red-700">{error}</p>
            <p className="mt-1 text-xs text-zinc-600">Try a different Testnet address or check that the backend is online.</p>
          </div>
        )}
      </Section>

      {/* UTXO + Tx lists — only after success */}
      {fetchState === "success" && queriedAddress && (
        <>
          <Section
            title="UTXO Summary"
            description="Unspent outputs for the queried address, via GET /api/btc/address/:address/utxos. Amounts in sats, status from mempool."
          >
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-zinc-500">Address</dt>
                <dd className="break-all font-mono text-xs text-zinc-800">{queriedAddress}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Type</dt>
                <dd className="text-zinc-700">{detectAddressType(queriedAddress)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">UTXOs</dt>
                <dd className="font-medium text-zinc-800">{utxos.length}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Total balance (UTXO sum)</dt>
                <dd className="font-mono text-zinc-800">{totalBalance.toLocaleString()} sats</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Transactions</dt>
                <dd className="text-zinc-700">{txs.length} fetched</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Network</dt>
                <dd className="text-zinc-700">Bitcoin Testnet</dd>
              </div>
            </dl>

            {utxos.length === 0 ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm text-zinc-600">No UTXOs found.</p>
                <p className="mt-1 text-xs text-zinc-500">
                  This address has no unspent outputs on testnet — it may be unused or all funds were spent.
                </p>
              </div>
            ) : (
              <div className="overflow-auto rounded-md border border-zinc-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">txid</th>
                      <th className="px-3 py-2 font-medium">vout</th>
                      <th className="px-3 py-2 font-medium">value</th>
                      <th className="px-3 py-2 font-medium">status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {utxos.slice(0, 25).map((u) => {
                      const status = u.status as { confirmed?: boolean; block_height?: number; block_time?: number } | undefined;
                      return (
                        <tr key={`${u.txid}:${u.vout}`} className="font-mono">
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleTxSelect(u.txid)}
                              className="text-left hover:underline"
                              title={u.txid}
                            >
                              {getTxidDisplay(u.txid)}
                            </button>
                          </td>
                          <td className="px-3 py-2">{u.vout}</td>
                          <td className="px-3 py-2">{u.value?.toLocaleString()} sats</td>
                          <td className="px-3 py-2 font-sans">
                            {status?.confirmed ? (
                              <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-800">confirmed</span>
                            ) : status ? (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">unconfirmed</span>
                            ) : (
                              <span className="text-zinc-500">—</span>
                            )}
                            {status?.block_height ? <span className="ml-2 text-zinc-500">#{status.block_height}</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {utxos.length > 25 && <p className="border-t px-3 py-2 text-xs text-zinc-500">Showing 25 of {utxos.length} UTXOs.</p>}
              </div>
            )}
          </Section>

          <Section
            title="Transaction History"
            description="Recent transactions via GET /api/btc/address/:address/txs. Select an item to load full details via GET /api/btc/tx/:txid. All fields shown only if present in the API response."
          >
            {txs.length === 0 ? (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm text-zinc-600">No transactions found.</p>
                <p className="mt-1 text-xs text-zinc-500">
                  No activity yet for this address on Bitcoin Testnet. This is the empty state — no fake history is generated.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {txs.map((tx) => {
                  const txid = (tx as { txid: string }).txid || "unknown";
                  const status = (tx as { status?: { confirmed?: boolean; block_time?: number; block_height?: number } }).status;
                  const vin = (tx as { vin?: unknown[] }).vin;
                  const vout = (tx as { vout?: unknown[] }).vout;
                  const fee = (tx as { fee?: number }).fee;
                  const isConfirmed = status?.confirmed;
                  return (
                    <li
                      key={txid}
                      className={`rounded-md border p-4 ${selectedTxid === txid ? "border-zinc-900" : "border-zinc-200 bg-white"}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleTxSelect(txid)}
                          className="break-all text-left font-mono text-xs font-medium text-zinc-900 hover:underline"
                          title={txid}
                        >
                          {getTxidDisplay(txid)}
                        </button>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                            isConfirmed ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"
                          }`}
                        >
                          {isConfirmed ? "confirmed" : "unconfirmed"}
                        </span>
                      </div>
                      <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                        <div>
                          <dt className="text-zinc-500">Block height</dt>
                          <dd className="text-zinc-800">{status?.block_height ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-zinc-500">Time</dt>
                          <dd className="text-zinc-800">{formatTime(status?.block_time)}</dd>
                        </div>
                        <div>
                          <dt className="text-zinc-500">Inputs</dt>
                          <dd className="text-zinc-800">{vin ? vin.length : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-zinc-500">Outputs</dt>
                          <dd className="text-zinc-800">{vout ? vout.length : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-zinc-500">Fee</dt>
                          <dd className="font-mono text-zinc-800">{fee !== undefined ? `${fee.toLocaleString()} sats` : "—"}</dd>
                        </div>
                        <div className="flex items-center gap-2">
                          <CopyButton text={txid} label="Copy txid" />
                          {selectedTxid === txid && <span className="text-xs text-zinc-500">Selected</span>}
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Transaction details */}
            {selectedTxid && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="text-sm font-semibold text-zinc-900">Transaction Details</h3>
                <p className="mt-1 break-all font-mono text-xs text-zinc-600">{selectedTxid}</p>

                {txDetailState === "loading" && <p className="mt-3 text-sm text-zinc-500">Loading transaction details...</p>}
                {txDetailState === "error" && txDetailError && (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-medium text-red-800">{txDetailError.includes("not found") ? "Not found" : "Error"}</p>
                    <p className="mt-1 text-sm text-red-700">{txDetailError}</p>
                    <p className="mt-1 text-xs text-zinc-600">This transaction may not exist on testnet or the backend may be unavailable.</p>
                  </div>
                )}
                {txDetailState === "success" && txDetail != null && (
                  <div className="mt-3 space-y-3">
                    <pre className="max-h-64 overflow-auto rounded bg-white p-3 text-xs font-mono">
                      {JSON.stringify(txDetail, null, 2)}
                    </pre>
                    <p className="text-xs text-zinc-500">
                      Details from <code className="rounded bg-white px-1">GET /api/btc/tx/:txid</code> — public testnet data only.
                    </p>
                  </div>
                )}
                {txDetailState === "idle" && <p className="mt-2 text-xs text-zinc-500">Select a transaction above to load details.</p>}
              </div>
            )}
          </Section>
        </>
      )}

      <p className="text-xs text-zinc-500">
        Demo/testnet note: This page shows only real public data for the address you enter. Simulated demo wallets are
        available on the Privacy page and are explicitly labeled — they are not shown here as if they were your wallet.
      </p>
    </div>
  );
}
