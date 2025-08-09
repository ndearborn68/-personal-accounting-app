const mongoose = require('mongoose');

const debtSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['credit_card', 'personal_loan', 'student_loan', 'mortgage', 'auto_loan', 'other'],
    required: true,
  },
  source: {
    type: String,
    enum: ['google_sheets', 'plaid', 'manual'],
    default: 'google_sheets',
  },
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
  },
  currentBalance: {
    type: Number,
    required: true,
  },
  originalBalance: {
    type: Number,
  },
  creditLimit: {
    type: Number,
  },
  minimumPayment: {
    type: Number,
    required: true,
  },
  apr: {
    type: Number,
  },
  dueDate: {
    type: String,
  },
  dueDateDay: {
    type: Number,
    min: 1,
    max: 31,
  },
  paymentHistory: [{
    date: Date,
    amount: Number,
    balance: Number,
    note: String,
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

debtSchema.index({ type: 1 });
debtSchema.index({ isActive: 1 });
debtSchema.index({ dueDate: 1 });

debtSchema.methods.makePayment = async function(amount, note) {
  this.currentBalance -= amount;
  this.paymentHistory.push({
    date: new Date(),
    amount,
    balance: this.currentBalance,
    note,
  });
  this.lastUpdated = new Date();
  return this.save();
};

debtSchema.methods.getUtilization = function() {
  if (!this.creditLimit || this.creditLimit === 0) {
    return null;
  }
  return (this.currentBalance / this.creditLimit) * 100;
};

debtSchema.methods.getPayoffProgress = function() {
  if (!this.originalBalance || this.originalBalance === 0) {
    return null;
  }
  const paid = this.originalBalance - this.currentBalance;
  return (paid / this.originalBalance) * 100;
};

debtSchema.statics.getTotalDebt = async function() {
  const result = await this.aggregate([
    {
      $match: { isActive: true },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$currentBalance' },
        count: { $sum: 1 },
      },
    },
  ]);

  return result[0] || { total: 0, count: 0 };
};

debtSchema.statics.getDebtByType = async function() {
  return this.aggregate([
    {
      $match: { isActive: true },
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$currentBalance' },
        count: { $sum: 1 },
        avgBalance: { $avg: '$currentBalance' },
      },
    },
    {
      $sort: { total: -1 },
    },
  ]);
};

debtSchema.statics.getUpcomingPayments = function(days = 7) {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);
  
  return this.find({
    isActive: true,
    dueDateDay: {
      $gte: today.getDate(),
      $lte: futureDate.getDate(),
    },
  }).sort({ dueDateDay: 1 });
};

module.exports = mongoose.model('Debt', debtSchema);