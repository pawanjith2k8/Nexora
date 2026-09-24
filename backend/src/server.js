const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const aiRoutes = require('./routes/ai.routes');
const btcRoutes = require('./routes/btc.routes');
const nostrRoutes = require('./routes/nostr.routes');
const cryptoRoutes = require('./routes/crypto.routes');
const scenarioRoutes = require('./routes/scenario.routes');
const dbRoutes = require('./routes/db.routes');
const authRoutes = require('./routes/auth.routes');
const { connectDB, getDbState } = require('./services/db.service');

const app = express();

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static interactive demo UI / API dashboard
app.use(express.static(path.join(__dirname, 'public')));

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    project: 'Silent Ledger',
    version: '1.0.0',
    description: 'Privacy-first Bitcoin payment layer discovered over Nostr',
    mempoolTestnet: config.MEMPOOL_API_BASE,
    relaysConfigured: config.NOSTR_RELAYS.length,
    aiProvider: config.GEMINI_API_KEY ? 'gemini' : config.ANTHROPIC_API_KEY ? 'claude' : 'built-in-coach-engine',
    database: getDbState(),
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api', authRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/btc', btcRoutes);
app.use('/api/nostr', nostrRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/db', dbRoutes);

// Global Error Handler
app.use(errorHandler);

// Start server if run directly
if (require.main === module) {
  // Connect to MongoDB Atlas (graceful if credentials pending)
  connectDB().catch(err => console.warn('MongoDB connect error:', err.message));

  app.listen(config.PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Silent Ledger Express Backend is running!`);
    console.log(`📡 URL: http://localhost:${config.PORT}`);
    console.log(`🛡️  Zero-Knowledge Privacy Guard: ACTIVE`);
    console.log(`⚡ Bitcoin Explorer: ${config.MEMPOOL_API_BASE}`);
    console.log(`🧠 AI Privacy Coach Engine: Ready`);
    console.log(`📦 MongoDB Database: Configured (Collection: silentledger)`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
