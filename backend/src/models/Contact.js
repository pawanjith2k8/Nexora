const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  npub: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  hexPubkey: {
    type: String,
    required: true,
    trim: true
  },
  paymentCode: {
    type: String,
    required: true,
    trim: true
  },
  alias: {
    type: String,
    default: 'Anonymous Contact',
    trim: true
  },
  relaySource: {
    type: String,
    default: 'relay.damus.io'
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Contact', contactSchema);
