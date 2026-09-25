"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, getHealth, getNostrRelays, getBtcFees, getSimulatedWalletClean } from "@/lib/api";
import type {
  HealthResponse,
  NostrRelaysResponse,
  FeesResponse,
  SimulatedWalletCleanResponse,
} from "@/lib/types";

type LoadState<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

export default function DashboardPage() {
  const [health, setHealth] = useState<LoadState<HealthResponse>>({ status: "loading" });
  const [relays, setRelays] = useState<LoadState<NostrRelaysResponse>>({ status: "loading" });
  const [fees, setFees] = useState<LoadState<FeesResponse>>({ status: "loading" });
  const [cleanDemo, setCleanDemo] = useState<LoadState<SimulatedWalletCleanResponse>>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Health
      try {
        const h = await getHealth();
        if (!cancelled) setHealth({ status: "success", data: h });
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to reach backend";
        if (!cancelled) setHealth({ status: "error", message: msg });
      }

      // Relays
      try {
        const r = await getNostrRelays();
        if (!cancelled) setRelays({ status: "success", data: r });
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to load relays";
        if (!cancelled) setRelays({ status: "error", message: msg });
      }

      // Fees
      try {
        const f = await getBtcFees();
        if (!cancelled) setFees({ status: "success", data: f });
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to load fees";
        if (!cancelled) setFees({ status: "error", message: msg });
      }

      // Clean demo scenario (real backend simulated data, clearly labeled as demo)
      try {
        const c = await getSimulatedWalletClean();
        if (!cancelled) setCleanDemo({ status: "success", data: c });
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to load demo";
        if (!cancelled) setCleanDemo({ status: "error", message: msg });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const isTestnet =
    health.status === "success" ? health.data.mempoolTestnet.toLowerCase().includes("testnet") : true;

  return (
    <div className="space-y-8">
      {/* Intro — core concept */}
      <section aria-labelledby="dashboard-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <h1 id="dashboard-heading" className="text-xl font-semibold text-zinc-900">
          Dashboard
        </h1>
        <p className="mt-2 max-w-prose text-sm text-zinc-600">
          Silent Ledger is a privacy-first Bitcoin payment layer. Discover fresh payment addresses privately
          over Nostr, keep sensitive wallet analysis on the client, and operate on{" "}
          <span className="font-medium text-zinc-900">Bitcoin Testnet</span> unless the backend indicates
          otherwise.
        </p>
        <div className="mt-4 rounded-md bg-zinc-50 p-4">
          <h2 className="text-sm font-semibold text-zinc-900">How Silent Ledger&apos;s privacy flow works</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-600">
            <li>Publisher shares a BIP47 payment code via a signed Nostr event (kind 30078).</li>
            <li>Sender discovers the code by resolving the recipient&apos;s npub over relays.</li>
            <li>Private NIP-17 handshake exchanges codes without on-chain traces.</li>
            <li>Both sides derive the same one-time addresses locally via ECDH — no reuse, no linkage.</li>
            <li>Privacy checks and AI coaching use only sanitized, client-side metrics.</li>
          </ol>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Current environment: {isTestnet ? "Bitcoin Testnet (mempool.space/testnet)" : "Bitcoin"} — shown from
          real backend health. No mainnet switch is offered because the backend supports testnet only.
        </p>
      </section>

      {/* System / Backend status */}
      <section aria-labelledby="system-status-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 id="system-status-heading" className="text-sm font-semibold text-zinc-900">
          System &amp; Backend Status
        </h2>
        {health.status === "loading" && <p className="mt-2 text-sm text-zinc-500">Loading...</p>}
        {health.status === "error" && (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">Unable to connect to Silent Ledger backend.</p>
            <p className="mt-1 text-xs text-red-700">{health.message}</p>
            <p className="mt-2 text-xs text-zinc-600">Check that the backend is running on NEXT_PUBLIC_API_URL.</p>
          </div>
        )}
        {health.status === "success" && (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500">Project</dt>
              <dd className="font-medium text-zinc-900">
                {health.data.project} v{health.data.version} — {health.data.status}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Description</dt>
              <dd className="text-zinc-700">{health.data.description}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Mempool API</dt>
              <dd className="break-all font-mono text-xs text-zinc-700">{health.data.mempoolTestnet}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">AI Provider</dt>
              <dd className="text-zinc-700">{health.data.aiProvider}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Relays Configured</dt>
              <dd className="text-zinc-700">{health.data.relaysConfigured}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Database</dt>
              <dd className="text-zinc-700">
                {health.data.database.status} {health.data.database.connected ? "(connected)" : "(disconnected)"}
                {health.data.database.hasPlaceholder ? " — placeholder credentials" : ""}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bitcoin Testnet + Fees */}
        <section aria-labelledby="btc-status-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 id="btc-status-heading" className="text-sm font-semibold text-zinc-900">
            Bitcoin Testnet Status
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Explorer proxied via backend. Fees are recommended sat/vB from mempool.
          </p>
          {fees.status === "loading" && <p className="mt-3 text-sm text-zinc-500">Loading...</p>}
          {fees.status === "error" && (
            <p className="mt-3 text-sm text-red-700">Unable to load fees: {fees.message}</p>
          )}
          {fees.status === "success" && (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-xs text-zinc-500">Fastest</dt>
                <dd className="font-mono font-medium text-zinc-900">{fees.data.fees.fastestFee} sat/vB</dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-xs text-zinc-500">Half hour</dt>
                <dd className="font-mono font-medium text-zinc-900">{fees.data.fees.halfHourFee} sat/vB</dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-xs text-zinc-500">Hour</dt>
                <dd className="font-mono font-medium text-zinc-900">{fees.data.fees.hourFee} sat/vB</dd>
              </div>
              <div className="rounded-md bg-zinc-50 p-3">
                <dt className="text-xs text-zinc-500">Minimum</dt>
                <dd className="font-mono font-medium text-zinc-900">{fees.data.fees.minimumFee} sat/vB</dd>
              </div>
            </dl>
          )}
          {health.status === "success" && (
            <p className="mt-3 text-xs text-zinc-500">Source: {health.data.mempoolTestnet}/v1/fees/recommended</p>
          )}
        </section>

        {/* Nostr relay status */}
        <section aria-labelledby="nostr-status-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
          <h2 id="nostr-status-heading" className="text-sm font-semibold text-zinc-900">
            Nostr Relay Status
          </h2>
          <p className="mt-1 text-xs text-zinc-500">Live WebSocket checks via backend.</p>
          {relays.status === "loading" && <p className="mt-3 text-sm text-zinc-500">Loading...</p>}
          {relays.status === "error" && (
            <p className="mt-3 text-sm text-red-700">Unable to load relays: {relays.message}</p>
          )}
          {relays.status === "success" && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-zinc-700">
                {relays.data.health.onlineCount} / {relays.data.health.totalCount} relays online
              </p>
              <ul className="space-y-1">
                {relays.data.health.relays.map((r) => (
                  <li key={r.url} className="flex items-center justify-between text-xs">
                    <span className="break-all font-mono text-zinc-700">{r.url}</span>
                    <span
                      className={`ml-3 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
                        r.online ? "border-green-200 bg-green-50 text-green-800" : "border-zinc-200 bg-zinc-50 text-zinc-600"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${r.online ? "bg-green-500" : "bg-zinc-400"}`} />
                      {r.status} {r.latencyMs ? `${r.latencyMs}ms` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500">Default relays: {relays.data.defaultRelays.join(", ")}</p>
            </div>
          )}
        </section>
      </div>

      {/* Privacy posture — demo only, clearly labeled; empty state if not available */}
      <section aria-labelledby="privacy-posture-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 id="privacy-posture-heading" className="text-sm font-semibold text-zinc-900">
          Privacy Posture
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          No wallet activity analyzed yet. Run a check on the Privacy page with real UTXOs. Below is the
          backend&apos;s simulated pristine-wallet demo for reference only.
        </p>

        {cleanDemo.status === "loading" && <p className="mt-3 text-sm text-zinc-500">Loading...</p>}
        {cleanDemo.status === "error" && (
          <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-sm text-zinc-600">Demo privacy data unavailable: {cleanDemo.message}</p>
            <p className="mt-1 text-xs text-zinc-500">No wallet activity analyzed yet.</p>
          </div>
        )}
        {cleanDemo.status === "success" && (
          <div className="mt-3 rounded-md border border-zinc-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Demo — {cleanDemo.data.scenario}
            </p>
            <p className="mt-1 text-sm text-zinc-600">{cleanDemo.data.description}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-green-50 px-3 py-1 font-medium text-green-800">
                Score {cleanDemo.data.audit.score}/100 — {cleanDemo.data.audit.grade}
              </span>
              <span className="rounded-full bg-zinc-50 px-3 py-1 text-zinc-700">
                UTXOs {cleanDemo.data.audit.summary.totalUtxos}
              </span>
              <span className="rounded-full bg-zinc-50 px-3 py-1 text-zinc-700">
                {cleanDemo.data.audit.flags.length === 0 ? "No flags" : `${cleanDemo.data.audit.flags.length} flags`}
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Total balance (demo): {cleanDemo.data.totalBalanceSats.toLocaleString()} sats • This is simulated
              data from <code className="rounded bg-zinc-100 px-1">GET /api/scenarios/simulated-wallet-clean</code>,
              not your wallet.
            </p>
            <div className="mt-3">
              <Link href="/privacy" className="text-sm font-medium text-zinc-900 underline">
                Run your own privacy check →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Activity empty state — per correction, no hardcoded address */}
      <section aria-labelledby="activity-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 id="activity-heading" className="text-sm font-semibold text-zinc-900">
          Recent Activity
        </h2>
        <div className="mt-3 rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm text-zinc-600">No wallet activity analyzed yet.</p>
          <p className="mt-1 text-xs text-zinc-500">
            Enter a Bitcoin testnet address on the Activity or Privacy pages to load real UTXOs/transactions.
          </p>
          <div className="mt-3 flex gap-3">
            <Link href="/activity" className="text-sm font-medium text-zinc-900 underline">
              Go to Activity
            </Link>
            <Link href="/privacy" className="text-sm font-medium text-zinc-900 underline">
              Run Privacy Check
            </Link>
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section aria-labelledby="quick-actions-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <h2 id="quick-actions-heading" className="text-sm font-semibold text-zinc-900">
          Quick Actions
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/identity"
            className="rounded-md border border-zinc-200 p-4 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <span className="text-sm font-medium text-zinc-900">Create Identity</span>
            <p className="mt-1 text-xs text-zinc-500">Generate or resolve Nostr + payment code</p>
          </Link>
          <Link
            href="/payment"
            className="rounded-md border border-zinc-200 p-4 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <span className="text-sm font-medium text-zinc-900">Make Payment</span>
            <p className="mt-1 text-xs text-zinc-500">Discover &amp; derive fresh address (testnet)</p>
          </Link>
          <Link
            href="/privacy"
            className="rounded-md border border-zinc-200 p-4 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <span className="text-sm font-medium text-zinc-900">Run Privacy Check</span>
            <p className="mt-1 text-xs text-zinc-500">Client-side UTXO analysis</p>
          </Link>
          <Link
            href="/coach"
            className="rounded-md border border-zinc-200 p-4 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <span className="text-sm font-medium text-zinc-900">Ask AI Coach</span>
            <p className="mt-1 text-xs text-zinc-500">Privacy tutoring from real backend AI</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
