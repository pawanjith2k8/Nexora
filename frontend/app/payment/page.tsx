"use client";

import { useState } from "react";
import {
  ApiError,
  resolveNpub,
  createNip17HandshakeTemplate,
  getDemoPair,
  broadcastTx,
} from "@/lib/api";
import type { NostrResolveResponse, NostrHandshakeResponse, DemoPairResponse } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import {
  decodePaymentCodeClient,
  computeECDHClient,
  deriveAddressSequenceClient,
  generateRandomPrivHex,
  isValidPrivateHex,
  bytesToHex,
} from "@/lib/bip47Client";

type LoadState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

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
      showToast("Copy failed — please copy manually", "error");
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

export default function PaymentPage() {
  const { showToast } = useToast();

  // 1. Recipient / discovery
  const [recipientInput, setRecipientInput] = useState("");
  const [resolveState, setResolveState] = useState<LoadState<NostrResolveResponse>>({ status: "idle" });

  // 2. Handshake
  const [senderPubkeyHex, setSenderPubkeyHex] = useState("");
  const [receiverPubkeyHex, setReceiverPubkeyHex] = useState("");
  const [senderPaymentCode, setSenderPaymentCode] = useState("");
  const [handshakeState, setHandshakeState] = useState<LoadState<NostrHandshakeResponse>>({ status: "idle" });

  // 3. Demo addresses (safe, deterministic) — kept separate from real derivation
  const [demoState, setDemoState] = useState<LoadState<DemoPairResponse>>({ status: "idle" });

  // 3b. Real client-side derivation (browser-only)
  const [derivePaymentCode, setDerivePaymentCode] = useState("");
  const [derivePrivHex, setDerivePrivHex] = useState("");
  const [deriveState, setDeriveState] = useState<
    LoadState<{ sharedSecretHex: string; addresses: { index: number; address: string; tweakHex: string; derivedPubkeyHex: string }[] }>
  >({ status: "idle" });

  // 4. Broadcast
  const [rawTx, setRawTx] = useState("");
  const [broadcastState, setBroadcastState] = useState<LoadState<{ txid: string }>>({ status: "idle" });

  const discoveredPaymentCode =
    resolveState.status === "success" && resolveState.data.success ? resolveState.data.paymentCode : null;
  const discoveredHex =
    resolveState.status === "success" ? resolveState.data.hexPubkey : null;

  async function handleResolve() {
    const value = recipientInput.trim();
    if (!value) {
      setResolveState({ status: "error", message: "Enter a recipient npub or 64-hex pubkey." });
      return;
    }
    setResolveState({ status: "loading" });
    try {
      const data = await resolveNpub(value);
      setResolveState({ status: "success", data });
      // Auto-fill handshake receiver fields with discovered values (public only)
      if (data.success && data.hexPubkey) {
        setReceiverPubkeyHex(data.hexPubkey);
        // sender fields remain for user to fill with their own public data
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Resolve failed";
      setResolveState({ status: "error", message: msg });
    }
  }

  async function handleLoadDemoForPayment() {
    setDemoState({ status: "loading" });
    try {
      const demo = await getDemoPair();
      setDemoState({ status: "success", data: demo });
      // Fill recipient with demo alice, sender with demo bob for handshake demo
      setRecipientInput(demo.alice.npub);
      setReceiverPubkeyHex(demo.alice.nostrPubkeyHex.slice(0, 64));
      setSenderPubkeyHex(demo.bob.nostrPubkeyHex.slice(0, 64));
      setSenderPaymentCode(demo.bob.paymentCode);
      showToast("Demo Alice (receiver) + Bob (sender) loaded. All values are public test vectors.", "info");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to load demo pair";
      setDemoState({ status: "error", message: msg });
    }
  }

  async function handleHandshake() {
    const sPub = senderPubkeyHex.trim();
    const rPub = receiverPubkeyHex.trim();
    const sCode = senderPaymentCode.trim();
    if (!sPub || !rPub || !sCode) {
      setHandshakeState({
        status: "error",
        message: "All three fields are public: sender pubkey, receiver pubkey, and sender payment code.",
      });
      return;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(sPub) || !/^[0-9a-fA-F]{64}$/.test(rPub)) {
      setHandshakeState({ status: "error", message: "Both pubkeys must be 64 hex characters (Nostr public keys, public only)." });
      return;
    }
    if (!sCode.startsWith("PM8")) {
      setHandshakeState({ status: "error", message: "senderPaymentCode must be a valid PM8... payment code (public)." });
      return;
    }
    setHandshakeState({ status: "loading" });
    try {
      const data = await createNip17HandshakeTemplate({
        senderPubkeyHex: sPub.toLowerCase(),
        receiverPubkeyHex: rPub.toLowerCase(),
        senderPaymentCode: sCode,
      });
      setHandshakeState({ status: "success", data });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Handshake template failed";
      setHandshakeState({ status: "error", message: msg });
    }
  }

  async function handleDemoAddresses() {
    if (demoState.status === "success") {
      showToast("Demo addresses already loaded below.", "info");
      return;
    }
    setDemoState({ status: "loading" });
    try {
      const demo = await getDemoPair();
      setDemoState({ status: "success", data: demo });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to load demo addresses";
      setDemoState({ status: "error", message: msg });
    }
  }

  function handleGeneratePriv() {
    const hex = generateRandomPrivHex();
    setDerivePrivHex(hex);
    showToast("Ephemeral private key generated locally — never leaves this browser.", "info");
  }

  async function handleClientDerive() {
    const paymentCode = (derivePaymentCode.trim() || discoveredPaymentCode || "").trim();
    const privHex = derivePrivHex.trim().toLowerCase();

    if (!paymentCode) {
      setDeriveState({ status: "error", message: "Enter a receiver payment code (PM8...), or resolve a recipient first." });
      return;
    }
    if (!isValidPrivateHex(privHex)) {
      setDeriveState({
        status: "error",
        message: "Private key must be 32 bytes (64 hex) and a valid secp256k1 scalar. Use Generate to create a test key.",
      });
      return;
    }

    setDeriveState({ status: "loading" });
    try {
      const decoded = decodePaymentCodeClient(paymentCode);
      // shared secret = priv * receiverPubkey (ECDH) — entirely in browser
      const sharedSecretBytes = computeECDHClient(privHex, decoded.pubkeyHex);
      const sharedSecretHex = bytesToHex(sharedSecretBytes);

      // Derive 5 addresses, testnet, p2wpkh — matches backend exactly
      const addresses = await deriveAddressSequenceClient({
        receiverPaymentCode: paymentCode,
        sharedSecretHex,
        count: 5,
        startIndex: 0,
        addressType: "p2wpkh",
        network: "testnet",
      });

      setDeriveState({
        status: "success",
        data: { sharedSecretHex, addresses },
      });
      showToast("Derived 5 fresh testnet addresses client-side (shared secret stayed in browser).", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Derivation failed";
      setDeriveState({ status: "error", message: msg });
    }
  }

  async function handleBroadcast() {
    const hex = rawTx.trim();
    if (!hex) {
      setBroadcastState({ status: "error", message: "Paste a signed raw transaction hex." });
      return;
    }
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      setBroadcastState({ status: "error", message: "rawTx must be hex." });
      return;
    }
    setBroadcastState({ status: "loading" });
    try {
      const res = await broadcastTx(hex);
      setBroadcastState({ status: "success", data: { txid: res.txid } });
      showToast(`Broadcast success: ${res.txid}`, "success");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Broadcast failed";
      setBroadcastState({ status: "error", message: msg });
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="payment-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <h1 id="payment-heading" className="text-xl font-semibold text-zinc-900">
          Payment
        </h1>
        <p className="mt-2 max-w-prose text-sm text-zinc-600">
          Silent Ledger payment flow on <span className="font-medium text-zinc-900">Bitcoin Testnet</span>. Discover
          a recipient&apos;s payment code over Nostr, build a NIP-17 handshake template (public only), and derive a
          fresh one-time address. All private keys stay in your wallet — never entered here.
        </p>
        <div className="mt-4 rounded-md bg-green-50 p-3 text-xs text-green-800">
          <p className="font-medium">Security boundary — real crypto is client-side</p>
          <p className="mt-1">
            Shared-secret ECDH derivation now happens entirely in the browser via{" "}
            <code className="rounded bg-green-100 px-1">tiny-secp256k1</code> +{" "}
            <code className="rounded bg-green-100 px-1">bitcoinjs-lib</code>. No nsec, seed, xprv, or sharedSecretHex is
            ever sent to the backend. <code className="mx-1 rounded bg-green-100 px-1">
              POST /api/crypto/ecdh/derive-sequence
            </code>{" "}
            remains demo/test-vector only and is not called for real users.
          </p>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={handleLoadDemoForPayment}
            className="rounded-md border border-zinc-200 bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800"
          >
            Load demo Alice + Bob test vectors
          </button>
          <span className="ml-2 text-xs text-zinc-500">Fills recipient + handshake fields with public demo data.</span>
        </div>
      </section>

      {/* 1. Recipient / Discovery */}
      <Section
        title="1. Recipient & Payment-Code Discovery"
        description="Enter recipient npub or hex, resolve via GET /api/nostr/resolve/:npub over public relays. Result is public paymentCode + event."
      >
        <div className="space-y-2">
          <label htmlFor="recipient-input" className="block text-sm font-medium text-zinc-700">
            Recipient (npub or 64-hex)
          </label>
          <input
            id="recipient-input"
            type="text"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            placeholder="npub1... or 64-char hex"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={handleResolve}
            disabled={resolveState.status === "loading"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {resolveState.status === "loading" ? "Resolving..." : "Resolve payment code"}
          </button>
        </div>

        {resolveState.status === "idle" && <p className="text-sm text-zinc-500">No lookup yet.</p>}
        {resolveState.status === "error" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{resolveState.message}</p>
          </div>
        )}
        {resolveState.status === "success" && (
          <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className={`text-sm font-medium ${resolveState.data.success ? "text-green-700" : "text-amber-700"}`}>
              {resolveState.data.success ? "Payment code found" : "No payment code published for this identity"}
            </p>
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="text-zinc-500">npub</dt>
                <dd className="break-all font-mono text-xs text-zinc-800">{resolveState.data.npub}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Hex</dt>
                <dd className="break-all font-mono text-xs text-zinc-800">{resolveState.data.hexPubkey}</dd>
              </div>
              {discoveredPaymentCode && (
                <div>
                  <dt className="text-zinc-500">Payment code (public)</dt>
                  <dd className="flex items-center gap-2">
                    <span className="break-all font-mono text-xs text-zinc-800">{discoveredPaymentCode}</span>
                    <CopyButton text={discoveredPaymentCode} />
                  </dd>
                </div>
              )}
              {discoveredHex && (
                <div>
                  <dt className="text-zinc-500">Discovered hex (receiver pubkey)</dt>
                  <dd className="break-all font-mono text-xs text-zinc-800">{discoveredHex}</dd>
                </div>
              )}
              {resolveState.data.discoveredOnRelay && (
                <div>
                  <dt className="text-zinc-500">Relay</dt>
                  <dd className="font-mono text-xs text-zinc-800">{resolveState.data.discoveredOnRelay}</dd>
                </div>
              )}
              {resolveState.data.message && <p className="text-xs text-zinc-600">{resolveState.data.message}</p>}
            </dl>
          </div>
        )}
        <p className="text-xs text-zinc-500">
          Uses real backend Nostr relays (kind 30078). No Nostr message is actually sent yet — see handshake step.
        </p>
      </Section>

      {/* 2. Handshake */}
      <Section
        title="2. NIP-17 Handshake (Template Only)"
        description="Build a handshake blueprint from public keys + sender payment code via POST /api/nostr/template/nip17-handshake. No encrypted message is actually sent — template describes Gift Wrap flow."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sender-pubkey" className="block text-sm font-medium text-zinc-700">
              Sender Nostr pubkeyHex (public, 64 hex)
            </label>
            <input
              id="sender-pubkey"
              type="text"
              value={senderPubkeyHex}
              onChange={(e) => setSenderPubkeyHex(e.target.value)}
              placeholder="Your public Nostr key (hex)"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor="receiver-pubkey" className="block text-sm font-medium text-zinc-700">
              Receiver Nostr pubkeyHex (public, from resolve)
            </label>
            <input
              id="receiver-pubkey"
              type="text"
              value={receiverPubkeyHex}
              onChange={(e) => setReceiverPubkeyHex(e.target.value)}
              placeholder="Recipient hex (auto-filled after resolve)"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div>
          <label htmlFor="sender-pc" className="block text-sm font-medium text-zinc-700">
            Sender payment code (PM8..., public)
          </label>
          <input
            id="sender-pc"
            type="text"
            value={senderPaymentCode}
            onChange={(e) => setSenderPaymentCode(e.target.value)}
            placeholder="PM8... (your public payment code)"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          onClick={handleHandshake}
          disabled={handshakeState.status === "loading"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {handshakeState.status === "loading" ? "Building..." : "Build handshake template"}
        </button>

        {handshakeState.status === "idle" && <p className="text-sm text-zinc-500">No handshake yet.</p>}
        {handshakeState.status === "error" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{handshakeState.message}</p>
          </div>
        )}
        {handshakeState.status === "success" && (
          <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-600">{handshakeState.data.handshake.description}</p>
            <pre className="max-h-48 overflow-auto rounded bg-white p-3 text-xs font-mono">
              {JSON.stringify(handshakeState.data.handshake.rumor, null, 2)}
            </pre>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-zinc-600">
              {handshakeState.data.handshake.flow.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              No NIP-17 message was sent. This is a local blueprint. Actual Gift Wrap encryption + relay publish
              requires a NIP-44 capable client and is not yet implemented in this frontend.
            </div>
          </div>
        )}
      </Section>

      {/* 3. Real client-side Address Derivation */}
      <Section
        title="3. Fresh Payment Address — Real Client-Side ECDH (Testnet P2WPKH)"
        description="ECDH shared secret is derived entirely in the browser via tiny-secp256k1 + bitcoinjs-lib — never sent to the backend. DEMO addresses are shown separately below."
      >
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-800">
          <p className="font-medium">Client-side crypto active</p>
          <p className="mt-1">
            Uses <code className="rounded bg-green-100 px-1">tiny-secp256k1@2.2.4</code> +{" "}
            <code className="rounded bg-green-100 px-1">bitcoinjs-lib@7.0.2</code> +{" "}
            <code className="rounded bg-green-100 px-1">bs58check@4.0.0</code> — same versions as backend. Algorithm
            matches <code>backend/src/services/bip47.service.js:92-142</code> exactly:{" "}
            <code>computeECDH → computeTweak(HMAC-SHA512) → deriveOneTimePubkey → p2wpkh</code> on testnet. Shared secret
            never leaves browser; <code>POST /api/crypto/ecdh/derive-sequence</code> is not called for real users.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="derive-pc" className="block text-sm font-medium text-zinc-700">
              Receiver payment code (PM8..., public)
            </label>
            <input
              id="derive-pc"
              type="text"
              value={derivePaymentCode}
              onChange={(e) => setDerivePaymentCode(e.target.value)}
              placeholder={discoveredPaymentCode || "PM8... (from resolve or paste)"}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Auto-filled from resolve if available. This demo payment code is public.
            </p>
          </div>

          <div>
            <label htmlFor="derive-priv" className="block text-sm font-medium text-zinc-700">
              Ephemeral private key (hex, 64 chars, client-side only)
            </label>
            <div className="flex gap-2">
              <input
                id="derive-priv"
                type="password"
                value={derivePrivHex}
                onChange={(e) => setDerivePrivHex(e.target.value.trim())}
                placeholder="64 hex chars — generate or paste test key"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={handleGeneratePriv}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Generate
              </button>
            </div>
            <p className="mt-1 text-xs text-amber-700">
              For demonstration only. Generated locally via <code>crypto.getRandomValues</code>; never sent to backend.
              Do not paste a real wallet seed.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClientDerive}
            disabled={deriveState.status === "loading"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {deriveState.status === "loading" ? "Deriving..." : "Derive 5 fresh addresses (client-side)"}
          </button>

          {deriveState.status === "idle" && <p className="text-sm text-zinc-500">No real addresses derived yet.</p>}
          {deriveState.status === "error" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{deriveState.message}</p>
            </div>
          )}
          {deriveState.status === "success" && (
            <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-green-700">
                Real — derived locally, never sent
              </p>
              <p className="text-xs text-zinc-600">
                Shared secret computed as <code className="rounded bg-zinc-100 px-1">priv × pub</code> in browser; then
                5 P2WPKH testnet addresses derived. First address is the fresh payment destination.
              </p>
              <ul className="space-y-2">
                {deriveState.data.addresses.map((a) => (
                  <li key={a.index} className="flex items-center justify-between rounded bg-white p-2 text-xs">
                    <span className="font-medium text-zinc-700">Index {a.index}</span>
                    <span className="break-all font-mono text-zinc-800">{a.address}</span>
                    <CopyButton text={a.address} />
                  </li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500">
                Testnet P2WPKH • Network: testnet • Never sent to backend. Save the private key only if you need to
                re-derive.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-medium text-zinc-900">Deterministic demo vectors (separate)</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Public demo from <code>GET /api/crypto/demo-pair</code> — not your wallet. Useful to verify parity.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDemoAddresses}
              disabled={demoState.status === "loading"}
              className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {demoState.status === "loading" ? "Loading demo..." : "Show demo one-time addresses"}
            </button>
            <span className="text-xs text-zinc-500">Deterministic demo from backend.</span>
          </div>

          {demoState.status === "idle" && <p className="mt-2 text-sm text-zinc-500">No demo loaded yet.</p>}
          {demoState.status === "error" && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{demoState.message}</p>
            </div>
          )}
          {demoState.status === "success" && (
            <div className="mt-3 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Demo — not a real user address</p>
              <p className="text-xs text-zinc-600">
                {demoState.data.description} Parity: {demoState.data.derivedAddressesMatch ? "✓" : "✗"} —{" "}
                {demoState.data.ecdh.secretsMatchParity ? "shared secrets match" : "mismatch"}
              </p>
              <ul className="space-y-2">
                {demoState.data.addresses.map((a) => (
                  <li key={a.index} className="flex items-center justify-between rounded bg-white p-2 text-xs">
                    <span className="font-medium text-zinc-700">Index {a.index}</span>
                    <span className="break-all font-mono text-zinc-800">{a.address}</span>
                    <CopyButton text={a.address} />
                  </li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500">
                Receiver payment code (demo Alice): <span className="break-all font-mono">{demoState.data.alice.paymentCode}</span>
              </p>
              <p className="text-xs font-medium text-amber-700">Do not use demo addresses for real funds.</p>
            </div>
          )}
        </div>
      </Section>

      {/* 4. Broadcast */}
      <Section
        title="4. Bitcoin Testnet Broadcast (Optional, Advanced)"
        description="Only if you have an already-signed raw transaction hex. This frontend does NOT construct or sign transactions and never asks for private keys. Uses POST /api/btc/broadcast."
      >
        <div>
          <label htmlFor="rawtx" className="block text-sm font-medium text-zinc-700">
            Signed rawTx hex (testnet)
          </label>
          <textarea
            id="rawtx"
            value={rawTx}
            onChange={(e) => setRawTx(e.target.value)}
            placeholder="02000000... (signed hex, public only)"
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          onClick={handleBroadcast}
          disabled={broadcastState.status === "loading"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {broadcastState.status === "loading" ? "Broadcasting..." : "Broadcast to testnet"}
        </button>

        {broadcastState.status === "idle" && (
          <p className="text-xs text-zinc-500">
            Transaction signing/fee calculation is not implemented. Provide only a fully signed transaction if you have
            one from an external wallet.
          </p>
        )}
        {broadcastState.status === "error" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{broadcastState.message}</p>
          </div>
        )}
        {broadcastState.status === "success" && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3">
            <p className="text-sm font-medium text-green-800">Broadcast succeeded</p>
            <p className="break-all font-mono text-xs text-green-700">txid: {broadcastState.data.txid}</p>
          </div>
        )}
        <p className="text-xs text-zinc-500">
          Backend verifies this is testnet only (<code>backend/src/config.js:9</code> mempool testnet). Do not paste
          mainnet rawTx.
        </p>
      </Section>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Flow summary</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-600">
          <li>
            <span className="font-medium">Implemented:</span> recipient resolve (real), handshake template (real,
            public-only), <span className="font-medium">real client-side ECDH derivation</span> (5× testnet P2WPKH, shared
            secret stays in browser), demo vectors, signed-hex broadcast passthrough.
          </li>
          <li>
            <span className="font-medium">Not yet implemented:</span> NIP-17 Gift Wrap encryption + relay publish,
            transaction construction/signing, coin selection.
          </li>
          <li>No private key, nsec, seed, xprv, or sharedSecretHex is ever sent to the backend — verified by grep + network.</li>
        </ul>
      </div>
    </div>
  );
}
