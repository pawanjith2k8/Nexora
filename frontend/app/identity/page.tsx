"use client";

import { useState } from "react";
import {
  ApiError,
  resolveNpub,
  encodePaymentCode,
  decodePaymentCode,
  createPaymentCodeTemplate,
  verifyNostrEvent,
  getDemoPair,
} from "@/lib/api";
import type {
  NostrResolveResponse,
  Bip47EncodeResponse,
  NostrPaymentCodeTemplateResponse,
  NostrVerifyEventResponse,
} from "@/lib/types";
import { useToast } from "@/components/ui/toast";

type LoadState<T> = { status: "idle" } | { status: "loading" } | { status: "success"; data: T } | { status: "error"; message: string };

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

export default function IdentityPage() {
  const { showToast } = useToast();

  // Shared: demo pair loader for filling examples
  const [demoLoading, setDemoLoading] = useState(false);

  // Resolve
  const [resolveInput, setResolveInput] = useState("");
  const [resolveState, setResolveState] = useState<LoadState<NostrResolveResponse>>({ status: "idle" });

  // Encode
  const [encodePubkey, setEncodePubkey] = useState("");
  const [encodeChaincode, setEncodeChaincode] = useState("");
  const [encodeState, setEncodeState] = useState<LoadState<Bip47EncodeResponse>>({ status: "idle" });

  // Decode
  const [decodeInput, setDecodeInput] = useState("");
  const [decodeResult, setDecodeResult] = useState<LoadState<{ paymentCode: string; decoded: { version: number; features: number; pubkey: string; chaincode: string } }>>({
    status: "idle",
  });
  const [decodeError, setDecodeError] = useState<string | null>(null);

  // Template
  const [templatePubkey, setTemplatePubkey] = useState("");
  const [templatePaymentCode, setTemplatePaymentCode] = useState("");
  const [templateState, setTemplateState] = useState<LoadState<NostrPaymentCodeTemplateResponse>>({ status: "idle" });

  // Verify
  const [verifyJson, setVerifyJson] = useState("");
  const [verifyState, setVerifyState] = useState<LoadState<NostrVerifyEventResponse>>({ status: "idle" });

  async function handleLoadDemo() {
    setDemoLoading(true);
    try {
      const demo = await getDemoPair();
      // Fill fields with demo values (clearly labeled as demo test vectors)
      setResolveInput(demo.alice.npub);
      setEncodePubkey(demo.alice.pubkeyHex);
      // chaincode not exposed directly, keep empty to let backend generate random if not supplied
      setDecodeInput(demo.alice.paymentCode);
      setTemplatePubkey(demo.alice.nostrPubkeyHex.slice(0, 64));
      setTemplatePaymentCode(demo.alice.paymentCode);
      showToast("Demo test vectors loaded (Alice). These are deterministic demo values, not your real identity.", "info");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Unable to load demo pair";
      showToast(msg, "error");
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleResolve() {
    const value = resolveInput.trim();
    if (!value) {
      setResolveState({ status: "error", message: "Enter an npub or 64-character hex public key." });
      return;
    }
    setResolveState({ status: "loading" });
    try {
      const data = await resolveNpub(value);
      setResolveState({ status: "success", data });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Resolve failed";
      setResolveState({ status: "error", message: msg });
    }
  }

  async function handleEncode() {
    const pubkeyHex = encodePubkey.trim();
    const chaincodeHex = encodeChaincode.trim() || undefined;
    if (!pubkeyHex) {
      setEncodeState({ status: "error", message: "Compressed pubkeyHex (66 hex chars, 02/03 prefix) is required." });
      return;
    }
    if (!/^[0-9a-fA-F]{66}$/.test(pubkeyHex)) {
      setEncodeState({ status: "error", message: "pubkeyHex must be 66 hex characters (33 bytes compressed)." });
      return;
    }
    if (chaincodeHex && !/^[0-9a-fA-F]{64}$/.test(chaincodeHex)) {
      setEncodeState({ status: "error", message: "chaincodeHex must be 64 hex characters (32 bytes) if provided." });
      return;
    }
    setEncodeState({ status: "loading" });
    try {
      const data = await encodePaymentCode({ pubkeyHex, chaincodeHex });
      setEncodeState({ status: "success", data });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Encode failed";
      setEncodeState({ status: "error", message: msg });
    }
  }

  async function handleDecode() {
    const paymentCode = decodeInput.trim();
    if (!paymentCode) {
      setDecodeError("Enter a BIP47 payment code (PM8...).");
      setDecodeResult({ status: "idle" });
      return;
    }
    setDecodeResult({ status: "loading" });
    setDecodeError(null);
    try {
      const data = await decodePaymentCode(paymentCode);
      setDecodeResult({ status: "success", data: { paymentCode: data.paymentCode, decoded: data.decoded } });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Invalid payment code";
      // backend returns 400 with isValid false; ApiError will contain message
      setDecodeResult({ status: "error", message: msg });
      setDecodeError(msg);
    }
  }

  async function handleCreateTemplate() {
    const pubkeyHex = templatePubkey.trim();
    const paymentCode = templatePaymentCode.trim();
    if (!pubkeyHex || !paymentCode) {
      setTemplateState({ status: "error", message: "Both 64-hex pubkey and paymentCode are required." });
      return;
    }
    if (!/^[0-9a-fA-F]{64}$/.test(pubkeyHex)) {
      setTemplateState({ status: "error", message: "pubkeyHex must be 64 hex characters (Nostr public key)." });
      return;
    }
    setTemplateState({ status: "loading" });
    try {
      const data = await createPaymentCodeTemplate({ pubkeyHex: pubkeyHex.toLowerCase(), paymentCode });
      setTemplateState({ status: "success", data });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Template creation failed";
      setTemplateState({ status: "error", message: msg });
    }
  }

  async function handleVerify() {
    const raw = verifyJson.trim();
    if (!raw) {
      setVerifyState({ status: "error", message: "Paste a Nostr event JSON object." });
      return;
    }
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      setVerifyState({ status: "error", message: "Invalid JSON — event must be a valid JSON object." });
      return;
    }
    setVerifyState({ status: "loading" });
    try {
      const data = await verifyNostrEvent(event);
      setVerifyState({ status: "success", data });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Verification failed";
      setVerifyState({ status: "error", message: msg });
    }
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="identity-heading" className="rounded-lg border border-zinc-200 bg-white p-6">
        <h1 id="identity-heading" className="text-xl font-semibold text-zinc-900">
          Identity
        </h1>
        <p className="mt-2 max-w-prose text-sm text-zinc-600">
          Manage your public Nostr identity and BIP47 payment codes. All signing stays in your browser (e.g. NIP-07
          extension). Never paste an <span className="font-medium">nsec</span>, seed phrase, or private key — only
          public values are sent to the backend.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleLoadDemo}
            disabled={demoLoading}
            className="rounded-md border border-zinc-200 bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {demoLoading ? "Loading demo..." : "Load demo test vector (Alice)"}
          </button>
          <span className="self-center text-xs text-zinc-500">
            Deterministic demo from <code className="rounded bg-zinc-100 px-1">GET /api/crypto/demo-pair</code> — not a real user.
          </span>
        </div>
        <div className="mt-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
          Privacy note: Payment codes (<code>PM8...</code>) are public. The backend never receives private keys. Event
          templates are <span className="font-medium">unsigned</span> until you sign locally.
        </div>
      </section>

      {/* Resolve */}
      <Section
        title="Resolve Payment Code"
        description="Enter an npub (npub1...) or 64-hex Nostr pubkey to look up a published BIP47 payment code over public relays (kind 30078). Uses GET /api/nostr/resolve/:npub."
      >
        <div className="space-y-2">
          <label htmlFor="resolve-input" className="block text-sm font-medium text-zinc-700">
            Nostr identity (npub or hex)
          </label>
          <input
            id="resolve-input"
            type="text"
            value={resolveInput}
            onChange={(e) => setResolveInput(e.target.value)}
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
            {resolveState.status === "loading" ? "Resolving..." : "Resolve"}
          </button>
        </div>

        {resolveState.status === "idle" && <p className="text-sm text-zinc-500">No lookup yet.</p>}
        {resolveState.status === "loading" && <p className="text-sm text-zinc-500">Loading...</p>}
        {resolveState.status === "error" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{resolveState.message}</p>
          </div>
        )}
        {resolveState.status === "success" && (
          <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="text-zinc-500">Success</dt>
                <dd className={resolveState.data.success ? "text-green-700" : "text-amber-700"}>
                  {resolveState.data.success ? "Found" : "Not found"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">npub</dt>
                <dd className="break-all font-mono text-xs text-zinc-800">{resolveState.data.npub}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Hex pubkey</dt>
                <dd className="break-all font-mono text-xs text-zinc-800">{resolveState.data.hexPubkey}</dd>
              </div>
              {resolveState.data.paymentCode && (
                <div>
                  <dt className="text-zinc-500">Payment code</dt>
                  <dd className="flex items-center gap-2">
                    <span className="break-all font-mono text-xs text-zinc-800">{resolveState.data.paymentCode}</span>
                    <CopyButton text={resolveState.data.paymentCode} />
                  </dd>
                </div>
              )}
              {resolveState.data.discoveredOnRelay && (
                <div>
                  <dt className="text-zinc-500">Discovered on relay</dt>
                  <dd className="font-mono text-xs text-zinc-800">{resolveState.data.discoveredOnRelay}</dd>
                </div>
              )}
              {resolveState.data.message && (
                <div>
                  <dt className="text-zinc-500">Message</dt>
                  <dd className="text-xs text-zinc-700">{resolveState.data.message}</dd>
                </div>
              )}
              {resolveState.data.checkedRelays && (
                <div>
                  <dt className="text-zinc-500">Checked relays</dt>
                  <dd className="break-all text-xs text-zinc-600">{resolveState.data.checkedRelays.join(", ")}</dd>
                </div>
              )}
              {resolveState.data.errors && resolveState.data.errors.length > 0 && (
                <div>
                  <dt className="text-zinc-500">Relay errors</dt>
                  <dd className="text-xs text-zinc-600">{resolveState.data.errors.join("; ")}</dd>
                </div>
              )}
            </dl>
            {resolveState.data.event != null && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-zinc-700">Show raw event</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-2 text-xs font-mono">
                  {JSON.stringify(resolveState.data.event, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </Section>

      {/* Encode / Decode */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Encode Payment Code"
          description="Encode a 33-byte compressed public key (66 hex) + optional 32-byte chaincode (64 hex) into a PM8... payment code. Uses POST /api/crypto/bip47/encode. No private key needed."
        >
          <div>
            <label htmlFor="encode-pubkey" className="block text-sm font-medium text-zinc-700">
              Compressed pubkeyHex (33 bytes, 02/03 prefix)
            </label>
            <input
              id="encode-pubkey"
              type="text"
              value={encodePubkey}
              onChange={(e) => setEncodePubkey(e.target.value)}
              placeholder="02... or 03... (66 hex chars)"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor="encode-chaincode" className="block text-sm font-medium text-zinc-700">
              Chaincode hex (optional, 64 hex chars)
            </label>
            <input
              id="encode-chaincode"
              type="text"
              value={encodeChaincode}
              onChange={(e) => setEncodeChaincode(e.target.value)}
              placeholder="Leave empty to let backend generate random"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="button"
            onClick={handleEncode}
            disabled={encodeState.status === "loading"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {encodeState.status === "loading" ? "Encoding..." : "Encode"}
          </button>

          {encodeState.status === "idle" && <p className="text-sm text-zinc-500">No encode yet.</p>}
          {encodeState.status === "error" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{encodeState.message}</p>
            </div>
          )}
          {encodeState.status === "success" && (
            <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="break-all font-mono text-xs text-zinc-800">{encodeState.data.paymentCode}</p>
              <div className="flex gap-2">
                <CopyButton text={encodeState.data.paymentCode} label="Copy payment code" />
              </div>
              <p className="text-xs text-zinc-500">pubkey: {encodeState.data.pubkeyHex}</p>
              {encodeState.data.chaincodeHex && (
                <p className="break-all text-xs text-zinc-500">chaincode: {encodeState.data.chaincodeHex}</p>
              )}
            </div>
          )}
        </Section>

        <Section
          title="Decode & Validate Payment Code"
          description="Validate a PM8... string and inspect its version, features, pubkey, and chaincode. Uses POST /api/crypto/bip47/decode."
        >
          <div>
            <label htmlFor="decode-input" className="block text-sm font-medium text-zinc-700">
              Payment code
            </label>
            <input
              id="decode-input"
              type="text"
              value={decodeInput}
              onChange={(e) => setDecodeInput(e.target.value)}
              placeholder="PM8..."
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="button"
            onClick={handleDecode}
            disabled={decodeResult.status === "loading"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {decodeResult.status === "loading" ? "Decoding..." : "Decode"}
          </button>

          {decodeResult.status === "idle" && !decodeError && (
            <p className="text-sm text-zinc-500">No decode yet.</p>
          )}
          {decodeResult.status === "loading" && <p className="text-sm text-zinc-500">Loading...</p>}
          {decodeResult.status === "error" && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-800">{decodeResult.message}</p>
            </div>
          )}
          {decodeResult.status === "success" && (
            <dl className="space-y-1 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
              <div>
                <dt className="text-zinc-500">Version</dt>
                <dd className="font-mono text-xs text-zinc-800">{decodeResult.data.decoded.version}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Features</dt>
                <dd className="font-mono text-xs text-zinc-800">{decodeResult.data.decoded.features}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Pubkey</dt>
                <dd className="break-all font-mono text-xs text-zinc-800">{decodeResult.data.decoded.pubkey}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Chaincode</dt>
                <dd className="break-all font-mono text-xs text-zinc-800">{decodeResult.data.decoded.chaincode}</dd>
              </div>
            </dl>
          )}
          {decodeError && decodeResult.status !== "loading" && decodeResult.status !== "success" && (
            <p className="text-sm text-red-700">{decodeError}</p>
          )}
        </Section>
      </div>

      {/* Template */}
      <Section
        title="Payment Code Event Template"
        description="Generate an unsigned Nostr kind 30078 event to publish your payment code. Uses POST /api/nostr/template/payment-code. Sign locally with NIP-07 — do not paste nsec."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="template-pubkey" className="block text-sm font-medium text-zinc-700">
              Nostr pubkeyHex (64 hex, lowercase)
            </label>
            <input
              id="template-pubkey"
              type="text"
              value={templatePubkey}
              onChange={(e) => setTemplatePubkey(e.target.value)}
              placeholder="64-char hex"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label htmlFor="template-pc" className="block text-sm font-medium text-zinc-700">
              Payment code (PM8...)
            </label>
            <input
              id="template-pc"
              type="text"
              value={templatePaymentCode}
              onChange={(e) => setTemplatePaymentCode(e.target.value)}
              placeholder="PM8..."
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleCreateTemplate}
          disabled={templateState.status === "loading"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {templateState.status === "loading" ? "Generating..." : "Generate template"}
        </button>

        {templateState.status === "idle" && <p className="text-sm text-zinc-500">No template yet.</p>}
        {templateState.status === "error" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{templateState.message}</p>
          </div>
        )}
        {templateState.status === "success" && (
          <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs text-zinc-600">{templateState.data.instructions}</p>
            <pre className="max-h-64 overflow-auto rounded bg-white p-3 text-xs font-mono">
              {JSON.stringify(templateState.data.template, null, 2)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={JSON.stringify(templateState.data.template, null, 2)} label="Copy template JSON" />
            </div>
            <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-medium">Publication status: Not yet implemented</p>
              <p className="mt-1">
                This frontend does not yet publish to relays. To publish, sign the template with a NIP-07 browser
                extension (e.g. nos2x, Alby) via <code className="rounded bg-amber-100 px-1">window.nostr.signEvent</code>{" "}
                and publish to relays directly. Never send your nsec to the backend.
              </p>
            </div>
          </div>
        )}
      </Section>

      {/* Verify */}
      <Section
        title="Verify Nostr Event"
        description="Verify a signed Nostr event's Schnorr signature. Uses POST /api/nostr/verify-event. Paste the full signed event JSON (with id, pubkey, sig)."
      >
        <div>
          <label htmlFor="verify-json" className="block text-sm font-medium text-zinc-700">
            Event JSON
          </label>
          <textarea
            id="verify-json"
            value={verifyJson}
            onChange={(e) => setVerifyJson(e.target.value)}
            placeholder='{"id":"...","pubkey":"...","sig":"...",...}'
            rows={6}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-sm"
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifyState.status === "loading"}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {verifyState.status === "loading" ? "Verifying..." : "Verify signature"}
        </button>

        {verifyState.status === "idle" && <p className="text-sm text-zinc-500">No verification yet.</p>}
        {verifyState.status === "error" && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{verifyState.message}</p>
          </div>
        )}
        {verifyState.status === "success" && (
          <div
            className={`rounded-md border p-4 ${verifyState.data.isValid ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}
          >
            <p className={`text-sm font-medium ${verifyState.data.isValid ? "text-green-800" : "text-amber-800"}`}>
              {verifyState.data.isValid ? "Valid signature ✓" : "Invalid signature — verification failed"}
            </p>
            <dl className="mt-2 space-y-1 text-xs">
              <div>
                <dt className="text-zinc-500">Event ID</dt>
                <dd className="break-all font-mono text-zinc-800">{verifyState.data.eventId}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Pubkey</dt>
                <dd className="break-all font-mono text-zinc-800">{verifyState.data.pubkey}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Kind</dt>
                <dd className="text-zinc-800">{verifyState.data.kind}</dd>
              </div>
            </dl>
          </div>
        )}
      </Section>

      <p className="text-xs text-zinc-500">
        Need help? Try the demo vector above, then replace with your own public npub/payment code. Private keys never
        leave the browser.
      </p>
    </div>
  );
}
