const axios = require('axios');

class PayPalService {
  constructor() {
    this.baseURL = process.env.PAYPAL_MODE === 'live' 
      ? 'https://api.paypal.com' 
      : 'https://api.sandbox.paypal.com';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
      ).toString('base64');

      const response = await axios.post(
        `${this.baseURL}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 60) * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('Error getting PayPal access token:', error);
      throw error;
    }
  }

  async getBalance() {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseURL}/v1/reporting/balances`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error fetching PayPal balance:', error);
      throw error;
    }
  }

  async getTransactions(startDate, endDate) {
    try {
      const token = await this.getAccessToken();
      
      const params = {
        start_date: startDate,
        end_date: endDate,
        fields: 'all',
        page_size: 100,
        page: 1,
      };

      const response = await axios.get(
        `${this.baseURL}/v1/reporting/transactions`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          params,
        }
      );

      return response.data.transaction_details || [];
    } catch (error) {
      console.error('Error fetching PayPal transactions:', error);
      throw error;
    }
  }

  async getAccountInfo() {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseURL}/v1/identity/oauth2/userinfo`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          params: {
            schema: 'paypalv1.1',
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error fetching PayPal account info:', error);
      throw error;
    }
  }

  async getActivities(startDate, endDate) {
    try {
      const token = await this.getAccessToken();
      
      const response = await axios.get(
        `${this.baseURL}/v2/activities/activities`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          params: {
            start_date: startDate,
            end_date: endDate,
            page_size: 100,
          },
        }
      );

      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching PayPal activities:', error);
      throw error;
    }
  }

  formatTransactionForDB(paypalTransaction) {
    return {
      source: 'paypal',
      sourceId: paypalTransaction.transaction_info?.transaction_id,
      date: new Date(paypalTransaction.transaction_info?.transaction_initiation_date),
      amount: Math.abs(parseFloat(paypalTransaction.transaction_info?.transaction_amount?.value || 0)),
      currency: paypalTransaction.transaction_info?.transaction_amount?.currency_code || 'USD',
      description: paypalTransaction.transaction_info?.transaction_subject || 
                   paypalTransaction.transaction_info?.transaction_note || 
                   'PayPal Transaction',
      category: this.categorizeTransaction(paypalTransaction),
      type: parseFloat(paypalTransaction.transaction_info?.transaction_amount?.value || 0) < 0 ? 'debit' : 'credit',
      status: paypalTransaction.transaction_info?.transaction_status,
      merchant: paypalTransaction.payer_info?.payer_name?.alternate_full_name || 
                paypalTransaction.payer_info?.email_address,
      metadata: {
        paypalStatus: paypalTransaction.transaction_info?.transaction_status,
        paypalType: paypalTransaction.transaction_info?.transaction_event_code,
      },
    };
  }

  categorizeTransaction(transaction) {
    const subject = (transaction.transaction_info?.transaction_subject || '').toLowerCase();
    const note = (transaction.transaction_info?.transaction_note || '').toLowerCase();
    const text = `${subject} ${note}`;

    if (text.includes('food') || text.includes('restaurant') || text.includes('coffee')) {
      return 'Food & Dining';
    } else if (text.includes('uber') || text.includes('lyft') || text.includes('gas')) {
      return 'Transportation';
    } else if (text.includes('amazon') || text.includes('ebay') || text.includes('shop')) {
      return 'Shopping';
    } else if (text.includes('netflix') || text.includes('spotify') || text.includes('game')) {
      return 'Entertainment';
    } else if (text.includes('electric') || text.includes('water') || text.includes('internet')) {
      return 'Bills & Utilities';
    } else {
      return 'Other';
    }
  }
}

module.exports = new PayPalService();