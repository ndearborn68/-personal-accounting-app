const { google } = require('googleapis');

class GoogleSheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.initialize();
  }

  initialize() {
    try {
      const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      
      this.auth = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        privateKey,
        ['https://www.googleapis.com/auth/spreadsheets']
      );

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    } catch (error) {
      console.error('Error initializing Google Sheets service:', error);
    }
  }

  async getDebts() {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEETS_ID,
        range: 'Debts!A:F',
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return [];
      }

      const headers = rows[0];
      const debts = rows.slice(1).map(row => {
        const debt = {};
        headers.forEach((header, index) => {
          debt[this.normalizeHeader(header)] = row[index] || '';
        });
        return this.formatDebtForDB(debt);
      });

      return debts;
    } catch (error) {
      console.error('Error fetching debts from Google Sheets:', error);
      throw error;
    }
  }

  async updateDebt(debtName, updates) {
    try {
      const debts = await this.getDebts();
      const debtIndex = debts.findIndex(d => d.name === debtName);
      
      if (debtIndex === -1) {
        throw new Error(`Debt ${debtName} not found`);
      }

      const rowNumber = debtIndex + 2;
      const values = [Object.values(updates)];

      const response = await this.sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEETS_ID,
        range: `Debts!A${rowNumber}:F${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: { values },
      });

      return response.data;
    } catch (error) {
      console.error('Error updating debt in Google Sheets:', error);
      throw error;
    }
  }

  async addTransaction(transaction) {
    try {
      const values = [[
        new Date().toISOString(),
        transaction.description,
        transaction.amount,
        transaction.category,
        transaction.source,
        transaction.merchant || '',
      ]];

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEETS_ID,
        range: 'Transactions!A:F',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });

      return response.data;
    } catch (error) {
      console.error('Error adding transaction to Google Sheets:', error);
      throw error;
    }
  }

  async getMonthlyBudget() {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SHEETS_ID,
        range: 'Budget!A:C',
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        return [];
      }

      const headers = rows[0];
      const budget = rows.slice(1).map(row => {
        const item = {};
        headers.forEach((header, index) => {
          item[this.normalizeHeader(header)] = row[index] || '';
        });
        return item;
      });

      return budget;
    } catch (error) {
      console.error('Error fetching budget from Google Sheets:', error);
      throw error;
    }
  }

  async updateSpendingSummary(date, summary) {
    try {
      const values = [[
        date,
        summary.totalSpent,
        summary.transactionCount,
        summary.topCategory,
        summary.averageTransaction,
      ]];

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEETS_ID,
        range: 'DailySummary!A:E',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });

      return response.data;
    } catch (error) {
      console.error('Error updating spending summary:', error);
      throw error;
    }
  }

  normalizeHeader(header) {
    return header
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  formatDebtForDB(debt) {
    return {
      name: debt.creditor || debt.name || '',
      type: debt.type || 'credit_card',
      currentBalance: parseFloat(debt.current_balance || debt.balance || 0),
      creditLimit: parseFloat(debt.credit_limit || debt.limit || 0),
      minimumPayment: parseFloat(debt.minimum_payment || debt.min_payment || 0),
      apr: parseFloat(debt.apr || debt.interest_rate || 0),
      dueDate: debt.due_date || '',
      source: 'google_sheets',
      lastUpdated: new Date(),
    };
  }

  async createSheetIfNotExists(sheetName) {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      });

      const sheetExists = response.data.sheets.some(
        sheet => sheet.properties.title === sheetName
      );

      if (!sheetExists) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: process.env.GOOGLE_SHEETS_ID,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            }],
          },
        });

        const headers = this.getHeadersForSheet(sheetName);
        if (headers) {
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            range: `${sheetName}!A1:${String.fromCharCode(65 + headers.length - 1)}1`,
            valueInputOption: 'RAW',
            requestBody: { values: [headers] },
          });
        }
      }
    } catch (error) {
      console.error(`Error creating sheet ${sheetName}:`, error);
      throw error;
    }
  }

  getHeadersForSheet(sheetName) {
    const headers = {
      'Debts': ['Creditor', 'Type', 'Current Balance', 'Credit Limit', 'Minimum Payment', 'Due Date'],
      'Transactions': ['Date', 'Description', 'Amount', 'Category', 'Source', 'Merchant'],
      'Budget': ['Category', 'Budgeted Amount', 'Spent'],
      'DailySummary': ['Date', 'Total Spent', 'Transaction Count', 'Top Category', 'Average Transaction'],
    };
    return headers[sheetName] || null;
  }
}

module.exports = new GoogleSheetsService();