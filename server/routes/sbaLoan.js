const express = require('express');
const router = express.Router();
const sbaLoanService = require('../services/sbaLoanService');
const Debt = require('../models/Debt');

router.post('/add', async (req, res) => {
  try {
    const { loanNumber, company, autoSync = true } = req.body;
    
    if (!sbaLoanService.validateLoanNumber(loanNumber)) {
      return res.status(400).json({ 
        error: 'Invalid loan number format. Must be 10 digits.' 
      });
    }
    
    let loanData;
    
    if (autoSync) {
      try {
        loanData = await sbaLoanService.getLoanBalance(loanNumber);
      } catch (error) {
        console.warn('SBA API not available, creating manual entry:', error.message);
        loanData = sbaLoanService.createManualEntry(loanNumber);
      }
    } else {
      loanData = sbaLoanService.createManualEntry(loanNumber);
    }
    
    const debt = await sbaLoanService.createLoanDebtEntry(loanData, company);
    
    res.json({ 
      success: true, 
      loan: loanData,
      debt,
      message: `SBA Loan ${loanNumber} added successfully${loanData.manual ? ' (manual tracking)' : ''}` 
    });
  } catch (error) {
    console.error('Error adding SBA loan:', error);
    res.status(500).json({ error: 'Failed to add SBA loan' });
  }
});

router.get('/balance/:loanNumber', async (req, res) => {
  try {
    const { loanNumber } = req.params;
    
    if (!sbaLoanService.validateLoanNumber(loanNumber)) {
      return res.status(400).json({ 
        error: 'Invalid loan number format' 
      });
    }
    
    const balance = await sbaLoanService.getLoanBalance(loanNumber);
    res.json({ balance });
  } catch (error) {
    console.error('Error fetching loan balance:', error);
    res.status(500).json({ error: 'Failed to fetch loan balance' });
  }
});

router.get('/details/:loanNumber', async (req, res) => {
  try {
    const { loanNumber } = req.params;
    
    if (!sbaLoanService.validateLoanNumber(loanNumber)) {
      return res.status(400).json({ 
        error: 'Invalid loan number format' 
      });
    }
    
    const details = await sbaLoanService.getLoanDetails(loanNumber);
    res.json({ loan: details });
  } catch (error) {
    console.error('Error fetching loan details:', error);
    res.status(500).json({ error: 'Failed to fetch loan details' });
  }
});

router.get('/payments/:loanNumber', async (req, res) => {
  try {
    const { loanNumber } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!sbaLoanService.validateLoanNumber(loanNumber)) {
      return res.status(400).json({ 
        error: 'Invalid loan number format' 
      });
    }
    
    const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];
    
    const payments = await sbaLoanService.getPaymentHistory(loanNumber, start, end);
    res.json({ payments });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

router.post('/sync/:loanNumber', async (req, res) => {
  try {
    const { loanNumber } = req.params;
    const { company } = req.body;
    
    if (!sbaLoanService.validateLoanNumber(loanNumber)) {
      return res.status(400).json({ 
        error: 'Invalid loan number format' 
      });
    }
    
    const balance = await sbaLoanService.getLoanBalance(loanNumber);
    
    const debt = await Debt.findOneAndUpdate(
      { 
        name: `SBA Loan - ${loanNumber}`,
        source: 'sba_api'
      },
      {
        currentBalance: balance.currentBalance,
        minimumPayment: balance.monthlyPayment,
        lastUpdated: new Date(),
      },
      { upsert: true, new: true }
    );
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const payments = await sbaLoanService.getPaymentHistory(
      loanNumber, 
      startDate.toISOString().split('T')[0], 
      new Date().toISOString().split('T')[0]
    );
    
    let paymentTransactions = 0;
    for (const payment of payments) {
      await sbaLoanService.addPaymentTransaction(payment, company);
      paymentTransactions++;
    }
    
    res.json({ 
      success: true, 
      balance,
      debt,
      syncedPayments: paymentTransactions,
      message: `Synced loan ${loanNumber} - Balance: $${balance.currentBalance}` 
    });
  } catch (error) {
    console.error('Error syncing SBA loan:', error);
    res.status(500).json({ error: 'Failed to sync SBA loan' });
  }
});

router.post('/sync-all', async (req, res) => {
  try {
    const { borrowerId } = req.body;
    
    if (!borrowerId) {
      return res.status(400).json({ error: 'Borrower ID required' });
    }
    
    const results = await sbaLoanService.syncAllLoansForBorrower(borrowerId);
    
    res.json({ 
      success: true, 
      results,
      message: `Synced ${results.length} loans for borrower ${borrowerId}` 
    });
  } catch (error) {
    console.error('Error syncing all loans:', error);
    res.status(500).json({ error: 'Failed to sync all loans' });
  }
});

router.get('/list', async (req, res) => {
  try {
    const sbaLoans = await Debt.find({ 
      type: 'sba_loan',
      isActive: true 
    });
    
    res.json({ loans: sbaLoans });
  } catch (error) {
    console.error('Error fetching SBA loans:', error);
    res.status(500).json({ error: 'Failed to fetch SBA loans' });
  }
});

router.put('/update-manual/:loanNumber', async (req, res) => {
  try {
    const { loanNumber } = req.params;
    const { currentBalance, monthlyPayment, interestRate, nextPaymentDate } = req.body;
    
    const debt = await Debt.findOneAndUpdate(
      { 
        name: `SBA Loan - ${loanNumber}`,
        source: 'sba_api'
      },
      {
        currentBalance,
        minimumPayment: monthlyPayment,
        apr: interestRate,
        dueDate: nextPaymentDate,
        lastUpdated: new Date(),
      },
      { new: true }
    );
    
    if (!debt) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    res.json({ 
      success: true, 
      debt,
      message: `Loan ${loanNumber} updated successfully` 
    });
  } catch (error) {
    console.error('Error updating manual loan:', error);
    res.status(500).json({ error: 'Failed to update loan' });
  }
});

router.delete('/remove/:loanNumber', async (req, res) => {
  try {
    const { loanNumber } = req.params;
    
    const debt = await Debt.findOneAndUpdate(
      { 
        name: `SBA Loan - ${loanNumber}`,
        source: 'sba_api'
      },
      { isActive: false },
      { new: true }
    );
    
    if (!debt) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    res.json({ 
      success: true, 
      message: `Loan ${loanNumber} removed from tracking` 
    });
  } catch (error) {
    console.error('Error removing loan:', error);
    res.status(500).json({ error: 'Failed to remove loan' });
  }
});

module.exports = router;