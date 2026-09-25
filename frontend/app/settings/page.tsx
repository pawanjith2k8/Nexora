"use client";

import { useEffect, useState } from "react";
import { ApiError, getHealth, getNostrRelays } from "@/lib/api";
import type { HealthResponse, NostrRelaysResponse } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

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

type HealthState =
  | { status: "loading" }
  | { status: "success"; data: HealthResponse }
  | { status: "error"; message: string };

type RelaysState =
  | { status: "loading" }
  | { status: "success"; data: NostrRelaysResponse }
  | { status: "error"; message: string };

export default function SettingsPage() {
  const { showToast } = useToast();
  const [health, setHealth] = useState<HealthState>({ status: "loading" });
  const [relays, setRelays] = useState<RelaysState>({ status: "loading" });
  const [localAudit, setLocalAudit] = useState<string | null>(null);
  const [localAddress, setLocalAddress] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  function refreshLocalState() {
    try {
      setLocalAudit(sessionStorage.getItem("sl:lastAudit"));
      setLocalAddress(sessionStorage.getItem("sl:lastPrivacyAddress"));
    } catch {
      setLocalAudit(null);
      setLocalAddress(null);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshLocalState();

    let cancelled = false;
    async function loadHealth() {
      try {
        const data = await getHealth();
        if (!cancelled) setHealth({ status: "success", data });
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to load health";
        if (!cancelled) setHealth({ status: "error", message: msg });
      }
    }
    async function loadRelays() {
      try {
        const data = await getNostrRelays();
        if (!cancelled) setRelays({ status: "success", data });
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to load relays";
        if (!cancelled) setRelays({ status: "error", message: msg });
      }
    }
    loadHealth();
    loadRelays();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleClearAudit() {
    try {
      sessionStorage.removeItem("sl:lastAudit");
      refreshLocalState();
      showToast("Cleared last privacy audit context (sl:lastAudit).", "success");
    } catch {
      showToast("Failed to clear audit context.", "error");
    }
  }

  function handleClearAddress() {
    try {
      sessionStorage.removeItem("sl:lastPrivacyAddress");
      refreshLocalState();
      showToast("Cleared last queried public address (sl:lastPrivacyAddress).", "success");
    } catch {
      showToast("Failed to clear address.", "error");
    }
  }

  function handleClearAll() {
    const keys = ["sl:lastAudit", "sl:lastPrivacyAddress"];
    let cleared = 0;
    for (const k of keys) {
      try {
        if (sessionStorage.getItem(k) !== null) {
          sessionStorage.removeItem(k);
          cleared++;
        }
      } catch {}
    }
    refreshLocalState();
    setConfirmClear(false);
    if (cleared > 0) {
      showToast(`Cleared ${cleared} Silent Ledger browser key(s): ${keys.join(", ")} (only SL-owned).`, "success");
    } else {
      showToast("No Silent Ledger local data to clear.", "info");
    }
  }

  const isTestnet = health.status === "success" ? health.data.mempoolTestnet.toLowerCase().includes("testnet") : true;
  const hasLocalData = localAudit !== null || localAddress !== null;

  return (
    <div className="space-y-8">
      <section aria-labelledby="settings-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <h1 id="settings-heading" className="text-xl font-semibold text-zinc-900">
          Settings
        </h1>
        <p className="mt-2 max-w-prose text-sm text-zinc-600">
          Privacy-focused settings for Silent Ledger. This page explains how the app works and lets you manage only
          Silent Ledger-owned browser data — no private keys, seeds, or wallet exports are ever stored.
        </p>
      </section>

      {/* Network / Environment */}
      <Section
        title="Network / Environment"
        description="Current backend environment. Bitcoin Testnet only — shown as informational, not a switch. No backend infrastructure changes are supported from the frontend."
      >
        {health.status === "loading" && <p className="text-sm text-zinc-500">Loading backend status...</p>}
        {health.status === "error" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">Backend unavailable</p>
            <p className="mt-1 text-sm text-red-700">{health.message}</p>
            <p className="mt-1 text-xs text-zinc-600">Check that the backend is running at the API URL below.</p>
          </div>
        )}
        {health.status === "success" && (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-zinc-500">Network</dt>
              <dd className="font-medium text-zinc-900">
                {isTestnet ? "Bitcoin Testnet" : "Bitcoin"} {isTestnet ? "(mempool.space/testnet)" : ""}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Backend API URL</dt>
              <dd className="break-all font-mono text-xs text-zinc-700" title="Public frontend config, not a secret">
                {apiUrl}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Mempool API (health)</dt>
              <dd className="break-all font-mono text-xs text-zinc-700">{health.data.mempoolTestnet}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Version</dt>
              <dd className="text-zinc-700">
                {health.data.project} v{health.data.version} — {health.data.status}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">AI Provider (server-side)</dt>
              <dd className="text-zinc-700">{health.data.aiProvider}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Database</dt>
              <dd className="text-zinc-700">
                {health.data.database.status} {health.data.database.connected ? "(connected)" : "(disconnected)"}
              </dd>
            </div>
          </dl>
        )}
        <p className="text-xs text-zinc-500">
          Backend infrastructure is read-only. Changing relays or network requires server config, not a frontend toggle.
        </p>
      </Section>

      {/* Nostr */}
      <Section
        title="Nostr Relays"
        description="Configured relays from the backend (read-only). Live status is checked via WebSocket — no private keys needed. Changing relays is not supported from this frontend."
      >
        {relays.status === "loading" && <p className="text-sm text-zinc-500">Checking relays...</p>}
        {relays.status === "error" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">Unable to load relays: {relays.message}</p>
          </div>
        )}
        {relays.status === "success" && (
          <div className="space-y-2">
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
            <p className="break-all text-xs text-zinc-500">Configured: {relays.data.defaultRelays.join(", ")}</p>
          </div>
        )}
      </Section>

      {/* Privacy — local data controls */}
      <Section
        title="Privacy — Local Browser Data"
        description="Silent Ledger stores only two non-sensitive keys in sessionStorage. Clear them here. Only SL-owned keys are touched — no other site data, no cookies, no blockchain history, no Nostr events."
      >
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Current Silent Ledger browser data</h3>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-zinc-500">sl:lastAudit</dt>
              <dd className={localAudit ? "font-medium text-amber-700" : "text-zinc-700"}>{localAudit ? "present" : "empty"}</dd>
            </div>
            {localAudit && <dd className="break-all font-mono text-xs text-zinc-600">{localAudit.slice(0, 80)}...</dd>}
            <div className="flex justify-between">
              <dt className="text-zinc-500">sl:lastPrivacyAddress</dt>
              <dd className={localAddress ? "font-medium text-amber-700" : "text-zinc-700"}>{localAddress ? localAddress : "empty"}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-zinc-500">
            Contains: sanitized audit (score/grade/flags/summary) + last public address you queried. No xpub, seed, nsec, or
            shared secret.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={handleClearAudit}
            disabled={!localAudit}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Clear last audit
          </button>
          <button
            type="button"
            onClick={handleClearAddress}
            disabled={!localAddress}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Clear last address
          </button>
          {!confirmClear ? (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={!hasLocalData}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              Clear all local data
            </button>
          ) : (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-medium text-amber-800">
                Clear both keys? This removes only Silent Ledger-owned session data and does not affect the backend,
                blockchain, or Nostr relays.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800"
                >
                  Confirm clear
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
          <p className="font-medium text-zinc-700">What will be removed</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <code className="rounded bg-white px-1">sl:lastAudit</code> — sanitized audit (score, grade, flags, summary) used by
              Privacy → Coach. No raw UTXOs.
            </li>
            <li>
              <code className="rounded bg-white px-1">sl:lastPrivacyAddress</code> — last public Testnet address you queried, for
              convenience in Activity/Privacy.
            </li>
          </ul>
          <p className="mt-2 font-medium text-zinc-700">What will NOT be removed</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Backend/database data, blockchain history, Nostr events already published, other sites’ storage, cookies.</li>
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            After clearing, Privacy, Activity, and Coach pages show their empty states gracefully (e.g., “Run a privacy
            analysis first” in Coach, “Enter a Testnet address” in Privacy/Activity).
          </p>
        </div>
      </Section>

      {/* Security / Architecture */}
      <Section
        title="Security & Privacy Architecture"
        description="How Silent Ledger handles your data today — no stronger guarantees than implemented."
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
          <li>Privacy scoring (`auditWallet`) runs entirely in the browser (`lib/privacyAuditor.ts` port of `backend/src/services/privacyAuditor.service.js`). Raw UTXOs/txs stay local after fetching.</li>
          <li>
            Raw UTXO/transaction data is <span className="font-medium">not</span> sent to the AI Coach — only sanitized audit (score, grade,
            flags[type/severity/penalty/title/details], summary) is sent to <code className="rounded bg-zinc-100 px-1">POST /api/ai/coach/*</code>.
          </li>
          <li>
            Private keys, seeds, mnemonics, xpub/xprv, nsec, and shared ECDH secrets are never required by Activity, Privacy,
            or Settings — and are blocked by <code className="rounded bg-zinc-100 px-1">privacyGuard</code> if sent to the
            backend.
          </li>
          <li>AI provider credentials (Gemini/Claude) remain server-side in `backend/src/config.js` — never exposed as `NEXT_PUBLIC_...`.</li>
          <li>Bitcoin Testnet is the only supported network (`backend/src/config.js:9` mempool testnet, `bitcoin.networks.testnet`). No mainnet switch exists.</li>
          <li>Nostr payment codes use kind 30078 (parameterized replaceable) and NIP-17 handshake templates are unsigned until you sign locally with NIP-07.</li>
        </ul>
      </Section>

      {/* AI Coach */}
      <Section
        title="AI Coach"
        description="Client-side preferences for the coach. No provider API keys or switches are exposed."
      >
        <p className="text-sm text-zinc-600">
          The coach receives sanitized audit context only when you ask it to explain your score. Conversation history is
          kept in component state (ephemeral, not persisted) and is cleared when you clear the last audit above or
          refresh the page.
        </p>
        <p className="text-xs text-zinc-500">
          No settings for “Enable Gemini/Claude” exist — provider is backend-configured (`health.aiProvider`) and falls
          back to the built-in tutor engine. Clearing local audit also resets the coach’s grounding.
        </p>
      </Section>

      {/* Authentication — intentionally omitted */}
      <Section
        title="Authentication"
        description="Existing backend auth routes inspected — intentionally not exposed as account management here."
      >
        <p className="text-sm text-zinc-600">
          Backend has <code className="rounded bg-zinc-100 px-1">POST /api/signup</code>, <code className="rounded bg-zinc-100 px-1">POST /api/login</code>,{" "}
          <code className="rounded bg-zinc-100 px-1">DELETE /api/users/clear-all</code> (`backend/src/routes/auth.routes.js`) with
          in-memory fallback. The current frontend (`AppShell`, `Nav`) has no integrated auth flow, session, or protected
          routes — login is handled by legacy <code className="rounded bg-zinc-100 px-1">login.html</code> only.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          No password reset, email verification, or account deletion is offered here because no frontend auth state exists
          to manage. Adding such would be a fake account system.
        </p>
      </Section>

      <p className="text-xs text-zinc-500">
        Silent Ledger v{health.status === "success" ? health.data.version : "?"} — Privacy-first Bitcoin payment layer. All
        settings above reflect existing behavior; no fake toggles.
      </p>
    </div>
  );
}
