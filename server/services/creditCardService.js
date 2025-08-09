const axios = require('axios');
const plaidService = require('./plaidService');

class CreditCardService {
  constructor() {
    this.providers = {
      barclays: {
        name: 'Barclays',
        supportedCards: ['Barclays Arrival Plus', 'Barclays AAdvantage', 'Barclays View'],
        plaidInstitutionId: 'ins_3',
        manualEntry: true,
      },
      capitalOne: {
        name: 'Capital One',
        supportedCards: ['Venture', 'Savor', 'Quicksilver', 'Spark Business'],
        plaidInstitutionId: 'ins_128026',
        apiEndpoint: process.env.CAPITAL_ONE_API_URL,
        manualEntry: false,
      },
      bankOfAmerica: {
        name: 'Bank of America',
        supportedCards: ['Cash Rewards', 'Travel Rewards', 'Premium Rewards'],
        plaidInstitutionId: 'ins_4',
        manualEntry: false,
      },
      americanExpress: {
        name: 'American Express',
        supportedCards: ['Platinum', 'Gold', 'Blue Cash', 'Business Platinum'],
        plaidInstitutionId: 'ins_11',
        apiEndpoint: process.env.AMEX_API_URL,
        manualEntry: false,
      },
      chase: {
        name: 'Chase',
        supportedCards: ['Sapphire Preferred', 'Sapphire Reserve', 'Freedom', 'Ink Business'],
        plaidInstitutionId: 'ins_56',
        manualEntry: false,
      },
    };
  }

  async connectCreditCard(provider, credentials) {
    const providerInfo = this.providers[provider];
    
    if (!providerInfo) {
      throw new Error(`Provider ${provider} not supported`);
    }

    if (providerInfo.plaidInstitutionId && !providerInfo.manualEntry) {
      return this.connectViaPlaid(provider, providerInfo.plaidInstitutionId);
    } else if (providerInfo.apiEndpoint) {
      return this.connectViaDirectAPI(provider, credentials);
    } else {
      return this.createManualEntry(provider, credentials);
    }
  }

  async connectViaPlaid(provider, institutionId) {
    try {
      const linkToken = await plaidService.createLinkToken('default-user');
      return {
        provider,
        connectionType: 'plaid',
        linkToken: linkToken.link_token,
        institutionId,
        message: 'Use Plaid Link to connect your card',
      };
    } catch (error) {
      console.error(`Error connecting ${provider} via Plaid:`, error);
      throw error;
    }
  }

  async connectViaDirectAPI(provider, credentials) {
    switch (provider) {
      case 'capitalOne':
        return this.connectCapitalOne(credentials);
      case 'americanExpress':
        return this.connectAmex(credentials);
      default:
        throw new Error(`Direct API not implemented for ${provider}`);
    }
  }

  async connectCapitalOne(credentials) {
    try {
      if (!process.env.CAPITAL_ONE_CLIENT_ID || !process.env.CAPITAL_ONE_CLIENT_SECRET) {
        return this.createManualEntry('capitalOne', credentials);
      }

      const tokenResponse = await axios.post(
        'https://api.capitalone.com/oauth2/token',
        {
          client_id: process.env.CAPITAL_ONE_CLIENT_ID,
          client_secret: process.env.CAPITAL_ONE_CLIENT_SECRET,
          grant_type: 'client_credentials',
        }
      );

      const accessToken = tokenResponse.data.access_token;

      const accountsResponse = await axios.get(
        'https://api.capitalone.com/accounts',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
          }
        }
      );

      return {
        provider: 'capitalOne',
        connectionType: 'direct_api',
        accounts: accountsResponse.data.accounts,
        accessToken,
      };
    } catch (error) {
      console.error('Capital One API error, falling back to manual:', error.message);
      return this.createManualEntry('capitalOne', credentials);
    }
  }

  async connectAmex(credentials) {
    try {
      if (!process.env.AMEX_CLIENT_ID || !process.env.AMEX_CLIENT_SECRET) {
        return this.createManualEntry('americanExpress', credentials);
      }

      const auth = Buffer.from(
        `${process.env.AMEX_CLIENT_ID}:${process.env.AMEX_CLIENT_SECRET}`
      ).toString('base64');

      const tokenResponse = await axios.post(
        'https://api.americanexpress.com/oauth/v2/token',
        'grant_type=client_credentials&scope=card_accounts',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          }
        }
      );

      const accessToken = tokenResponse.data.access_token;

      const accountsResponse = await axios.get(
        'https://api.americanexpress.com/accounts/v1/card_accounts',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        }
      );

      return {
        provider: 'americanExpress',
        connectionType: 'direct_api',
        accounts: accountsResponse.data.card_accounts,
        accessToken,
      };
    } catch (error) {
      console.error('Amex API error, falling back to manual:', error.message);
      return this.createManualEntry('americanExpress', credentials);
    }
  }

  async createManualEntry(provider, credentials) {
    const providerInfo = this.providers[provider];
    
    return {
      provider,
      connectionType: 'manual',
      providerName: providerInfo.name,
      cardDetails: {
        lastFourDigits: credentials.lastFourDigits,
        cardType: credentials.cardType,
        creditLimit: credentials.creditLimit,
        currentBalance: credentials.currentBalance || 0,
        statementBalance: credentials.statementBalance || 0,
        availableCredit: credentials.creditLimit - (credentials.currentBalance || 0),
        dueDate: credentials.dueDate,
        minimumPayment: credentials.minimumPayment,
      },
      requiresManualSync: true,
      message: `${providerInfo.name} card added for manual tracking. You'll need to update transactions manually or upload statements.`,
    };
  }

  async fetchTransactions(provider, accessToken, startDate, endDate) {
    switch (provider) {
      case 'capitalOne':
        return this.fetchCapitalOneTransactions(accessToken, startDate, endDate);
      case 'americanExpress':
        return this.fetchAmexTransactions(accessToken, startDate, endDate);
      default:
        return this.fetchPlaidTransactions(provider, accessToken, startDate, endDate);
    }
  }

  async fetchCapitalOneTransactions(accessToken, startDate, endDate) {
    try {
      const response = await axios.get(
        'https://api.capitalone.com/transactions',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          params: {
            start_date: startDate,
            end_date: endDate,
          }
        }
      );

      return response.data.transactions.map(t => this.formatTransaction(t, 'capitalOne'));
    } catch (error) {
      console.error('Error fetching Capital One transactions:', error);
      return [];
    }
  }

  async fetchAmexTransactions(accessToken, startDate, endDate) {
    try {
      const response = await axios.get(
        'https://api.americanexpress.com/transactions/v1/card_transactions',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          params: {
            from_date: startDate,
            to_date: endDate,
          }
        }
      );

      return response.data.transactions.map(t => this.formatTransaction(t, 'americanExpress'));
    } catch (error) {
      console.error('Error fetching Amex transactions:', error);
      return [];
    }
  }

  async fetchPlaidTransactions(provider, accessToken, startDate, endDate) {
    try {
      const transactions = await plaidService.getTransactions(accessToken, startDate, endDate);
      return transactions.transactions.map(t => this.formatTransaction(t, 'plaid'));
    } catch (error) {
      console.error('Error fetching Plaid transactions:', error);
      return [];
    }
  }

  formatTransaction(transaction, source) {
    if (source === 'plaid') {
      return {
        source: 'credit_card',
        sourceId: transaction.transaction_id,
        date: new Date(transaction.date),
        amount: Math.abs(transaction.amount),
        description: transaction.name,
        merchant: transaction.merchant_name,
        category: transaction.category?.[0] || 'Other',
        type: transaction.amount > 0 ? 'debit' : 'credit',
        pending: transaction.pending,
        cardProvider: transaction.account_id,
      };
    } else if (source === 'capitalOne') {
      return {
        source: 'credit_card',
        sourceId: `cap1_${transaction.id}`,
        date: new Date(transaction.transaction_date),
        amount: Math.abs(transaction.amount),
        description: transaction.description,
        merchant: transaction.merchant,
        category: transaction.category || 'Other',
        type: transaction.amount > 0 ? 'debit' : 'credit',
        pending: transaction.status === 'pending',
        cardProvider: 'Capital One',
      };
    } else if (source === 'americanExpress') {
      return {
        source: 'credit_card',
        sourceId: `amex_${transaction.reference_id}`,
        date: new Date(transaction.charge_date),
        amount: Math.abs(transaction.amount),
        description: transaction.description,
        merchant: transaction.merchant_name,
        category: transaction.category || 'Other',
        type: 'debit',
        pending: transaction.is_pending,
        cardProvider: 'American Express',
      };
    }
  }

  async parseStatementPDF(pdfBuffer, provider) {
    return {
      provider,
      transactions: [],
      summary: {
        statementDate: new Date(),
        totalCharges: 0,
        totalPayments: 0,
        newBalance: 0,
      },
      message: 'PDF parsing requires additional setup. Transactions can be entered manually.',
    };
  }

  async importCSV(csvData, provider) {
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    const transactions = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      if (values.length === headers.length) {
        const transaction = {};
        headers.forEach((header, index) => {
          transaction[header.trim().toLowerCase()] = values[index].trim();
        });
        transactions.push(this.parseCSVTransaction(transaction, provider));
      }
    }

    return transactions;
  }

  parseCSVTransaction(row, provider) {
    return {
      source: 'credit_card',
      sourceId: `${provider}_csv_${Date.now()}_${Math.random()}`,
      date: new Date(row.date || row.transaction_date),
      amount: Math.abs(parseFloat(row.amount || row.debit || 0)),
      description: row.description || row.merchant || '',
      merchant: row.merchant || row.description || '',
      category: row.category || 'Other',
      type: parseFloat(row.amount || 0) < 0 ? 'credit' : 'debit',
      cardProvider: provider,
    };
  }
}

module.exports = new CreditCardService();