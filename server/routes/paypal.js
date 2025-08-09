const express = require('express');
const router = express.Router();
const paypalService = require('../services/paypalService');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');

router.get('/auth-url', (req, res) => {
  const authUrl = `https://www.paypal.com/connect?flowEntry=static&client_id=${process.env.PAYPAL_CLIENT_ID}&response_type=code&scope=openid email profile`;
  res.json({ authUrl });
});

router.post('/connect', async (req, res) => {
  try {
    const accountInfo = await paypalService.getAccountInfo();
    const balance = await paypalService.getBalance();
    
    const totalBalance = balance.balances?.reduce((sum, b) => {
      return sum + parseFloat(b.available_balance?.value || 0);
    }, 0) || 0;
    
    const account = await Account.findOneAndUpdate(
      { source: 'paypal', sourceAccountId: accountInfo.email },
      {
        source: 'paypal',
        sourceAccountId: accountInfo.email,
        institutionName: 'PayPal',
        accountName: `PayPal - ${accountInfo.name}`,
        accountType: 'paypal',
        currentBalance: totalBalance,
        availableBalance: totalBalance,
        currency: 'USD',
        isActive: true,
        lastSynced: new Date(),
        metadata: {
          email: accountInfo.email,
          verified: accountInfo.verified_account,
        },
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, account });
  } catch (error) {
    console.error('Error connecting PayPal:', error);
    res.status(500).json({ error: 'Failed to connect PayPal account' });
  }
});

router.get('/balance', async (req, res) => {
  try {
    const balance = await paypalService.getBalance();
    res.json(balance);
  } catch (error) {
    console.error('Error fetching PayPal balance:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const endDate = req.query.endDate || new Date().toISOString().split('T')[0];
    const startDate = req.query.startDate || (() => {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return date.toISOString().split('T')[0];
    })();
    
    const transactions = await paypalService.getTransactions(startDate, endDate);
    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching PayPal transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

router.post('/sync', async (req, res) => {
  try {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    const transactions = await paypalService.getTransactions(startDateStr, endDate);
    const paypalAccount = await Account.findOne({ 
      source: 'paypal',
      isActive: true 
    });
    
    if (!paypalAccount) {
      return res.status(404).json({ error: 'PayPal account not connected' });
    }
    
    let savedCount = 0;
    for (const transaction of transactions) {
      const formatted = paypalService.formatTransactionForDB(transaction);
      formatted.accountId = paypalAccount._id.toString();
      
      await Transaction.findOneAndUpdate(
        { sourceId: formatted.sourceId },
        formatted,
        { upsert: true, new: true }
      );
      savedCount++;
    }
    
    const balance = await paypalService.getBalance();
    if (balance && balance.balances) {
      const totalBalance = balance.balances.reduce((sum, b) => {
        return sum + parseFloat(b.available_balance?.value || 0);
      }, 0);
      
      await paypalAccount.updateBalance(totalBalance, totalBalance);
    }
    
    res.json({ 
      success: true, 
      transactionsSynced: savedCount,
      balance: paypalAccount.currentBalance 
    });
  } catch (error) {
    console.error('Error syncing PayPal:', error);
    res.status(500).json({ error: 'Failed to sync PayPal data' });
  }
});

module.exports = router;