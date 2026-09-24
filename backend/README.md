# 🛡️ Silent Ledger — Backend (Express.js)

> **A Privacy-First Payment Layer for Bitcoin discovered over Nostr**
> Built for the Bitcoin × Nostr × AI Hackathon.

Silent Ledger closes the loop that ordinary Bitcoin wallets leave open. It eliminates address reuse, removes on-chain notification transactions using encrypted Nostr handshakes (NIP-17), and features an AI Privacy Coach that audits on-chain habits and explains leaks in plain English.

---

## 🏛️ Core Architectural Invariant: Zero-Knowledge Server

Per the project specification:
> **"No backend server should ever receive raw wallet data, xpubs, or private keys."**

The Silent Ledger Express backend enforces this mathematically and via active middleware:
- **`privacyGuard` Middleware**: Actively blocks requests containing Bitcoin private keys (WIF), extended keys (`xprv`/`tprv`), seed phrases (BIP39), or `xpub`/`tpub` sent to AI endpoints with an immediate `HTTP 400 Bad Request` (`PRIVACY_GUARD_BLOCKED`).
- **AI Privacy Coach**: Operates strictly on sanitized metrics (`score`, `grade`, `flags`, `summary`) computed client-side.
- **Client Autonomy**: Key generation, ECDH shared secrets, and one-time address derivations can run entirely in the browser, while the backend provides reference verification, relay proxying, mempool caching, and the AI coaching engine.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` (already pre-configured with testnet defaults):
```bash
PORT=4000
MEMPOOL_API_BASE=https://mempool.space/testnet/api
NOSTR_RELAYS=wss://nos.lol,wss://relay.primal.net,wss://relay.damus.io
SILENT_LEDGER_NOSTR_KIND=30078
# Optional: GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY
# (The backend has a built-in expert Bitcoin privacy tutor engine that works with 0 API keys!)
```

### 3. Run Automated Tests
```bash
npm test
```
All 11 unit and integration tests will verify BIP47 encoding, ECDH address parity, the Zero-Knowledge Privacy Guard, simulated demo scenarios, and AI coach responses.

### 4. Start the Express Server
```bash
npm start
# or for live reloading:
npm run dev
```

Server runs on: **`http://localhost:4000`**

---

## 🌐 Interactive Web Demo & Test Dashboard

Opening `http://localhost:4000` in your browser launches the built-in **Silent Ledger Test Harness**:
1. **Alice & Bob Handshake Simulation**: Real-time ECDH derivation showing Alice & Bob deriving identical one-time addresses #0..#4 with 100% cryptographic parity.
2. **Privacy Dashboard & Leak Simulator**:
   - 🚨 *Vulnerable Wallet Demo*: 4 on-chain mistakes (Address reuse, 546-sat dust attack, script-type mixing, and CIOH co-spend risk) -> Score: 20/100.
   - 🛡️ *Clean Silent Ledger Wallet*: Fresh ECDH one-time addresses -> Score: 100/100.
3. **AI Privacy Coach**: Interactive chat panel and leak analysis tutor explaining the deanonymization mechanics and 4 concrete steps to fix them.
4. **Nostr Relays & Bitcoin Testnet**: Live latency check for public relays and recommended testnet fees.
5. **Zero-Knowledge Firewall Proof**: Live buttons attempting to send xpubs and private keys to demonstrate the firewall blocking them.

---

## 📡 REST API Reference

### 🧠 1. AI Privacy Coach (`/api/ai/coach`)
- `POST /api/ai/coach/analyze`
  - Explains privacy score and detected flags in conversational tutor English.
  - Body:
    ```json
    {
      "score": 28,
      "grade": "CRITICAL LEAK",
      "flags": [
        { "type": "ADDRESS_REUSE", "severity": "CRITICAL", "penalty": 30, "details": "..." },
        { "type": "DUST_ATTACK", "severity": "HIGH", "penalty": 15, "details": "..." }
      ]
    }
    ```
- `POST /api/ai/coach/chat`
  - Interactive Q&A with the coach about Bitcoin privacy, Nostr NIP-17, and coin control.
  - Body: `{ "message": "Why is address reuse dangerous?" }`

### 🤝 2. BIP47 & ECDH Cryptography (`/api/crypto`)
- `GET /api/crypto/demo-pair`
  - Returns deterministic Alice & Bob test vectors proving 100% ECDH address parity.
- `POST /api/crypto/bip47/encode`
  - Encodes compressed 33-byte public key and 32-byte chaincode into a `PM8T...` payment code.
- `POST /api/crypto/bip47/decode`
  - Validates and unpacks a BIP47 payment code.
- `POST /api/crypto/ecdh/derive-sequence`
  - Derives a sequence of one-time addresses (#0, #1, #2...) given receiver payment code and shared secret hex.

### 🟣 3. Nostr Discovery & Handshake (`/api/nostr`)
- `GET /api/nostr/relays`
  - Checks live websocket availability and latency for default public relays.
- `GET /api/nostr/resolve/:npub`
  - Queries public relays for kind 30078 payment codes advertised by an npub.
- `POST /api/nostr/template/payment-code`
  - Generates unsigned kind 30078 event template for the user to sign locally.
- `POST /api/nostr/template/nip17-handshake`
  - Generates NIP-17 encrypted Gift Wrap blueprint for private payment channel initiation.
- `POST /api/nostr/verify-event`
  - Cryptographically verifies Schnorr signatures on Nostr events.

### 🎭 4. Demo Scenarios (`/api/scenarios`)
- `GET /api/scenarios/simulated-wallet-bad`
  - Pre-configured wallet exhibiting all 4 privacy leaks for the 3-minute hackathon demo script.
- `GET /api/scenarios/simulated-wallet-clean`
  - Pristine wallet utilizing BIP47 one-time addresses.
- `GET /api/scenarios/alice-bob-flow`
  - Complete 5-step walkthrough of Alice & Bob's Nostr discovery, NIP-17 handshake, and one-time payment.

### ⚡ 5. Bitcoin Testnet Explorer Proxy (`/api/btc`)
- `GET /api/btc/address/:address/utxos` (Cached proxy to prevent CORS issues)
- `GET /api/btc/address/:address/txs`
- `GET /api/btc/tx/:txid`
- `GET /api/btc/fees`
- `POST /api/btc/broadcast` (Broadcast signed hex tx)

### 🍃 6. MongoDB Atlas Persistence (`/api/db`)
- `GET /api/db/status`: Check MongoDB cluster connection status and collection document counts.
- `GET /api/db/contacts` / `POST /api/db/contacts`: Store & retrieve discovered Nostr contacts (`npub` -> `paymentCode` mapping).
- `GET /api/db/channels` / `POST /api/db/channels`: Track private NIP-17 handshake channels and one-time address sequence indices.
- `GET /api/db/audits` / `POST /api/db/audits`: Store zero-knowledge wallet privacy audits and AI coach explanations.

---

## 🧪 Unit & Integration Tests

```bash
npm test
```
Outputs:
```
  ✅ GET /api/health should return online status
  ✅ BIP47 Service encodes and decodes payment codes correctly
  ✅ Alice & Bob derive identical one-time receiving addresses (ECDH parity)
  ✅ POST /api/crypto/ecdh/derive-sequence derives address list
  ✅ Zero-Knowledge Guard blocks xpub from being sent to AI Coach
  ✅ Zero-Knowledge Guard blocks WIF private keys
  ✅ POST /api/ai/coach/analyze returns structured educational coaching
  ✅ POST /api/ai/coach/chat responds to questions about Bitcoin leaks
  ✅ GET /api/scenarios/simulated-wallet-bad flags all 4 privacy issues
  ✅ GET /api/scenarios/simulated-wallet-clean has high privacy score (>=95)
  ✅ POST /api/nostr/template/payment-code generates kind 30078 event
  ✅ GET /api/db/status returns database health and configuration info
  ✅ Zero-Knowledge Guard blocks xpub from being saved to database routes

Test Results: 13 passed, 0 failed.
```

---

## 🔒 Security & Privacy Notice
All private keys, seeds, and xpubs remain strictly on the user's client device. The backend provides zero-knowledge verification, proxying, scenario generation, and educational AI tutoring.
