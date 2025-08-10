const express = require('express');
const router = express.Router();
const quickbooksService = require('../services/quickbooksService');
const Transaction = require('../models/Transaction');

// Store tokens temporarily (in production, use database)
const tokenStore = {};

// Initiate QuickBooks OAuth flow
router.get('/connect', (req, res) => {
  try {
    const authUri = quickbooksService.getAuthorizationUrl();
    res.json({ 
      success: true, 
      authUrl: authUri,
      message: 'Visit the authUrl to connect your QuickBooks account'
    });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// OAuth callback handler
router.get('/callback', async (req, res) => {
  const { code, realmId, state } = req.query;
  
  if (!code || !realmId) {
    return res.status(400).send('Missing authorization code or realm ID');
  }
  
  try {
    // Exchange code for tokens
    const tokenData = await quickbooksService.createToken(code, realmId);
    
    // Store tokens (in production, save to database)
    tokenStore[realmId] = tokenData;
    
    // Redirect to success page or close window
    res.send(`
      <html>
        <body>
          <h2>QuickBooks Connected Successfully!</h2>
          <p>You can now close this window and return to your app.</p>
          <script>
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Failed to connect QuickBooks account');
  }
});

// Get connected QuickBooks companies
router.get('/companies', async (req, res) => {
  try {
    const companies = Object.keys(tokenStore).map(realmId => ({
      realmId,
      connected: true
    }));
    
    res.json({ 
      success: true, 
      companies,
      count: companies.length 
    });
  } catch (error) {
    console.error('Error fetching companies:', error);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
});

// Sync QuickBooks data
router.post('/sync', async (req, res) => {
  try {
    const { realmId } = req.body;
    
    // Get stored token (in production, retrieve from database)
    const tokenData = tokenStore[realmId || Object.keys(tokenStore)[0]];
    
    if (!tokenData) {
      return res.status(401).json({ 
        error: 'No QuickBooks account connected. Please connect first.' 
      });
    }
    
    // Sync data from QuickBooks
    const syncResult = await quickbooksService.syncQuickBooksData(
      tokenData.accessToken,
      tokenData.realmId
    );
    
    // Save transactions to database
    const savedTransactions = [];
    for (const transaction of syncResult.transactions) {
      try {
        // Check if transaction already exists
        const existing = await Transaction.findOne({ 
          source: 'QuickBooks',
          sourceId: transaction.sourceId 
        });
        
        if (!existing) {
          const newTransaction = new Transaction(transaction);
          await newTransaction.save();
          savedTransactions.push(newTransaction);
        }
      } catch (err) {
        console.error('Error saving transaction:', err);
      }
    }
    
    res.json({
      success: true,
      message: 'QuickBooks sync completed',
      summary: {
        ...syncResult.summary,
        savedTransactions: savedTransactions.length,
        companyName: syncResult.companyInfo?.CompanyInfo?.CompanyName
      }
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Failed to sync QuickBooks data' });
  }
});

// Get QuickBooks accounts
router.get('/accounts', async (req, res) => {
  try {
    const { realmId } = req.query;
    const tokenData = tokenStore[realmId || Object.keys(tokenStore)[0]];
    
    if (!tokenData) {
      return res.status(401).json({ 
        error: 'No QuickBooks account connected' 
      });
    }
    
    const accounts = await quickbooksService.getAccounts(
      tokenData.accessToken,
      tokenData.realmId
    );
    
    res.json({
      success: true,
      accounts,
      count: accounts.length
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// Get profit and loss report
router.get('/reports/profit-loss', async (req, res) => {
  try {
    const { realmId, startDate, endDate } = req.query;
    const tokenData = tokenStore[realmId || Object.keys(tokenStore)[0]];
    
    if (!tokenData) {
      return res.status(401).json({ 
        error: 'No QuickBooks account connected' 
      });
    }
    
    const today = new Date();
    const start = startDate || new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const end = endDate || today.toISOString().split('T')[0];
    
    const report = await quickbooksService.getProfitAndLoss(
      tokenData.accessToken,
      tokenData.realmId,
      start,
      end
    );
    
    res.json({
      success: true,
      report,
      period: { startDate: start, endDate: end }
    });
  } catch (error) {
    console.error('Error fetching P&L report:', error);
    res.status(500).json({ error: 'Failed to fetch profit and loss report' });
  }
});

// Disconnect QuickBooks
router.post('/disconnect', async (req, res) => {
  try {
    const { realmId } = req.body;
    
    if (realmId) {
      delete tokenStore[realmId];
    } else {
      // Clear all connections
      Object.keys(tokenStore).forEach(key => delete tokenStore[key]);
    }
    
    res.json({
      success: true,
      message: 'QuickBooks disconnected successfully'
    });
  } catch (error) {
    console.error('Error disconnecting:', error);
    res.status(500).json({ error: 'Failed to disconnect QuickBooks' });
  }
});

module.exports = router;