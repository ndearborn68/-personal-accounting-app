const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  source: {
    type: String,
    required: true,
    enum: ['plaid', 'paypal', 'manual'],
  },
  sourceAccountId: {
    type: String,
    required: true,
    unique: true,
  },
  accessToken: {
    type: String,
    required: function() {
      return this.source === 'plaid';
    },
  },
  institutionName: {
    type: String,
    required: true,
  },
  accountName: {
    type: String,
    required: true,
  },
  accountType: {
    type: String,
    enum: ['checking', 'savings', 'credit', 'loan', 'investment', 'paypal'],
    required: true,
  },
  accountSubtype: {
    type: String,
  },
  mask: {
    type: String,
  },
  currentBalance: {
    type: Number,
    default: 0,
  },
  availableBalance: {
    type: Number,
    default: 0,
  },
  creditLimit: {
    type: Number,
  },
  currency: {
    type: String,
    default: 'USD',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastSynced: {
    type: Date,
    default: Date.now,
  },
  syncError: {
    type: String,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

accountSchema.index({ source: 1 });
accountSchema.index({ accountType: 1 });
accountSchema.index({ isActive: 1 });
accountSchema.index({ sourceAccountId: 1 }, { unique: true });

accountSchema.methods.updateBalance = async function(currentBalance, availableBalance) {
  this.currentBalance = currentBalance;
  this.availableBalance = availableBalance || currentBalance;
  this.lastSynced = new Date();
  this.syncError = null;
  return this.save();
};

accountSchema.methods.markSyncError = async function(error) {
  this.syncError = error;
  this.lastSynced = new Date();
  return this.save();
};

accountSchema.statics.getActiveAccounts = function() {
  return this.find({ isActive: true });
};

accountSchema.statics.getTotalBalance = async function() {
  const result = await this.aggregate([
    {
      $match: { isActive: true },
    },
    {
      $group: {
        _id: '$accountType',
        total: { $sum: '$currentBalance' },
      },
    },
  ]);

  return result.reduce((acc, item) => {
    acc[item._id] = item.total;
    return acc;
  }, {});
};

accountSchema.statics.needsSync = function() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return this.find({
    isActive: true,
    $or: [
      { lastSynced: { $lt: oneHourAgo } },
      { lastSynced: null },
    ],
  });
};

module.exports = mongoose.model('Account', accountSchema);