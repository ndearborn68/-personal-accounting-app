const OAuthClient = require('intuit-oauth');
const axios = require('axios');

class QuickBooksService {
  constructor() {
    this.oauthClient = new OAuthClient({
      clientId: process.env.QUICKBOOKS_CLIENT_ID,
      clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
      environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox',
      redirectUri: process.env.QUICKBOOKS_REDIRECT_URI
    });
  }

  // Generate OAuth URL for user to authorize
  getAuthorizationUrl() {
    return this.oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.Payment],
      state: 'intuit-test'
    });
  }

  // Exchange authorization code for tokens
  async createToken(authCode, realmId) {
    try {
      const authResponse = await this.oauthClient.createToken(authCode);
      
      // Store tokens and realmId (company ID)
      this.oauthClient.setToken(authResponse.token);
      this.realmId = realmId;
      
      return {
        accessToken: authResponse.token.access_token,
        refreshToken: authResponse.token.refresh_token,
        realmId: realmId,
        expiresIn: authResponse.token.expires_in
      };
    } catch (error) {
      console.error('Error creating token:', error);
      throw error;
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    try {
      const authResponse = await this.oauthClient.refreshUsingToken(refreshToken);
      return authResponse.token;
    } catch (error) {
      console.error('Error refreshing token:', error);
      throw error;
    }
  }

  // Get company info
  async getCompanyInfo(accessToken, realmId) {
    try {
      const baseUrl = process.env.QUICKBOOKS_ENVIRONMENT === 'production' 
        ? 'https://quickbooks.api.intuit.com' 
        : 'https://sandbox-quickbooks.api.intuit.com';
      
      const response = await axios.get(
        `${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error fetching company info:', error);
      throw error;
    }
  }

  // Get all accounts
  async getAccounts(accessToken, realmId) {
    try {
      const baseUrl = process.env.QUICKBOOKS_ENVIRONMENT === 'production' 
        ? 'https://quickbooks.api.intuit.com' 
        : 'https://sandbox-quickbooks.api.intuit.com';
      
      const response = await axios.get(
        `${baseUrl}/v3/company/${realmId}/query?query=select * from Account`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );
      
      return response.data.QueryResponse.Account || [];
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw error;
    }
  }

  // Get transactions (expenses, income, etc.)
  async getTransactions(accessToken, realmId, startDate, endDate) {
    try {
      const baseUrl = process.env.QUICKBOOKS_ENVIRONMENT === 'production' 
        ? 'https://quickbooks.api.intuit.com' 
        : 'https://sandbox-quickbooks.api.intuit.com';
      
      // Get expenses
      const expenseQuery = `select * from Purchase where TxnDate >= '${startDate}' and TxnDate <= '${endDate}'`;
      const expenseResponse = await axios.get(
        `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(expenseQuery)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );
      
      // Get income
      const incomeQuery = `select * from Invoice where TxnDate >= '${startDate}' and TxnDate <= '${endDate}'`;
      const incomeResponse = await axios.get(
        `${baseUrl}/v3/company/${realmId}/query?query=${encodeURIComponent(incomeQuery)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );
      
      return {
        expenses: expenseResponse.data.QueryResponse.Purchase || [],
        income: incomeResponse.data.QueryResponse.Invoice || []
      };
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  }

  // Get profit and loss report
  async getProfitAndLoss(accessToken, realmId, startDate, endDate) {
    try {
      const baseUrl = process.env.QUICKBOOKS_ENVIRONMENT === 'production' 
        ? 'https://quickbooks.api.intuit.com' 
        : 'https://sandbox-quickbooks.api.intuit.com';
      
      const response = await axios.get(
        `${baseUrl}/v3/company/${realmId}/reports/ProfitAndLoss?start_date=${startDate}&end_date=${endDate}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error fetching profit and loss:', error);
      throw error;
    }
  }

  // Sync QuickBooks data to local database
  async syncQuickBooksData(accessToken, realmId) {
    try {
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth() - 3, 1).toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];
      
      const [accounts, transactions, companyInfo] = await Promise.all([
        this.getAccounts(accessToken, realmId),
        this.getTransactions(accessToken, realmId, startDate, endDate),
        this.getCompanyInfo(accessToken, realmId)
      ]);
      
      // Process and save to database
      const processedTransactions = [];
      
      // Process expenses
      for (const expense of transactions.expenses) {
        processedTransactions.push({
          source: 'QuickBooks',
          sourceId: expense.Id,
          date: expense.TxnDate,
          amount: -expense.TotalAmt, // Negative for expenses
          description: expense.PrivateNote || expense.Line?.[0]?.Description || 'QuickBooks Expense',
          category: expense.AccountRef?.name || 'Uncategorized',
          merchant: expense.EntityRef?.name || 'Unknown',
          metadata: {
            quickbooksId: expense.Id,
            syncStatus: expense.SyncToken,
            type: 'expense'
          }
        });
      }
      
      // Process income
      for (const invoice of transactions.income) {
        processedTransactions.push({
          source: 'QuickBooks',
          sourceId: invoice.Id,
          date: invoice.TxnDate,
          amount: invoice.TotalAmt, // Positive for income
          description: invoice.PrivateNote || 'QuickBooks Income',
          category: 'Income',
          merchant: invoice.CustomerRef?.name || 'Unknown',
          metadata: {
            quickbooksId: invoice.Id,
            syncStatus: invoice.SyncToken,
            type: 'income'
          }
        });
      }
      
      return {
        companyInfo,
        accounts: accounts.length,
        transactions: processedTransactions,
        summary: {
          totalExpenses: transactions.expenses.length,
          totalIncome: transactions.income.length,
          totalAccounts: accounts.length
        }
      };
    } catch (error) {
      console.error('Error syncing QuickBooks data:', error);
      throw error;
    }
  }
}

module.exports = new QuickBooksService();