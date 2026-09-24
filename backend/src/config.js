const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Bitcoin testnet explorer API (mempool.space)
  MEMPOOL_API_BASE: process.env.MEMPOOL_API_BASE || 'https://mempool.space/testnet/api',
  
  // Nostr default public relays
  NOSTR_RELAYS: (process.env.NOSTR_RELAYS || 'wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net,wss://relay.snort.social').split(','),
  
  // AI Coach API Keys (Optional - has full intelligent fallback engine if not provided)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  
  // Custom Nostr Kind for Silent Ledger Payment Codes (Default 30078: Application-specific Data)
  SILENT_LEDGER_NOSTR_KIND: parseInt(process.env.SILENT_LEDGER_NOSTR_KIND || '30078', 10),
  
  // BIP47 Constants
  BIP47_IDENTIFIER: 'silent-ledger/bip47',

  // MongoDB Atlas Database
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://<db_username>:5iuF49aNpgdj5VzC@silentledger.gbiwzyu.mongodb.net/silentledger?retryWrites=true&w=majority&appName=silentledger',
  DB_USERNAME: process.env.DB_USERNAME || ''
};
