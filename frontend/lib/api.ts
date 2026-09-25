/**
 * Silent Ledger — Typed API layer
 * Uses exactly NEXT_PUBLIC_API_URL (verified in frontend/.env.local)
 * Every helper maps 1:1 to an actual backend route — no invented endpoints.
 * Verified against backend/src/server.js and backend/src/routes/*.js
 */

import type {
  HealthResponse,
  BtcUtxosResponse,
  BtcTxsResponse,
  BtcTxResponse,
  FeesResponse,
  BroadcastResponse,
  NostrRelaysResponse,
  NostrResolveResponse,
  NostrPaymentCodeTemplateResponse,
  NostrHandshakeResponse,
  NostrVerifyEventResponse,
  Bip47EncodeResponse,
  Bip47DecodeSuccessResponse,
  DeriveSequenceResponse,
  DemoPairResponse,
  AiAnalyzeResponse,
  AiChatResponse,
  SimulatedWalletBadResponse,
  SimulatedWalletCleanResponse,
  AliceBobFlowResponse,
  DbStatusResponse,
  ContactsListResponse,
  ContactResponse,
  ChannelsListResponse,
  ChannelResponse,
  AuditsListResponse,
  AuditCreateResponse,
  SignupResponse,
  LoginResponse,
  ClearAllResponse,
  PrivacyFlag,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ---------------------------------------------------------------------------
// Typed error class — preserves backend error shape
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;
  field?: string;
  body?: unknown;

  constructor(
    message: string,
    opts: { status: number; code?: string; detail?: string; field?: string; body?: unknown }
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.detail = opts.detail;
    this.field = opts.field;
    this.body = opts.body;
  }
}

// ---------------------------------------------------------------------------
// Core fetch helper — handles HTTP errors, invalid JSON, network failures
// ---------------------------------------------------------------------------
async function apiFetch<T>(endpoint: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, init);
  } catch (err) {
    throw new ApiError(err instanceof Error ? err.message : "Network request failed", {
      status: 0,
      body: null,
    });
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new ApiError(`Invalid JSON response (HTTP ${response.status})`, {
          status: response.status,
          body: text,
        });
      }
      throw new ApiError("Invalid JSON response from server", {
        status: response.status,
        body: text,
      });
    }
  }

  if (!response.ok) {
    const body = (data as Record<string, unknown>) || {};
    const message =
      (body.message as string) ||
      (body.error as string) ||
      `API request failed: ${response.status}`;
    throw new ApiError(message, {
      status: response.status,
      code: body.code as string | undefined,
      detail: body.detail as string | undefined,
      field: body.field as string | undefined,
      body: data,
    });
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Low-level generic helpers (kept for flexibility, now error-typed)
// ---------------------------------------------------------------------------
export async function apiGet<T>(endpoint: string): Promise<T> {
  return apiFetch<T>(endpoint, { method: "GET" });
}

export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiDelete<T>(endpoint: string): Promise<T> {
  return apiFetch<T>(endpoint, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Health — backend/src/server.js:32
// ---------------------------------------------------------------------------
export function getHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>("/api/health");
}

// ---------------------------------------------------------------------------
// Bitcoin — backend/src/routes/btc.routes.js
// ---------------------------------------------------------------------------
export function getBtcUtxos(address: string): Promise<BtcUtxosResponse> {
  return apiGet<BtcUtxosResponse>(`/api/btc/address/${encodeURIComponent(address)}/utxos`);
}

export function getBtcTxs(address: string): Promise<BtcTxsResponse> {
  return apiGet<BtcTxsResponse>(`/api/btc/address/${encodeURIComponent(address)}/txs`);
}

export function getBtcTx(txid: string): Promise<BtcTxResponse> {
  return apiGet<BtcTxResponse>(`/api/btc/tx/${encodeURIComponent(txid)}`);
}

export function getBtcFees(): Promise<FeesResponse> {
  return apiGet<FeesResponse>("/api/btc/fees");
}

export function broadcastTx(rawTx: string): Promise<BroadcastResponse> {
  return apiPost<BroadcastResponse>("/api/btc/broadcast", { rawTx });
}

// ---------------------------------------------------------------------------
// Nostr — backend/src/routes/nostr.routes.js
// ---------------------------------------------------------------------------
export function getNostrRelays(): Promise<NostrRelaysResponse> {
  return apiGet<NostrRelaysResponse>("/api/nostr/relays");
}

export function resolveNpub(npub: string): Promise<NostrResolveResponse> {
  return apiGet<NostrResolveResponse>(`/api/nostr/resolve/${encodeURIComponent(npub)}`);
}

export function createPaymentCodeTemplate(params: {
  pubkeyHex: string;
  paymentCode: string;
}): Promise<NostrPaymentCodeTemplateResponse> {
  return apiPost<NostrPaymentCodeTemplateResponse>("/api/nostr/template/payment-code", params);
}

export function createNip17HandshakeTemplate(params: {
  senderPubkeyHex: string;
  receiverPubkeyHex: string;
  senderPaymentCode: string;
}): Promise<NostrHandshakeResponse> {
  return apiPost<NostrHandshakeResponse>("/api/nostr/template/nip17-handshake", params);
}

export function verifyNostrEvent(event: unknown): Promise<NostrVerifyEventResponse> {
  return apiPost<NostrVerifyEventResponse>("/api/nostr/verify-event", { event });
}

// ---------------------------------------------------------------------------
// Crypto — backend/src/routes/crypto.routes.js
// ---------------------------------------------------------------------------
export function encodePaymentCode(params: {
  pubkeyHex: string;
  chaincodeHex?: string;
}): Promise<Bip47EncodeResponse> {
  return apiPost<Bip47EncodeResponse>("/api/crypto/bip47/encode", params);
}

export function decodePaymentCode(paymentCode: string): Promise<Bip47DecodeSuccessResponse> {
  return apiPost<Bip47DecodeSuccessResponse>("/api/crypto/bip47/decode", { paymentCode });
}

export type DeriveSequenceParams = {
  receiverPaymentCode: string;
  sharedSecretHex: string;
  count?: number;
  startIndex?: number;
  addressType?: "p2wpkh" | "p2pkh" | "p2tr";
  network?: "testnet" | "mainnet";
};

/**
 * Derive sequence via backend — DEMO / TEST VECTORS ONLY.
 * Never call this with a real user's sharedSecretHex. Real derivation must happen client-side.
 * See backend/src/routes/crypto.routes.js:67 and Phase 2 constraints.
 */
export function deriveSequenceDemoOnly(params: DeriveSequenceParams): Promise<DeriveSequenceResponse> {
  return apiPost<DeriveSequenceResponse>("/api/crypto/ecdh/derive-sequence", params);
}

export function getDemoPair(): Promise<DemoPairResponse> {
  return apiGet<DemoPairResponse>("/api/crypto/demo-pair");
}

// ---------------------------------------------------------------------------
// AI Coach — backend/src/routes/ai.routes.js
// ---------------------------------------------------------------------------
export function coachAnalyze(params: {
  score: number;
  grade?: string;
  flags?: PrivacyFlag[];
  summary?: Record<string, unknown>;
  userMessage?: string | null;
}): Promise<AiAnalyzeResponse> {
  return apiPost<AiAnalyzeResponse>("/api/ai/coach/analyze", params);
}

export function coachChat(params: {
  message: string;
  score?: number;
  grade?: string;
  flags?: PrivacyFlag[];
  conversationHistory?: unknown[];
}): Promise<AiChatResponse> {
  return apiPost<AiChatResponse>("/api/ai/coach/chat", params);
}

// ---------------------------------------------------------------------------
// Scenarios — backend/src/routes/scenario.routes.js
// ---------------------------------------------------------------------------
export function getSimulatedWalletBad(): Promise<SimulatedWalletBadResponse> {
  return apiGet<SimulatedWalletBadResponse>("/api/scenarios/simulated-wallet-bad");
}

export function getSimulatedWalletClean(): Promise<SimulatedWalletCleanResponse> {
  return apiGet<SimulatedWalletCleanResponse>("/api/scenarios/simulated-wallet-clean");
}

export function getAliceBobFlow(): Promise<AliceBobFlowResponse> {
  return apiGet<AliceBobFlowResponse>("/api/scenarios/alice-bob-flow");
}

// ---------------------------------------------------------------------------
// DB — backend/src/routes/db.routes.js
// ---------------------------------------------------------------------------
export function getDbStatus(): Promise<DbStatusResponse> {
  return apiGet<DbStatusResponse>("/api/db/status");
}

export function getContacts(): Promise<ContactsListResponse> {
  return apiGet<ContactsListResponse>("/api/db/contacts");
}

export function createContact(params: {
  npub: string;
  paymentCode: string;
  hexPubkey?: string;
  alias?: string;
  notes?: string;
  relaySource?: string;
}): Promise<ContactResponse> {
  return apiPost<ContactResponse>("/api/db/contacts", params);
}

export function getContact(npub: string): Promise<ContactResponse> {
  return apiGet<ContactResponse>(`/api/db/contacts/${encodeURIComponent(npub)}`);
}

export function deleteContact(npub: string): Promise<{ success: true; message: string }> {
  return apiDelete<{ success: true; message: string }>(`/api/db/contacts/${encodeURIComponent(npub)}`);
}

export function getChannels(): Promise<ChannelsListResponse> {
  return apiGet<ChannelsListResponse>("/api/db/channels");
}

export function createChannel(params: {
  channelId: string;
  senderNpub: string;
  receiverNpub: string;
  senderPaymentCode?: string;
  receiverPaymentCode?: string;
  derivedAddresses?: unknown[];
}): Promise<ChannelResponse> {
  return apiPost<ChannelResponse>("/api/db/channels", params);
}

export function getAudits(): Promise<AuditsListResponse> {
  return apiGet<AuditsListResponse>("/api/db/audits");
}

export function createAudit(params: {
  walletTag?: string;
  score: number;
  grade?: string;
  flags?: PrivacyFlag[];
  summary?: Record<string, unknown>;
  aiCoachAnalysis?: string;
  aiProvider?: string;
}): Promise<AuditCreateResponse> {
  return apiPost<AuditCreateResponse>("/api/db/audits", params);
}

// ---------------------------------------------------------------------------
// Auth — backend/src/routes/auth.routes.js
// ---------------------------------------------------------------------------
export function signup(params: { email: string; password: string }): Promise<SignupResponse> {
  return apiPost<SignupResponse>("/api/signup", params);
}

export function login(params: { email: string; password: string }): Promise<LoginResponse> {
  return apiPost<LoginResponse>("/api/login", params);
}

export function clearAllUsers(): Promise<ClearAllResponse> {
  return apiDelete<ClearAllResponse>("/api/users/clear-all");
}
