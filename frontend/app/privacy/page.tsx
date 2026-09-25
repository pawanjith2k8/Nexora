"use client";

import { useState } from "react";
import { ApiError, getBtcUtxos, getBtcTxs, getSimulatedWalletClean, getSimulatedWalletBad } from "@/lib/api";
import type { AuditResult } from "@/lib/types";
import { auditWallet, detectAddressType, getMitigation, getSeverityColor } from "@/lib/privacyAuditor";
import { useToast } from "@/components/ui/toast";

type FetchState = "idle" | "fetching" | "analyzing" | "done" | "error";

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

function isValidTestnetAddress(address: string): boolean {
  const a = address.trim();
  if (!a) return false;
  // Basic testnet/mainnet agnostic check — allow common prefixes, backend will validate fully via mempool
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

export default function PrivacyPage() {
  const { showToast } = useToast();
  const [address, setAddress] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [utxos, setUtxos] = useState<unknown[]>([]);
  const [txs, setTxs] = useState<unknown[]>([]);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [queriedAddress, setQueriedAddress] = useState<string>("");

  // Demo
  const [demoAudit, setDemoAudit] = useState<AuditResult | null>(null);
  const [demoLoading, setDemoLoading] = useState<"idle" | "loading" | "error">("idle");
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoType, setDemoType] = useState<"clean" | "bad" | null>(null);

  async function handleAnalyze() {
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
    setAudit(null);
    setUtxos([]);
    setTxs([]);
    setQueriedAddress(addr);
    setFetchState("fetching");

    try {
      // Fetch public blockchain data — only the public address leaves the browser
      const [utxoRes, txRes] = await Promise.all([getBtcUtxos(addr), getBtcTxs(addr)]);

      // Basic validation of response shape
      if (!utxoRes || !Array.isArray(utxoRes.utxos) || !txRes || !Array.isArray(txRes.txs)) {
        throw new Error("Malformed response from backend.");
      }

      setUtxos(utxoRes.utxos);
      setTxs(txRes.txs);
      setFetchState("analyzing");

      // Local analysis — entirely in browser, no xpub/secret sent
      // Normalize UTXOs for auditor if they lack address field (mempool proxy UTXOs have no address)
      const normalizedUtxos = (utxoRes.utxos as Array<Record<string, unknown>>).map((u) => ({
        txid: u.txid as string,
        vout: u.vout as number,
        value: (u.value as number) ?? (u.amountSats as number) ?? 0,
        address: (u.address as string) || addr,
      }));

      const result = auditWallet({
        utxos: normalizedUtxos as never,
        transactions: txs as never,
        queriedAddress: addr,
      });

      setAudit(result);
      // Persist sanitized audit for AI Coach (non-sensitive: score/grade/flags/summary only)
      try {
        sessionStorage.setItem("sl:lastAudit", JSON.stringify(result));
      } catch {}
      setFetchState("done");
      showToast(`Analyzed ${normalizedUtxos.length} UTXO(s) and ${txRes.txs.length} transaction(s) locally.`, "success");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Analysis failed";
      // Distinguish backend unavailable (status 0) vs other
      const isOffline = e instanceof ApiError && e.status === 0;
      setError(isOffline ? `Backend unavailable: ${msg}. Check NEXT_PUBLIC_API_URL.` : msg);
      setFetchState("error");
      showToast(msg, "error");
    }
  }

  async function handleDemo(type: "clean" | "bad") {
    setDemoLoading("loading");
    setDemoError(null);
    setDemoType(type);
    try {
      const res = type === "clean" ? await getSimulatedWalletClean() : await getSimulatedWalletBad();
      setDemoAudit(res.audit);
      setDemoLoading("idle");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Demo load failed";
      setDemoError(msg);
      setDemoLoading("error");
    }
  }

  const totalBalance = (utxos as Array<{ value?: number; amountSats?: number }>).reduce(
    (acc, u) => acc + ((u.value ?? u.amountSats ?? 0) as number),
    0
  );

  return (
    <div className="space-y-8">
      <section aria-labelledby="privacy-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 id="privacy-heading" className="text-xl font-semibold text-zinc-900">
              Privacy — Client-Side Analysis
            </h1>
            <p className="mt-2 max-w-prose text-sm text-zinc-600">
              Analyze the publicly visible activity of a Bitcoin Testnet address. Blockchain data is fetched via the
              backend mempool proxy, but all privacy scoring happens locally in your browser — no xpub, seed, or private
              key ever leaves this device.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
            Bitcoin Testnet
          </span>
        </div>
        <div className="mt-4 rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
          <p className="font-medium text-zinc-700">How analysis works</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>
              You enter a <span className="font-medium">public address</span> (e.g. tb1q...).
            </li>
            <li>
              Frontend fetches public UTXOs + transactions via <code className="rounded bg-zinc-100 px-1">GET /api/btc/address/:address/utxos</code>{" "}
              and <code className="rounded bg-zinc-100 px-1">/txs</code>.
            </li>
            <li>
              Local <code className="rounded bg-zinc-100 px-1">auditWallet</code> (ported from{" "}
              <code className="rounded bg-zinc-100 px-1">backend/src/services/privacyAuditor.service.js</code>) checks
              address reuse, dust (≤1000 sats), script-type mixing, and common-input ownership (CIOH). Score 0–100,
              grade EXCELLENT/GOOD/MODERATE/POOR PRIVACY/CRITICAL LEAK.
            </li>
            <li>
              Findings include severity, why it matters for chain analysis, and what you can do — all rendered here,
              not on the server.
            </li>
          </ol>
        </div>
      </section>

      <Section
        title="Analyze Address"
        description="Only the public Bitcoin address is sent to the backend BTC proxy. Analysis is local."
      >
        <div className="space-y-2">
          <label htmlFor="privacy-address" className="block text-sm font-medium text-zinc-700">
            Bitcoin Testnet address
          </label>
          <input
            id="privacy-address"
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
              onClick={handleAnalyze}
              disabled={fetchState === "fetching" || fetchState === "analyzing"}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {fetchState === "fetching"
                ? "Fetching blockchain data..."
                : fetchState === "analyzing"
                  ? "Analyzing locally..."
                  : "Analyze"}
            </button>
            {queriedAddress && (
              <span className="self-center text-xs text-zinc-500">Last analyzed: {queriedAddress}</span>
            )}
          </div>
        </div>

        {fetchState === "idle" && !audit && !error && (
          <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4">
            <p className="text-sm text-zinc-600">Enter a Bitcoin Testnet address to analyze its publicly visible activity.</p>
            <p className="mt-1 text-xs text-zinc-500">
              Example testnet addresses can be generated via a testnet wallet. No private data is required.
            </p>
          </div>
        )}

        {fetchState === "fetching" && <p className="text-sm text-zinc-500">Fetching UTXOs and transactions from mempool proxy...</p>}
        {fetchState === "analyzing" && <p className="text-sm text-zinc-500">Performing local privacy analysis...</p>}

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">Analysis error</p>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        )}

        {audit && fetchState === "done" && (
          <div className="space-y-4">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Address Summary</h3>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
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
                  <dd className="text-zinc-700">{utxos.length}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Transactions fetched</dt>
                  <dd className="text-zinc-700">{txs.length}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Total balance (sum of UTXOs)</dt>
                  <dd className="font-mono text-zinc-800">{totalBalance.toLocaleString()} sats</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Fetched at</dt>
                  <dd className="text-xs text-zinc-700">{new Date().toLocaleString()}</dd>
                </div>
              </dl>
              {utxos.length === 0 && txs.length === 0 && (
                <p className="mt-3 text-xs text-zinc-500">
                  No UTXOs or transactions found for this address on testnet. It may be unused or on a different
                  network.
                </p>
              )}
            </div>

            <div className="rounded-md border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Privacy Findings — Analysis Performed Locally</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-sm font-medium ${
                    audit.isPristine
                      ? "border-green-200 bg-green-50 text-green-800"
                      : audit.score >= 80
                        ? "border-zinc-200 bg-zinc-50 text-zinc-700"
                        : audit.score >= 60
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  Score {audit.score}/100 — {audit.grade}
                </span>
                <span className="rounded-full bg-zinc-50 px-3 py-1 text-xs text-zinc-700">UTXOs {audit.summary.totalUtxos}</span>
                <span className="rounded-full bg-zinc-50 px-3 py-1 text-xs text-zinc-700">
                  Reused {audit.summary.reusedAddressCount}
                </span>
                <span className="rounded-full bg-zinc-50 px-3 py-1 text-xs text-zinc-700">Dust {audit.summary.dustCount}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Script types found</dt>
                  <dd className="text-zinc-700">
                    {audit.summary.scriptTypesFound.length ? audit.summary.scriptTypesFound.join(", ") : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">CIOH vulnerable</dt>
                  <dd className="text-zinc-700">{audit.summary.ciohVulnerable ? "Yes" : "No"}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-zinc-500">Analyzed at {new Date(audit.analyzedAt).toLocaleString()} • Local only</p>

              {audit.flags.length === 0 ? (
                <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3">
                  <p className="text-sm font-medium text-green-800">No privacy flags detected</p>
                  <p className="mt-1 text-xs text-green-700">
                    No reuse, dust, type mixing, or CIOH clustering was observable from the fetched UTXOs and
                    recent transactions. This does not guarantee anonymity — it only reflects these four heuristics.
                  </p>
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {audit.flags.map((flag, idx) => (
                    <li key={`${flag.type}-${idx}`} className="rounded-md border border-zinc-200 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getSeverityColor(flag.severity)}`}>
                          {flag.severity}
                        </span>
                        <span className="text-sm font-medium text-zinc-900">{flag.title}</span>
                        <span className="text-xs text-zinc-500">−{flag.penalty} pts • {flag.type}</span>
                      </div>
                      <p className="mt-2 text-sm text-zinc-700">{flag.details}</p>
                      {flag.chainAnalysisRisk && (
                        <p className="mt-1 text-xs text-zinc-600">
                          <span className="font-medium">Why this matters:</span> {flag.chainAnalysisRisk}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-zinc-600">
                        <span className="font-medium">What you can do:</span> {getMitigation(flag.type)}
                      </p>
                      {flag.evidence ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-zinc-700">Show evidence</summary>
                          <pre className="mt-2 max-h-40 overflow-auto rounded bg-zinc-50 p-2 text-xs font-mono">
                            {JSON.stringify(flag.evidence, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {utxos.length > 0 && (
              <details className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                  Show raw public blockchain data (UTXOs & transactions)
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-700">UTXOs (public, via mempool proxy)</p>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-white p-2 text-xs font-mono">
                      {JSON.stringify(utxos.slice(0, 10), null, 2)}
                    </pre>
                    {utxos.length > 10 && <p className="text-xs text-zinc-500">Showing 10 of {utxos.length} UTXOs.</p>}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-700">Transactions (public)</p>
                    <pre className="mt-1 max-h-64 overflow-auto rounded bg-white p-2 text-xs font-mono">
                      {JSON.stringify(txs.slice(0, 3), null, 2)}
                    </pre>
                    {txs.length > 3 && <p className="text-xs text-zinc-500">Showing 3 of {txs.length} transactions.</p>}
                  </div>
                </div>
              </details>
            )}
          </div>
        )}
      </Section>

      <Section
        title="Demo Scenarios — Not Your Wallet"
        description="Load simulated data from the backend to see how the auditor behaves. Clearly labeled as demo."
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleDemo("clean")}
            disabled={demoLoading === "loading"}
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Demo: Pristine wallet
          </button>
          <button
            type="button"
            onClick={() => handleDemo("bad")}
            disabled={demoLoading === "loading"}
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Demo: Leaky wallet (4 flags)
          </button>
          <span className="self-center text-xs text-zinc-500">
            From <code className="rounded bg-zinc-100 px-1">GET /api/scenarios/simulated-wallet-...</code>
          </span>
        </div>
        {demoLoading === "loading" && <p className="text-sm text-zinc-500">Loading demo...</p>}
        {demoError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{demoError}</p>
          </div>
        )}
        {demoAudit && demoType && demoLoading !== "loading" && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Demo scenario — {demoType} — not your wallet
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-800">
              Score {demoAudit.score}/100 — {demoAudit.grade} {demoAudit.isPristine ? "✓ pristine" : ""}
            </p>
            <p className="text-xs text-zinc-600">
              UTXOs {demoAudit.summary.totalUtxos} • Reused {demoAudit.summary.reusedAddressCount} • Dust {demoAudit.summary.dustCount} •
              CIOH {demoAudit.summary.ciohVulnerable ? "yes" : "no"}
            </p>
            {demoAudit.flags.length === 0 ? (
              <p className="mt-2 text-sm text-green-700">No flags — as expected for pristine Silent Ledger one-time addresses.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {demoAudit.flags.map((f) => (
                  <li key={f.type} className="text-xs text-zinc-700">
                    <span className="font-medium">{f.type}</span> ({f.severity}, −{f.penalty}): {f.details}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <p className="text-xs text-zinc-500">
        Only the public address you enter is sent to <code className="rounded bg-zinc-100 px-1">/api/btc/address/:address/utxos</code>{" "}
        and <code className="rounded bg-zinc-100 px-1">/txs</code>. No xpub, xprv, seed, nsec, or shared secret is
        transmitted.
      </p>
    </div>
  );
}
