const plaidService = require('../services/plaidService');
const paypalService = require('../services/paypalService');
const googleSheetsService = require('../services/googleSheetsService');
const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const Debt = require('../models/Debt');

class SyncJobs {
  async syncAll() {
    console.log('Starting comprehensive sync at', new Date().toISOString());
    
    const results = {
      plaid: { success: false, count: 0, error: null },
      paypal: { success: false, count: 0, error: null },
      sheets: { success: false, count: 0, error: null },
    };

    try {
      results.plaid = await this.syncPlaidAccounts();
    } catch (error) {
      results.plaid.error = error.message;
      console.error('Plaid sync error:', error);
    }

    try {
      results.paypal = await this.syncPayPalTransactions();
    } catch (error) {
      results.paypal.error = error.message;
      console.error('PayPal sync error:', error);
    }

    try {
      results.sheets = await this.syncGoogleSheets();
    } catch (error) {
      results.sheets.error = error.message;
      console.error('Google Sheets sync error:', error);
    }

    console.log('Sync completed:', results);
    return results;
  }

  async syncPlaidAccounts() {
    const accounts = await Account.find({ 
      source: 'plaid', 
      isActive: true 
    });

    let totalTransactions = 0;

    for (const account of accounts) {
      try {
        const transactions = await plaidService.syncTransactions(account.accessToken);
        
        for (const transaction of transactions) {
          await this.saveTransaction({
            source: 'plaid',
            sourceId: transaction.transaction_id,
            accountId: account._id.toString(),
            date: new Date(transaction.date),
            amount: Math.abs(transaction.amount),
            currency: transaction.iso_currency_code || 'USD',
            description: transaction.name,
            merchant: transaction.merchant_name,
            category: transaction.category?.[0] || 'Other',
            subcategory: transaction.category?.[1],
            type: transaction.amount > 0 ? 'debit' : 'credit',
            pending: transaction.pending,
            metadata: {
              plaidCategory: transaction.category,
              paymentChannel: transaction.payment_channel,
            },
            location: transaction.location ? {
              address: transaction.location.address,
              city: transaction.location.city,
              region: transaction.location.region,
              postalCode: transaction.location.postal_code,
              country: transaction.location.country,
              lat: transaction.location.lat,
              lon: transaction.location.lon,
            } : undefined,
          });
          totalTransactions++;
        }

        const balances = await plaidService.getBalances(account.accessToken);
        for (const balance of balances) {
          if (balance.account_id === account.sourceAccountId) {
            await account.updateBalance(
              balance.balances.current,
              balance.balances.available
            );
          }
        }
      } catch (error) {
        await account.markSyncError(error.message);
        throw error;
      }
    }

    return { success: true, count: totalTransactions };
  }

  async syncPayPalTransactions() {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];

    const transactions = await paypalService.getTransactions(startDateStr, endDate);
    let savedCount = 0;

    for (const transaction of transactions) {
      const formatted = paypalService.formatTransactionForDB(transaction);
      
      const paypalAccount = await Account.findOne({ 
        source: 'paypal',
        isActive: true 
      });

      if (paypalAccount) {
        formatted.accountId = paypalAccount._id.toString();
        await this.saveTransaction(formatted);
        savedCount++;
      }
    }

    const balance = await paypalService.getBalance();
    if (balance && balance.balances) {
      const paypalAccount = await Account.findOne({ 
        source: 'paypal',
        isActive: true 
      });
      
      if (paypalAccount) {
        const totalBalance = balance.balances.reduce((sum, b) => {
          return sum + parseFloat(b.available_balance?.value || 0);
        }, 0);
        
        await paypalAccount.updateBalance(totalBalance, totalBalance);
      }
    }

    return { success: true, count: savedCount };
  }

  async syncGoogleSheets() {
    const debts = await googleSheetsService.getDebts();
    let updatedCount = 0;

    for (const debtData of debts) {
      const existingDebt = await Debt.findOne({ 
        name: debtData.name,
        source: 'google_sheets'
      });

      if (existingDebt) {
        existingDebt.currentBalance = debtData.currentBalance;
        existingDebt.creditLimit = debtData.creditLimit;
        existingDebt.minimumPayment = debtData.minimumPayment;
        existingDebt.lastUpdated = new Date();
        await existingDebt.save();
      } else {
        await Debt.create(debtData);
      }
      updatedCount++;
    }

    return { success: true, count: updatedCount };
  }

  async saveTransaction(transactionData) {
    try {
      await Transaction.findOneAndUpdate(
        { sourceId: transactionData.sourceId },
        transactionData,
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('Error saving transaction:', error);
    }
  }

  async generateDailySummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const transactions = await Transaction.find({
      date: { $gte: today, $lt: tomorrow },
      type: 'debit'
    });

    const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);
    const categories = {};
    
    transactions.forEach(t => {
      categories[t.category] = (categories[t.category] || 0) + t.amount;
    });

    const topCategory = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])[0];

    const summary = {
      date: today.toISOString().split('T')[0],
      totalSpent: totalSpent.toFixed(2),
      transactionCount: transactions.length,
      topCategory: topCategory ? topCategory[0] : 'None',
      topCategoryAmount: topCategory ? topCategory[1].toFixed(2) : 0,
      averageTransaction: transactions.length > 0 
        ? (totalSpent / transactions.length).toFixed(2) 
        : 0,
    };

    await googleSheetsService.updateSpendingSummary(
      summary.date,
      summary
    );

    console.log('Daily summary generated:', summary);
    return summary;
  }

  async syncCreditCards() {
    console.log('Syncing credit card transactions...');
  }
}

module.exports = new SyncJobs();