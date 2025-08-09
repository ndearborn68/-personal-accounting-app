const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    enum: ['ClayGenius', 'RecruitCloud', 'DataLabs', 'Swyft Advance', 'Personal'],
  },
  displayName: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['business', 'personal'],
    default: 'business',
  },
  taxId: {
    type: String,
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'USA' },
  },
  categories: [{
    name: String,
    budgetLimit: Number,
    currentSpend: Number,
    period: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: 'monthly',
    },
  }],
  bankAccounts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
  }],
  creditCards: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
  }],
  defaultExpenseCategories: [{
    type: String,
  }],
  isActive: {
    type: Boolean,
    default: true,
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

companySchema.index({ name: 1 });
companySchema.index({ isActive: 1 });

companySchema.statics.getCompanyStats = async function(companyName, startDate, endDate) {
  const Transaction = mongoose.model('Transaction');
  
  const stats = await Transaction.aggregate([
    {
      $match: {
        company: companyName,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const expenses = stats.find(s => s._id === 'debit') || { total: 0, count: 0 };
  const income = stats.find(s => s._id === 'credit') || { total: 0, count: 0 };

  return {
    expenses: expenses.total,
    income: income.total,
    profit: income.total - expenses.total,
    transactionCount: expenses.count + income.count,
  };
};

companySchema.statics.getExpensesByCategory = async function(companyName, startDate, endDate) {
  const Transaction = mongoose.model('Transaction');
  
  return Transaction.aggregate([
    {
      $match: {
        company: companyName,
        type: 'debit',
        date: { $gte: startDate, $lte: endDate },
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

companySchema.methods.updateBudgetSpend = async function(category, amount) {
  const categoryBudget = this.categories.find(c => c.name === category);
  if (categoryBudget) {
    categoryBudget.currentSpend += amount;
    await this.save();
  }
};

companySchema.methods.resetBudgets = async function() {
  this.categories.forEach(category => {
    category.currentSpend = 0;
  });
  await this.save();
};

module.exports = mongoose.model('Company', companySchema);