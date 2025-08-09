const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Debt = require('../models/Debt');

router.get('/summary', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dailyTotal = await Transaction.getDailyTotal(today);
    const totalBalances = await Account.getTotalBalance();
    const totalDebt = await Debt.getTotalDebt();
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayTotal = await Transaction.getDailyTotal(yesterday);

    const percentChange = yesterdayTotal.total > 0 
      ? ((dailyTotal.total - yesterdayTotal.total) / yesterdayTotal.total) * 100 
      : 0;

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyTransactions = await Transaction.getByDateRange(startOfMonth, tomorrow);
    const monthlySpent = monthlyTransactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    res.json({
      todaysSpending: {
        total: dailyTotal.total,
        count: dailyTotal.count,
        percentChange: percentChange.toFixed(2),
      },
      totalDebt: totalDebt.total,
      debtCount: totalDebt.count,
      availableBalance: {
        checking: totalBalances.checking || 0,
        savings: totalBalances.savings || 0,
        total: Object.values(totalBalances).reduce((sum, val) => sum + val, 0),
      },
      monthlyBudget: {
        spent: monthlySpent,
        budget: 3100,
        percentUsed: ((monthlySpent / 3100) * 100).toFixed(2),
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

router.get('/recent-transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const transactions = await Transaction
      .find()
      .sort({ date: -1 })
      .limit(limit)
      .skip(skip);

    const total = await Transaction.countDocuments();

    res.json({
      transactions,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    });
  } catch (error) {
    console.error('Error fetching recent transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

router.get('/spending-trends', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const dailyTotals = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayTotal = await Transaction.getDailyTotal(currentDate);
      dailyTotals.push({
        date: currentDate.toISOString().split('T')[0],
        amount: dayTotal.total,
        count: dayTotal.count,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({ trends: dailyTotals });
  } catch (error) {
    console.error('Error fetching spending trends:', error);
    res.status(500).json({ error: 'Failed to fetch spending trends' });
  }
});

router.get('/category-breakdown', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const breakdown = await Transaction.getCategoryBreakdown(startDate, endDate);
    
    res.json({ categories: breakdown });
  } catch (error) {
    console.error('Error fetching category breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch category breakdown' });
  }
});

router.get('/accounts', async (req, res) => {
  try {
    const accounts = await Account.getActiveAccounts();
    res.json({ accounts });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

router.get('/debts', async (req, res) => {
  try {
    const debts = await Debt.find({ isActive: true });
    const debtSummary = await Debt.getDebtByType();
    
    res.json({ 
      debts,
      summary: debtSummary,
    });
  } catch (error) {
    console.error('Error fetching debts:', error);
    res.status(500).json({ error: 'Failed to fetch debts' });
  }
});

router.get('/upcoming-payments', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const upcomingPayments = await Debt.getUpcomingPayments(days);
    
    res.json({ payments: upcomingPayments });
  } catch (error) {
    console.error('Error fetching upcoming payments:', error);
    res.status(500).json({ error: 'Failed to fetch upcoming payments' });
  }
});

module.exports = router;