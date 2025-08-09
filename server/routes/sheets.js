const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');
const Debt = require('../models/Debt');

router.get('/debts', async (req, res) => {
  try {
    const debts = await googleSheetsService.getDebts();
    res.json({ debts });
  } catch (error) {
    console.error('Error fetching debts from sheets:', error);
    res.status(500).json({ error: 'Failed to fetch debts' });
  }
});

router.post('/sync-debts', async (req, res) => {
  try {
    const debts = await googleSheetsService.getDebts();
    let updatedCount = 0;
    let createdCount = 0;
    
    for (const debtData of debts) {
      const existingDebt = await Debt.findOne({ 
        name: debtData.name,
        source: 'google_sheets'
      });
      
      if (existingDebt) {
        existingDebt.currentBalance = debtData.currentBalance;
        existingDebt.creditLimit = debtData.creditLimit;
        existingDebt.minimumPayment = debtData.minimumPayment;
        existingDebt.apr = debtData.apr;
        existingDebt.dueDate = debtData.dueDate;
        existingDebt.lastUpdated = new Date();
        await existingDebt.save();
        updatedCount++;
      } else {
        await Debt.create(debtData);
        createdCount++;
      }
    }
    
    res.json({ 
      success: true, 
      updated: updatedCount,
      created: createdCount,
      total: debts.length 
    });
  } catch (error) {
    console.error('Error syncing debts:', error);
    res.status(500).json({ error: 'Failed to sync debts' });
  }
});

router.put('/debt/:debtName', async (req, res) => {
  try {
    const { debtName } = req.params;
    const updates = req.body;
    
    await googleSheetsService.updateDebt(debtName, updates);
    
    const debt = await Debt.findOne({ name: debtName });
    if (debt) {
      Object.assign(debt, updates);
      debt.lastUpdated = new Date();
      await debt.save();
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating debt:', error);
    res.status(500).json({ error: 'Failed to update debt' });
  }
});

router.get('/budget', async (req, res) => {
  try {
    const budget = await googleSheetsService.getMonthlyBudget();
    res.json({ budget });
  } catch (error) {
    console.error('Error fetching budget:', error);
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
});

router.post('/transaction', async (req, res) => {
  try {
    const transaction = req.body;
    await googleSheetsService.addTransaction(transaction);
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding transaction to sheets:', error);
    res.status(500).json({ error: 'Failed to add transaction' });
  }
});

router.post('/daily-summary', async (req, res) => {
  try {
    const { date, summary } = req.body;
    await googleSheetsService.updateSpendingSummary(date, summary);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating daily summary:', error);
    res.status(500).json({ error: 'Failed to update daily summary' });
  }
});

router.post('/initialize-sheets', async (req, res) => {
  try {
    const sheets = ['Debts', 'Transactions', 'Budget', 'DailySummary'];
    
    for (const sheetName of sheets) {
      await googleSheetsService.createSheetIfNotExists(sheetName);
    }
    
    res.json({ 
      success: true, 
      message: 'Sheets initialized successfully',
      sheets 
    });
  } catch (error) {
    console.error('Error initializing sheets:', error);
    res.status(500).json({ error: 'Failed to initialize sheets' });
  }
});

module.exports = router;