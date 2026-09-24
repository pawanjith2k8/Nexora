const mongoose = require('mongoose');

const auditRecordSchema = new mongoose.Schema({
  walletTag: {
    type: String,
    default: 'Default Wallet',
    trim: true
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  grade: {
    type: String,
    required: true
  },
  flags: {
    type: Array,
    default: []
  },
  summary: {
    type: Object,
    default: {}
  },
  aiCoachAnalysis: {
    type: String,
    default: ''
  },
  aiProvider: {
    type: String,
    default: 'silent-ledger-tutor-engine'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AuditRecord', auditRecordSchema);
