AI Project Builder & SilentLedger 🚀

An AI-powered development platform and privacy-first application system built with a modern web frontend and an Express.js backend.

## 📌 Overview

SilentLedger provides a complete development and application ecosystem:
- **Frontend (`frontend/`)**: Next.js 16 + React 19 + TypeScript + Tailwind — App Router with Dashboard, Identity, Payment (client-side BIP47 ECDH), Privacy (client-side auditor), AI Coach (sanitized audit), Activity (testnet history), Settings.
- **Backend Service (`backend/`)**: Express.js server providing user authentication (`/api/signup`, `/api/users/clear-all`), MongoDB Atlas integration with Mongoose, Bitcoin testnet explorer proxying, Nostr NIP-17 handshake discovery, and an AI Privacy Coach.

## 📁 Repository Structure

```
SilentLedger/
├── frontend/                 # Next.js 16 frontend (App Router)
│   ├── app/                  # Home, Dashboard, Identity, Payment, Privacy, Coach, Activity, Settings
│   ├── components/           # AppShell, Header, Nav, Toast
│   ├── lib/                  # api.ts, types.ts, bip47Client.ts, privacyAuditor.ts
│   ├── .env.local            # NEXT_PUBLIC_API_URL=http://localhost:5000
│   └── package.json
├── backend/                  # Express.js backend service
│   ├── src/
│   │   ├── middleware/       # Zero-Knowledge Privacy Guard & error handlers
│   │   ├── models/           # Mongoose models (User, Contact, HandshakeChannel, AuditRecord)
│   │   ├── routes/           # REST routes (auth, ai, btc, nostr, crypto, scenario, db)
│   │   ├── services/         # BIP47 derivation, Nostr tools, mempool proxy, AI coach, DB
│   │   ├── public/           # Interactive test dashboard (http://localhost:5000)
│   │   ├── config.js         # Configuration settings
│   │   └── server.js         # Server entry point
│   ├── tests/                # Automated test suite (16 tests)
│   ├── .env.example          # Environment variables template
│   ├── package.json          # Dependencies & npm scripts
│   └── README.md             # Complete backend documentation
└── README.md                 # Project documentation
```

## 🚀 Getting Started with the Backend

```bash
cd backend
npm install
npm test
npm start
```

The backend server runs on `http://localhost:5000` (frontend on `http://localhost:3000`) with live API endpoints. Bitcoin Testnet only; privacy analysis stays client-side; AI receives sanitized audit only.

## 📄 License
This project is currently under development. License details will be added later.
