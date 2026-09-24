AI Project Builder & Nexora 🚀

An AI-powered development platform and privacy-first application system built with a modern web frontend and an Express.js backend.

## 📌 Overview

Nexora provides a complete development and application ecosystem:
- **Frontend**: Clean interactive interface (`login.html`) with role-based routing.
- **Backend Service (`backend/`)**: Express.js server providing user authentication (`/api/signup`, `/api/users/clear-all`), MongoDB Atlas integration with Mongoose, Bitcoin testnet explorer proxying, Nostr NIP-17 handshake discovery, and an AI Privacy Coach.

## 📁 Repository Structure

```
nexora/
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
├── login.html                # Frontend application interface
└── README.md                 # Project documentation
```

## 🚀 Getting Started with the Backend

```bash
cd backend
npm install
npm test
npm start
```

The backend server runs on `http://localhost:5000` with live API endpoints and an interactive test dashboard.

## 📄 License
This project is currently under development. License details will be added later.
