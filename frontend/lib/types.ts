/**
 * Silent Ledger — Shared frontend types
 * Derived strictly from actual backend source in backend/src/*
 * Do not invent fields. Shapes mirror Express response JSON verbatim.
 */

// ---------------------------------------------------------------------------
// Generic error shape — backend/src/middleware/errorHandler.js + privacyGuard.js
// ---------------------------------------------------------------------------
export type ApiErrorBody = {
  success: false;
  error: string;
  message: string;
  code?: string; // e.g. "PRIVACY_GUARD_BLOCKED"
  detail?: string;
  field?: string;
  timestamp?: string;
};

// ---------------------------------------------------------------------------
// Health — backend/src/server.js:32-44 + backend/src/services/db.service.js:61-72
// ---------------------------------------------------------------------------
export type DbState = {
  status: string;
  connected: boolean;
  hasPlaceholder: boolean;
  configured: boolean;
  database: string;
};

export type HealthResponse = {
  status: string;
  project: string;
  version: string;
  description: string;
  mempoolTestnet: string;
  relaysConfigured: number;
  aiProvider: string;
  database: DbState;
  timestamp: string;
};

// ---------------------------------------------------------------------------
// Bitcoin — backend/src/routes/btc.routes.js + backend/src/services/mempool.service.js
// ---------------------------------------------------------------------------
export type BtcUtxo = {
  txid: string;
  vout: number;
  value: number;
  status?: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  // Allow mempool additional fields
  [key: string]: unknown;
};

export type BtcUtxosResponse = {
  success: true;
  address: string;
  utxoCount: number;
  utxos: BtcUtxo[];
};

export type BtcTxsResponse = {
  success: true;
  address: string;
  txCount: number;
  txs: unknown[];
};

export type BtcTxResponse = {
  success: true;
  tx: unknown;
};

export type FeesResponse = {
  success: true;
  fees: {
    fastestFee: number;
    halfHourFee: number;
    hourFee: number;
    economyFee?: number;
    minimumFee: number;
    [key: string]: number | undefined;
  };
};

export type BroadcastResponse = {
  success: true;
  txid: string;
};

// ---------------------------------------------------------------------------
// Nostr — backend/src/routes/nostr.routes.js + backend/src/services/nostr.service.js
// ---------------------------------------------------------------------------
export type RelayHealthEntry = {
  url: string;
  status: string;
  latencyMs?: number;
  online: boolean;
  error?: string;
};

export type RelayHealth = {
  relays: RelayHealthEntry[];
  onlineCount: number;
  totalCount: number;
};

export type NostrRelaysResponse = {
  success: true;
  defaultRelays: string[];
  health: RelayHealth;
};

export type NostrResolveResponse = {
  success: boolean;
  hexPubkey: string;
  npub: string;
  paymentCode: string | null;
  event?: unknown;
  discoveredOnRelay?: string;
  message?: string;
  checkedRelays?: string[];
  errors?: string[];
};

export type NostrEventTemplate = {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
};

export type NostrPaymentCodeTemplateResponse = {
  success: true;
  template: NostrEventTemplate;
  instructions: string;
};

export type Nip17Rumor = {
  kind: number;
  created_at: number;
  pubkey: string;
  tags: string[][];
  content: string;
};

export type NostrHandshake = {
  description: string;
  rumor: Nip17Rumor;
  flow: string[];
};

export type NostrHandshakeResponse = {
  success: true;
  handshake: NostrHandshake;
};

export type NostrVerifyEventResponse = {
  success: true;
  isValid: boolean;
  eventId: string;
  pubkey: string;
  kind: number;
};

// ---------------------------------------------------------------------------
// Crypto — backend/src/routes/crypto.routes.js + backend/src/services/bip47.service.js
// ---------------------------------------------------------------------------
export type Bip47EncodeResponse = {
  success: true;
  paymentCode: string;
  pubkeyHex: string;
  chaincodeHex?: string;
};

export type Bip47DecodeSuccessResponse = {
  success: true;
  paymentCode: string;
  isValid: true;
  decoded: {
    version: number;
    features: number;
    pubkey: string;
    chaincode: string;
  };
};

export type Bip47DecodeErrorResponse = {
  success: false;
  isValid: false;
  error: string;
};

export type DerivedAddress = {
  index: number;
  address: string;
  derivedPubkey: string;
  tweak: string;
  addressType: string;
  network: string;
};

export type DeriveSequenceResponse = {
  success: true;
  receiverPaymentCode: string;
  addressType: string;
  network: string;
  count: number;
  addresses: DerivedAddress[];
};

export type DemoPairAddress = {
  index: number;
  address: string;
};

export type DemoPairResponse = {
  success: true;
  description: string;
  alice: {
    name: string;
    npub: string;
    nostrPubkeyHex: string;
    paymentCode: string;
    pubkeyHex: string;
  };
  bob: {
    name: string;
    npub: string;
    nostrPubkeyHex: string;
    paymentCode: string;
    pubkeyHex: string;
  };
  ecdh: {
    sharedSecretHex: string;
    secretsMatchParity: boolean;
  };
  derivedAddressesMatch: boolean;
  addresses: DemoPairAddress[];
};

// ---------------------------------------------------------------------------
// AI Coach — backend/src/routes/ai.routes.js + backend/src/services/aiCoach.service.js
// ---------------------------------------------------------------------------
export type PrivacyFlag = {
  type: string;
  severity: string;
  penalty: number;
  title: string;
  details: string;
  evidence?: unknown;
  chainAnalysisRisk?: string;
};

export type AuditSummary = {
  totalUtxos: number;
  reusedAddressCount: number;
  dustCount: number;
  scriptTypesFound: string[];
  ciohVulnerable: boolean;
};

export type AuditResult = {
  score: number;
  grade: string;
  isPristine: boolean;
  summary: AuditSummary;
  flags: PrivacyFlag[];
  analyzedAt: string;
};

export type AiAnalyzeData = {
  provider: string;
  score: number;
  grade: string;
  analysis: string;
  timestamp: string;
};

export type AiAnalyzeResponse = {
  success: true;
  data: AiAnalyzeData;
};

export type AiChatData = {
  reply: string;
  provider: string;
  timestamp: string;
};

export type AiChatResponse = {
  success: true;
  data: AiChatData;
};

// ---------------------------------------------------------------------------
// Scenarios — backend/src/routes/scenario.routes.js
// ---------------------------------------------------------------------------
export type SimulatedUtxo = {
  txid: string;
  vout: number;
  address: string;
  value: number;
  label?: string;
};

export type SimulatedWalletBadResponse = {
  success: true;
  scenario: string;
  description: string;
  totalBalanceSats: number;
  utxos: SimulatedUtxo[];
  audit: AuditResult;
};

export type SimulatedWalletCleanResponse = {
  success: true;
  scenario: string;
  description: string;
  totalBalanceSats: number;
  utxos: SimulatedUtxo[];
  audit: AuditResult;
};

export type AliceBobFlowStep = {
  step: number;
  title: string;
  actor: string;
  action: string;
  data: Record<string, unknown>;
};

export type AliceBobFlowResponse = {
  success: true;
  title: string;
  steps: AliceBobFlowStep[];
};

// ---------------------------------------------------------------------------
// DB — backend/src/routes/db.routes.js
// ---------------------------------------------------------------------------
export type DbStatusResponse = {
  success: true;
  status: string;
  connected: boolean;
  hasPlaceholder: boolean;
  configured: boolean;
  database: string;
  counts: { contacts: number; channels: number; audits: number } | null;
  message?: string;
  error?: string;
};

export type Contact = {
  _id?: string;
  npub: string;
  hexPubkey?: string;
  paymentCode: string;
  alias?: string;
  notes?: string;
  relaySource?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type ContactsListResponse = {
  success: true;
  count: number;
  contacts: Contact[];
};

export type ContactResponse = {
  success: true;
  contact: Contact;
};

export type HandshakeChannel = {
  _id?: string;
  channelId: string;
  senderNpub: string;
  receiverNpub: string;
  senderPaymentCode?: string;
  receiverPaymentCode?: string;
  derivedAddresses?: unknown[];
  lastDerivedIndex?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type ChannelsListResponse = {
  success: true;
  count: number;
  channels: HandshakeChannel[];
};

export type ChannelResponse = {
  success: true;
  channel: HandshakeChannel;
};

export type AuditRecord = {
  _id?: string;
  walletTag?: string;
  score: number;
  grade?: string;
  flags?: PrivacyFlag[];
  summary?: Record<string, unknown>;
  aiCoachAnalysis?: string;
  aiProvider?: string;
  createdAt?: string;
  [key: string]: unknown;
};

export type AuditsListResponse = {
  success: true;
  count: number;
  audits: AuditRecord[];
};

export type AuditCreateResponse = {
  success: true;
  audit: AuditRecord;
};

// ---------------------------------------------------------------------------
// Auth — backend/src/routes/auth.routes.js
// ---------------------------------------------------------------------------
export type SignupResponse = {
  success: true;
  message: string;
  user: {
    id: string;
    email: string;
    createdAt: string;
  };
};

export type LoginResponse = {
  success: true;
  message: string;
  user: {
    id: string;
    email: string;
  };
};

export type ClearAllResponse = {
  success: true;
  message: string;
  deletedCount: number;
};
