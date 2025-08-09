const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

class PlaidService {
  async createLinkToken(userId) {
    try {
      const request = {
        user: { client_user_id: userId },
        client_name: 'Personal Accounting App',
        products: process.env.PLAID_PRODUCTS.split(','),
        country_codes: process.env.PLAID_COUNTRY_CODES.split(','),
        language: 'en',
      };

      const response = await plaidClient.linkTokenCreate(request);
      return response.data;
    } catch (error) {
      console.error('Error creating link token:', error);
      throw error;
    }
  }

  async exchangePublicToken(publicToken) {
    try {
      const response = await plaidClient.itemPublicTokenExchange({
        public_token: publicToken,
      });
      return response.data.access_token;
    } catch (error) {
      console.error('Error exchanging public token:', error);
      throw error;
    }
  }

  async getAccounts(accessToken) {
    try {
      const response = await plaidClient.accountsGet({
        access_token: accessToken,
      });
      return response.data.accounts;
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw error;
    }
  }

  async getTransactions(accessToken, startDate, endDate) {
    try {
      const response = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
        options: {
          count: 500,
          offset: 0,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  }

  async getBalances(accessToken) {
    try {
      const response = await plaidClient.accountsBalanceGet({
        access_token: accessToken,
      });
      return response.data.accounts;
    } catch (error) {
      console.error('Error fetching balances:', error);
      throw error;
    }
  }

  async getLiabilities(accessToken) {
    try {
      const response = await plaidClient.liabilitiesGet({
        access_token: accessToken,
      });
      return response.data.liabilities;
    } catch (error) {
      console.error('Error fetching liabilities:', error);
      throw error;
    }
  }

  async syncTransactions(accessToken) {
    try {
      let hasMore = true;
      let cursor = null;
      const allTransactions = [];

      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: cursor,
        });

        allTransactions.push(...response.data.added);
        hasMore = response.data.has_more;
        cursor = response.data.next_cursor;
      }

      return allTransactions;
    } catch (error) {
      console.error('Error syncing transactions:', error);
      throw error;
    }
  }

  async removeItem(accessToken) {
    try {
      const response = await plaidClient.itemRemove({
        access_token: accessToken,
      });
      return response.data;
    } catch (error) {
      console.error('Error removing item:', error);
      throw error;
    }
  }
}

module.exports = new PlaidService();