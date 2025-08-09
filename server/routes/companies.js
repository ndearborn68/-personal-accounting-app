const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const Transaction = require('../models/Transaction');
const creditCardService = require('../services/creditCardService');
const multer = require('multer');
const upload = multer({ memory: true });

router.get('/', async (req, res) => {
  try {
    const companies = await Company.find({ isActive: true });
    res.json({ companies });
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

router.post('/initialize', async (req, res) => {
  try {
    const companies = [
      { name: 'ClayGenius', displayName: 'ClayGenius', type: 'business' },
      { name: 'RecruitCloud', displayName: 'RecruitCloud', type: 'business' },
      { name: 'DataLabs', displayName: 'DataLabs', type: 'business' },
      { name: 'Swyft Advance', displayName: 'Swyft Advance', type: 'business' },
      { name: 'Personal', displayName: 'Personal', type: 'personal' },
    ];

    for (const company of companies) {
      await Company.findOneAndUpdate(
        { name: company.name },
        company,
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, message: 'Companies initialized' });
  } catch (error) {
    console.error('Error initializing companies:', error);
    res.status(500).json({ error: 'Failed to initialize companies' });
  }
});

router.get('/:company/summary', async (req, res) => {
  try {
    const { company } = req.params;
    const { startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(new Date().setMonth(new Date().getMonth() - 1));
    const end = endDate ? new Date(endDate) : new Date();

    const stats = await Company.getCompanyStats(company, start, end);
    const expenses = await Company.getExpensesByCategory(company, start, end);
    const transactions = await Transaction.getCompanyTransactions(company, start, end);

    res.json({
      company,
      period: { start, end },
      stats,
      expensesByCategory: expenses,
      recentTransactions: transactions.slice(0, 10),
    });
  } catch (error) {
    console.error('Error fetching company summary:', error);
    res.status(500).json({ error: 'Failed to fetch company summary' });
  }
});

router.post('/manual-expense', async (req, res) => {
  try {
    const {
      amount,
      description,
      merchant,
      category,
      company,
      date,
      expenseSource,
      cardProvider,
      businessPurpose,
      taxDeductible,
      invoiceNumber,
      notes,
      splitAllocations,
    } = req.body;

    const transaction = new Transaction({
      source: 'manual',
      sourceId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      accountId: 'manual_entry',
      amount: Math.abs(amount),
      description,
      merchant,
      category,
      company: company || 'Unallocated',
      date: new Date(date || Date.now()),
      type: 'debit',
      expenseSource,
      cardProvider,
      businessPurpose,
      taxDeductible: taxDeductible || false,
      invoiceNumber,
      notes,
      currency: 'USD',
    });

    if (splitAllocations && splitAllocations.length > 0) {
      await transaction.splitBetweenCompanies(splitAllocations);
    }

    await transaction.save();

    res.status(201).json({ 
      success: true, 
      transaction,
      message: `Expense of $${amount} allocated to ${company}` 
    });
  } catch (error) {
    console.error('Error creating manual expense:', error);
    res.status(500).json({ error: 'Failed to create manual expense' });
  }
});

router.post('/manual-income', async (req, res) => {
  try {
    const {
      amount,
      description,
      source,
      category,
      company,
      date,
      invoiceNumber,
      notes,
    } = req.body;

    const transaction = new Transaction({
      source: 'manual',
      sourceId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      accountId: 'manual_entry',
      amount: Math.abs(amount),
      description,
      merchant: source,
      category: category || 'Income',
      company: company || 'Unallocated',
      date: new Date(date || Date.now()),
      type: 'credit',
      invoiceNumber,
      notes,
      currency: 'USD',
    });

    await transaction.save();

    res.status(201).json({ 
      success: true, 
      transaction,
      message: `Income of $${amount} allocated to ${company}` 
    });
  } catch (error) {
    console.error('Error creating manual income:', error);
    res.status(500).json({ error: 'Failed to create manual income' });
  }
});

router.put('/allocate-transaction/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { company, percentage, splitAllocations } = req.body;

    const transaction = await Transaction.findById(transactionId);
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (splitAllocations && splitAllocations.length > 0) {
      await transaction.splitBetweenCompanies(splitAllocations);
    } else {
      await transaction.allocateToCompany(company, percentage || 100);
    }

    res.json({ 
      success: true, 
      transaction,
      message: `Transaction allocated to ${company}` 
    });
  } catch (error) {
    console.error('Error allocating transaction:', error);
    res.status(500).json({ error: 'Failed to allocate transaction' });
  }
});

router.get('/unallocated-transactions', async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const transactions = await Transaction
      .find({ company: 'Unallocated' })
      .sort({ date: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Transaction.countDocuments({ company: 'Unallocated' });

    res.json({
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error('Error fetching unallocated transactions:', error);
    res.status(500).json({ error: 'Failed to fetch unallocated transactions' });
  }
});

router.post('/bulk-allocate', async (req, res) => {
  try {
    const { transactionIds, company } = req.body;

    const result = await Transaction.updateMany(
      { _id: { $in: transactionIds } },
      { 
        $set: { 
          company,
          allocationPercentage: 100,
          updatedAt: new Date(),
        },
      }
    );

    res.json({ 
      success: true, 
      updated: result.modifiedCount,
      message: `${result.modifiedCount} transactions allocated to ${company}` 
    });
  } catch (error) {
    console.error('Error bulk allocating transactions:', error);
    res.status(500).json({ error: 'Failed to bulk allocate transactions' });
  }
});

router.post('/connect-credit-card', async (req, res) => {
  try {
    const { provider, credentials, company } = req.body;
    
    const connection = await creditCardService.connectCreditCard(provider, credentials);
    
    if (connection.connectionType === 'manual') {
      const Account = require('../models/Account');
      
      const account = new Account({
        source: 'credit_card',
        sourceAccountId: `${provider}_${credentials.lastFourDigits}`,
        institutionName: connection.providerName,
        accountName: `${connection.providerName} - ****${credentials.lastFourDigits}`,
        accountType: 'credit',
        mask: credentials.lastFourDigits,
        currentBalance: connection.cardDetails.currentBalance,
        creditLimit: connection.cardDetails.creditLimit,
        currency: 'USD',
        isActive: true,
        metadata: {
          provider,
          company,
          manualEntry: true,
          cardDetails: connection.cardDetails,
        },
      });
      
      await account.save();
      
      if (company) {
        const companyDoc = await Company.findOne({ name: company });
        if (companyDoc) {
          companyDoc.creditCards.push(account._id);
          await companyDoc.save();
        }
      }
    }
    
    res.json({ 
      success: true, 
      connection,
      message: `${provider} card connected successfully` 
    });
  } catch (error) {
    console.error('Error connecting credit card:', error);
    res.status(500).json({ error: 'Failed to connect credit card' });
  }
});

router.post('/import-statement', upload.single('statement'), async (req, res) => {
  try {
    const { provider, company, fileType } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    let transactions = [];
    
    if (fileType === 'csv') {
      const csvData = file.buffer.toString('utf-8');
      transactions = await creditCardService.importCSV(csvData, provider);
    } else if (fileType === 'pdf') {
      transactions = await creditCardService.parseStatementPDF(file.buffer, provider);
    }
    
    let savedCount = 0;
    for (const transaction of transactions) {
      transaction.company = company || 'Unallocated';
      
      try {
        await Transaction.create(transaction);
        savedCount++;
      } catch (error) {
        if (error.code !== 11000) {
          console.error('Error saving transaction:', error);
        }
      }
    }
    
    res.json({ 
      success: true, 
      imported: savedCount,
      total: transactions.length,
      message: `Imported ${savedCount} transactions from ${provider} statement` 
    });
  } catch (error) {
    console.error('Error importing statement:', error);
    res.status(500).json({ error: 'Failed to import statement' });
  }
});

router.get('/:company/report', async (req, res) => {
  try {
    const { company } = req.params;
    const { startDate, endDate, format = 'json' } = req.query;
    
    const start = new Date(startDate || new Date().setMonth(new Date().getMonth() - 1));
    const end = new Date(endDate || new Date());
    
    const [transactions, stats, expenses] = await Promise.all([
      Transaction.getCompanyTransactions(company, start, end),
      Company.getCompanyStats(company, start, end),
      Company.getExpensesByCategory(company, start, end),
    ]);
    
    const report = {
      company,
      period: { start, end },
      summary: stats,
      expensesByCategory: expenses,
      transactions,
      generatedAt: new Date(),
    };
    
    if (format === 'csv') {
      const csv = this.generateCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${company}-report.csv`);
      res.send(csv);
    } else {
      res.json(report);
    }
  } catch (error) {
    console.error('Error generating company report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;