const axios = require('axios');

class SBALoanService {
  constructor() {
    this.baseURL = 'https://lending.sba.gov/api';
    this.apiKey = process.env.SBA_API_KEY;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async authenticate() {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/oauth/token`,
        {
          grant_type: 'client_credentials',
          client_id: process.env.SBA_CLIENT_ID,
          client_secret: process.env.SBA_CLIENT_SECRET,
        },
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 60) * 1000);
      
      return this.accessToken;
    } catch (error) {
      console.error('Error authenticating with SBA API:', error);
      throw new Error('SBA authentication failed. Using manual tracking instead.');
    }
  }

  async getLoanDetails(loanNumber) {
    try {
      const token = await this.authenticate();
      
      const response = await axios.get(
        `${this.baseURL}/loans/${loanNumber}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-API-Key': this.apiKey,
          },
        }
      );

      return this.formatLoanData(response.data);
    } catch (error) {
      console.error('Error fetching SBA loan details:', error);
      
      if (error.response?.status === 404) {
        throw new Error('Loan not found. Please verify the loan number.');
      }
      
      throw new Error('Unable to fetch loan details from SBA. Manual tracking required.');
    }
  }

  async getLoanBalance(loanNumber) {
    try {
      const token = await this.authenticate();
      
      const response = await axios.get(
        `${this.baseURL}/loans/${loanNumber}/balance`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-API-Key': this.apiKey,
          },
        }
      );

      return {
        loanNumber,
        currentBalance: response.data.outstanding_balance,
        originalAmount: response.data.original_loan_amount,
        principalPaid: response.data.principal_paid,
        interestPaid: response.data.interest_paid,
        totalPaid: response.data.total_paid,
        nextPaymentDate: response.data.next_payment_date,
        monthlyPayment: response.data.monthly_payment_amount,
        interestRate: response.data.interest_rate,
        maturityDate: response.data.maturity_date,
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error('Error fetching SBA loan balance:', error);
      return this.createManualEntry(loanNumber);
    }
  }

  async getPaymentHistory(loanNumber, startDate, endDate) {
    try {
      const token = await this.authenticate();
      
      const response = await axios.get(
        `${this.baseURL}/loans/${loanNumber}/payments`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-API-Key': this.apiKey,
          },
          params: {
            start_date: startDate,
            end_date: endDate,
          },
        }
      );

      return response.data.payments.map(payment => ({
        paymentId: payment.payment_id,
        date: new Date(payment.payment_date),
        amount: payment.payment_amount,
        principalAmount: payment.principal_amount,
        interestAmount: payment.interest_amount,
        balanceAfterPayment: payment.remaining_balance,
        paymentStatus: payment.status,
        paymentMethod: payment.payment_method,
      }));
    } catch (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }
  }

  async getAllLoansForBorrower(borrowerId) {
    try {
      const token = await this.authenticate();
      
      const response = await axios.get(
        `${this.baseURL}/borrowers/${borrowerId}/loans`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-API-Key': this.apiKey,
          },
        }
      );

      return response.data.loans.map(loan => this.formatLoanData(loan));
    } catch (error) {
      console.error('Error fetching borrower loans:', error);
      return [];
    }
  }

  formatLoanData(loanData) {
    return {
      loanNumber: loanData.loan_number,
      borrowerName: loanData.borrower_name,
      loanType: loanData.loan_program,
      originalAmount: loanData.original_loan_amount,
      currentBalance: loanData.outstanding_balance,
      interestRate: loanData.interest_rate,
      termMonths: loanData.loan_term_months,
      monthlyPayment: loanData.monthly_payment,
      originationDate: new Date(loanData.origination_date),
      maturityDate: new Date(loanData.maturity_date),
      nextPaymentDate: new Date(loanData.next_payment_date),
      status: loanData.loan_status,
      lender: loanData.lender_name,
      collateral: loanData.collateral_description,
      guaranteePercentage: loanData.sba_guarantee_percentage,
      lastUpdated: new Date(),
    };
  }

  createManualEntry(loanNumber) {
    return {
      loanNumber,
      currentBalance: 0,
      originalAmount: 0,
      principalPaid: 0,
      interestPaid: 0,
      totalPaid: 0,
      nextPaymentDate: null,
      monthlyPayment: 0,
      interestRate: 0,
      maturityDate: null,
      lastUpdated: new Date(),
      manual: true,
      note: 'Manual entry - SBA API not available or loan not found',
    };
  }

  async syncAllLoansForBorrower(borrowerId) {
    try {
      const loans = await this.getAllLoansForBorrower(borrowerId);
      const results = [];

      for (const loan of loans) {
        try {
          const balance = await this.getLoanBalance(loan.loanNumber);
          results.push({
            loanNumber: loan.loanNumber,
            status: 'success',
            balance,
          });
        } catch (error) {
          results.push({
            loanNumber: loan.loanNumber,
            status: 'error',
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error syncing all loans:', error);
      throw error;
    }
  }

  async createLoanDebtEntry(loanData, companyName) {
    const Debt = require('../models/Debt');
    
    const debtData = {
      name: `SBA Loan - ${loanData.loanNumber}`,
      type: 'sba_loan',
      source: 'sba_api',
      currentBalance: loanData.currentBalance,
      originalBalance: loanData.originalAmount,
      minimumPayment: loanData.monthlyPayment,
      apr: loanData.interestRate,
      dueDate: loanData.nextPaymentDate,
      isActive: true,
      metadata: {
        loanNumber: loanData.loanNumber,
        lender: loanData.lender,
        loanType: loanData.loanType,
        maturityDate: loanData.maturityDate,
        guaranteePercentage: loanData.guaranteePercentage,
        company: companyName,
      },
    };

    return Debt.findOneAndUpdate(
      { 
        name: debtData.name,
        source: 'sba_api',
      },
      debtData,
      { upsert: true, new: true }
    );
  }

  async addPaymentTransaction(paymentData, companyName) {
    const Transaction = require('../models/Transaction');
    
    const transactionData = {
      source: 'sba_loan',
      sourceId: `sba_payment_${paymentData.paymentId}`,
      accountId: 'sba_loan_payment',
      company: companyName || 'Unallocated',
      date: paymentData.date,
      amount: paymentData.amount,
      description: `SBA Loan Payment - Principal: $${paymentData.principalAmount}, Interest: $${paymentData.interestAmount}`,
      merchant: 'SBA Loan Payment',
      category: 'Loan Payment',
      subcategory: 'Business Loan',
      type: 'debit',
      businessPurpose: 'Loan payment for business financing',
      taxDeductible: paymentData.interestAmount > 0,
      metadata: {
        loanNumber: paymentData.loanNumber,
        principalAmount: paymentData.principalAmount,
        interestAmount: paymentData.interestAmount,
        balanceAfterPayment: paymentData.balanceAfterPayment,
        paymentMethod: paymentData.paymentMethod,
      },
    };

    return Transaction.findOneAndUpdate(
      { sourceId: transactionData.sourceId },
      transactionData,
      { upsert: true, new: true }
    );
  }

  validateLoanNumber(loanNumber) {
    const loanPattern = /^\d{10}$/;
    return loanPattern.test(loanNumber);
  }
}

module.exports = new SBALoanService();