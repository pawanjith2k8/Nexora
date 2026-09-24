const mongoose = require('mongoose');

const derivedAddressSchema = new mongoose.Schema({
  index: { type: Number, required: true },
  address: { type: String, required: true },
  addressType: { type: String, default: 'p2wpkh' },
  paid: { type: Boolean, default: false },
  amountSats: { type: Number, default: 0 },
  txid: { type: String, default: null }
}, { _id: false });

const handshakeChannelSchema = new mongoose.Schema({
  channelId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  senderNpub: {
    type: String,
    required: true,
    trim: true
  },
  receiverNpub: {
    type: String,
    required: true,
    trim: true
  },
  senderPaymentCode: {
    type: String,
    required: true,
    trim: true
  },
  receiverPaymentCode: {
    type: String,
    required: true,
    trim: true
  },
  sharedSecretHash: {
    type: String,
    default: null
  },
  lastDerivedIndex: {
    type: Number,
    default: 0
  },
  derivedAddresses: [derivedAddressSchema],
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('HandshakeChannel', handshakeChannelSchema);
