const express = require('express');
const router = express.Router();
const plaidService = require('../services/plaidService');
const Account = require('../models/Account');

router.post('/create-link-token', async (req, res) => {
  try {
    const userId = req.body.userId || 'default-user';
    const linkToken = await plaidService.createLinkToken(userId);
    res.json(linkToken);
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

router.post('/exchange-public-token', async (req, res) => {
  try {
    const { publicToken, metadata } = req.body;
    const accessToken = await plaidService.exchangePublicToken(publicToken);
    
    const accounts = await plaidService.getAccounts(accessToken);
    
    for (const account of accounts) {
      await Account.findOneAndUpdate(
        { sourceAccountId: account.account_id },
        {
          source: 'plaid',
          sourceAccountId: account.account_id,
          accessToken: accessToken,
          institutionName: metadata.institution.name,
          accountName: account.name,
          accountType: account.type,
          accountSubtype: account.subtype,
          mask: account.mask,
          currentBalance: account.balances.current,
          availableBalance: account.balances.available,
          creditLimit: account.balances.limit,
          currency: account.balances.iso_currency_code || 'USD',
          isActive: true,
          lastSynced: new Date(),
        },
        { upsert: true, new: true }
      );
    }
    
    res.json({ success: true, accounts: accounts.length });
  } catch (error) {
    console.error('Error exchanging public token:', error);
    res.status(500).json({ error: 'Failed to exchange public token' });
  }
});

router.post('/sync-accounts', async (req, res) => {
  try {
    const accounts = await Account.find({ source: 'plaid', isActive: true });
    const results = [];
    
    for (const account of accounts) {
      try {
        const transactions = await plaidService.syncTransactions(account.accessToken);
        const balances = await plaidService.getBalances(account.accessToken);
        
        results.push({
          accountId: account._id,
          transactions: transactions.length,
          status: 'success'
        });
      } catch (error) {
        results.push({
          accountId: account._id,
          error: error.message,
          status: 'failed'
        });
      }
    }
    
    res.json({ results });
  } catch (error) {
    console.error('Error syncing accounts:', error);
    res.status(500).json({ error: 'Failed to sync accounts' });
  }
});

router.delete('/remove-account/:accountId', async (req, res) => {
  try {
    const account = await Account.findById(req.params.accountId);
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    if (account.source === 'plaid' && account.accessToken) {
      await plaidService.removeItem(account.accessToken);
    }
    
    account.isActive = false;
    await account.save();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing account:', error);
    res.status(500).json({ error: 'Failed to remove account' });
  }
});

module.exports = router;