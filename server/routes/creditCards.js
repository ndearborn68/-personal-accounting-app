const express = require('express');
const router = express.Router();
const creditCardService = require('../services/creditCardService');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');

router.get('/providers', (req, res) => {
  res.json({
    providers: creditCardService.providers,
  });
});

router.post('/connect', async (req, res) => {
  try {
    const { provider, credentials, company } = req.body;
    
    const connection = await creditCardService.connectCreditCard(provider, credentials);
    
    if (connection.connectionType === 'manual') {
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

router.get('/accounts', async (req, res) => {
  try {
    const accounts = await Account.find({ 
      source: 'credit_card',
      isActive: true 
    });
    res.json({ accounts });
  } catch (error) {
    console.error('Error fetching credit card accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

router.post('/sync/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await Account.findById(accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    const transactions = await creditCardService.fetchTransactions(
      account.metadata.provider,
      account.accessToken,
      startDateStr,
      endDate
    );
    
    let savedCount = 0;
    for (const transaction of transactions) {
      transaction.accountId = accountId;
      transaction.company = account.metadata.company || 'Unallocated';
      
      try {
        await Transaction.findOneAndUpdate(
          { sourceId: transaction.sourceId },
          transaction,
          { upsert: true, new: true }
        );
        savedCount++;
      } catch (error) {
        if (error.code !== 11000) {
          console.error('Error saving transaction:', error);
        }
      }
    }
    
    account.lastSynced = new Date();
    await account.save();
    
    res.json({ 
      success: true, 
      syncedTransactions: savedCount,
      message: `Synced ${savedCount} transactions from ${account.institutionName}` 
    });
  } catch (error) {
    console.error('Error syncing credit card:', error);
    res.status(500).json({ error: 'Failed to sync credit card' });
  }
});

router.put('/update-balance/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { currentBalance, statementBalance } = req.body;
    
    const account = await Account.findById(accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    account.currentBalance = currentBalance;
    account.metadata.statementBalance = statementBalance;
    account.availableCredit = account.creditLimit - currentBalance;
    account.lastSynced = new Date();
    
    await account.save();
    
    res.json({ 
      success: true, 
      account,
      message: 'Balance updated successfully' 
    });
  } catch (error) {
    console.error('Error updating balance:', error);
    res.status(500).json({ error: 'Failed to update balance' });
  }
});

router.delete('/remove/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await Account.findById(accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    account.isActive = false;
    await account.save();
    
    res.json({ success: true, message: 'Credit card removed successfully' });
  } catch (error) {
    console.error('Error removing credit card:', error);
    res.status(500).json({ error: 'Failed to remove credit card' });
  }
});

router.post('/import-csv', async (req, res) => {
  try {
    const { csvData, provider, accountId } = req.body;
    
    if (!csvData || !provider) {
      return res.status(400).json({ error: 'CSV data and provider required' });
    }
    
    const transactions = await creditCardService.importCSV(csvData, provider);
    
    let savedCount = 0;
    for (const transaction of transactions) {
      transaction.accountId = accountId || 'manual_entry';
      transaction.company = 'Unallocated';
      
      try {
        await Transaction.create(transaction);
        savedCount++;
      } catch (error) {
        if (error.code !== 11000) {
          console.error('Error saving CSV transaction:', error);
        }
      }
    }
    
    res.json({ 
      success: true, 
      imported: savedCount,
      total: transactions.length,
      message: `Imported ${savedCount} transactions from CSV` 
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

router.get('/transactions/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate, limit = 50 } = req.query;
    
    const query = { accountId };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    const transactions = await Transaction
      .find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit));
    
    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching card transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;