const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  source: {
    type: String,
    required: true,
    enum: ['plaid', 'paypal', 'manual', 'credit_card', 'bank_transfer', 'cash', 'check'],
  },
  sourceId: {
    type: String,
    required: true,
    unique: true,
  },
  accountId: {
    type: String,
    required: true,
  },
  company: {
    type: String,
    enum: ['ClayGenius', 'RecruitCloud', 'DataLabs', 'Swyft Advance', 'Personal', 'Unallocated'],
    default: 'Unallocated',
    required: true,
  },
  allocationPercentage: {
    type: Number,
    default: 100,
    min: 0,
    max: 100,
  },
  splitAllocations: [{
    company: {
      type: String,
      enum: ['ClayGenius', 'RecruitCloud', 'DataLabs', 'Swyft Advance', 'Personal'],
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100,
    },
    amount: Number,
  }],
  expenseSource: {
    type: String,
  },
  invoiceNumber: {
    type: String,
  },
  receiptUrl: {
    type: String,
  },
  cardProvider: {
    type: String,
  },
  date: {
    type: Date,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'USD',
  },
  description: {
    type: String,
    required: true,
  },
  merchant: {
    type: String,
  },
  category: {
    type: String,
    required: true,
  },
  subcategory: {
    type: String,
  },
  businessPurpose: {
    type: String,
  },
  taxDeductible: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String,
    enum: ['debit', 'credit'],
    required: true,
  },
  pending: {
    type: Boolean,
    default: false,
  },
  tags: [{
    type: String,
  }],
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
  location: {
    address: String,
    city: String,
    region: String,
    postalCode: String,
    country: String,
    lat: Number,
    lon: Number,
  },
  approvedBy: {
    type: String,
  },
  approvalDate: {
    type: Date,
  },
  notes: {
    type: String,
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

transactionSchema.index({ date: -1 });
transactionSchema.index({ category: 1 });
transactionSchema.index({ source: 1 });
transactionSchema.index({ accountId: 1 });
transactionSchema.index({ sourceId: 1 }, { unique: true });
transactionSchema.index({ company: 1 });
transactionSchema.index({ company: 1, date: -1 });

transactionSchema.methods.isExpense = function() {
  return this.type === 'debit';
};

transactionSchema.methods.isIncome = function() {
  return this.type === 'credit';
};

transactionSchema.statics.getByDateRange = function(startDate, endDate) {
  return this.find({
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  }).sort({ date: -1 });
};

transactionSchema.statics.getDailyTotal = async function(date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const result = await this.aggregate([
    {
      $match: {
        date: { $gte: startOfDay, $lte: endOfDay },
        type: 'debit',
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  return result[0] || { total: 0, count: 0 };
};

transactionSchema.statics.getCategoryBreakdown = async function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lte: endDate },
        type: 'debit',
      },
    },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' },
      },
    },
    {
      $sort: { total: -1 },
    },
  ]);
};

transactionSchema.statics.getCompanyTransactions = async function(company, startDate, endDate) {
  const query = { company };
  
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = startDate;
    if (endDate) query.date.$lte = endDate;
  }
  
  return this.find(query).sort({ date: -1 });
};

transactionSchema.statics.getCompanyExpenses = async function(company, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        company,
        type: 'debit',
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$category',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
        transactions: { 
          $push: {
            date: '$date',
            amount: '$amount',
            description: '$description',
            merchant: '$merchant',
          },
        },
      },
    },
    {
      $sort: { total: -1 },
    },
  ]);
};

transactionSchema.methods.allocateToCompany = async function(company, percentage = 100) {
  this.company = company;
  this.allocationPercentage = percentage;
  this.updatedAt = new Date();
  return this.save();
};

transactionSchema.methods.splitBetweenCompanies = async function(allocations) {
  const totalPercentage = allocations.reduce((sum, a) => sum + a.percentage, 0);
  
  if (totalPercentage !== 100) {
    throw new Error('Total allocation percentage must equal 100%');
  }
  
  this.splitAllocations = allocations.map(a => ({
    company: a.company,
    percentage: a.percentage,
    amount: (this.amount * a.percentage) / 100,
  }));
  
  this.company = allocations[0].company;
  this.allocationPercentage = allocations[0].percentage;
  this.updatedAt = new Date();
  
  return this.save();
};

module.exports = mongoose.model('Transaction', transactionSchema);