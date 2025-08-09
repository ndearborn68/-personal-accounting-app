# Personal Accounting App

An automated personal finance tracking application that aggregates data from multiple sources including bank accounts (via Plaid), PayPal, credit cards, and Google Sheets.

## Features

- **Automatic Data Sync**: Runs independently every 30 minutes to fetch latest transactions
- **Multiple Data Sources**: 
  - Bank accounts via Plaid API
  - PayPal transactions
  - Credit card charges
  - Debt tracking from Google Sheets
- **Daily Summaries**: Automatic daily spending reports
- **Real-time Dashboard**: View all financial data in one place
- **Category Tracking**: Automatic categorization of expenses
- **Debt Management**: Track and manage debts with payment history

## Setup Instructions

### Prerequisites

- Node.js 16+ and npm
- MongoDB (local or cloud instance)
- Accounts/API Keys for:
  - Plaid (https://plaid.com)
  - PayPal Developer (https://developer.paypal.com)
  - Google Cloud Console (for Sheets API)

### Installation

1. **Clone and install dependencies:**
```bash
cd accounting-app
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
```

Edit `.env` with your actual credentials:
- MongoDB connection string
- Plaid API credentials
- PayPal API credentials
- Google Sheets API credentials
- JWT secret

3. **Set up Google Sheets API:**
   - Go to Google Cloud Console
   - Create a new project or select existing
   - Enable Google Sheets API
   - Create a Service Account
   - Download the credentials JSON
   - Add the service account email and private key to `.env`
   - Share your Google Sheet with the service account email

4. **Set up Plaid:**
   - Sign up at https://plaid.com
   - Get your client ID and secret
   - Start with sandbox mode for testing

5. **Set up PayPal:**
   - Create a PayPal Developer account
   - Create an app to get client ID and secret
   - Use sandbox mode for testing

### Running the Application

1. **Start MongoDB:**
```bash
mongod
```

2. **Start the backend server:**
```bash
npm start
```

The server will run on `http://localhost:5000`

3. **Initialize Google Sheets (first time only):**
```bash
curl -X POST http://localhost:5000/api/sheets/initialize-sheets
```

### API Endpoints

#### Dashboard
- `GET /api/dashboard/summary` - Get financial summary
- `GET /api/dashboard/recent-transactions` - Get recent transactions
- `GET /api/dashboard/spending-trends` - Get spending trends
- `GET /api/dashboard/category-breakdown` - Get expense categories

#### Plaid Integration
- `POST /api/plaid/create-link-token` - Create Plaid Link token
- `POST /api/plaid/exchange-public-token` - Connect bank account
- `POST /api/plaid/sync-accounts` - Manually sync accounts

#### PayPal Integration
- `POST /api/paypal/connect` - Connect PayPal account
- `GET /api/paypal/balance` - Get PayPal balance
- `POST /api/paypal/sync` - Manually sync PayPal

#### Google Sheets
- `GET /api/sheets/debts` - Get debts from Google Sheets
- `POST /api/sheets/sync-debts` - Sync debt information

#### Transactions
- `GET /api/transactions` - Get filtered transactions
- `POST /api/transactions` - Add manual transaction
- `GET /api/transactions/stats/summary` - Get transaction statistics

### Automatic Syncing

The app automatically syncs data:
- Every 30 minutes for all connected accounts
- Daily at midnight for summary generation

To manually trigger sync:
```bash
npm run sync
```

### Frontend Setup

To use the HTML UI:
1. Open `accounting-app-ui.html` in your browser
2. Update the API endpoints in the HTML to point to your backend

For a full React frontend (pending):
```bash
cd client
npm install
npm start
```

## Project Structure

```
accounting-app/
├── server/
│   ├── index.js              # Main server file
│   ├── models/               # MongoDB schemas
│   │   ├── Transaction.js
│   │   ├── Account.js
│   │   └── Debt.js
│   ├── services/             # API integrations
│   │   ├── plaidService.js
│   │   ├── paypalService.js
│   │   └── googleSheetsService.js
│   ├── routes/               # API endpoints
│   │   ├── dashboard.js
│   │   ├── plaid.js
│   │   ├── paypal.js
│   │   ├── sheets.js
│   │   └── transactions.js
│   └── jobs/                 # Scheduled tasks
│       └── syncAll.js
├── client/                   # React frontend (to be built)
├── package.json
├── .env.example
└── README.md
```

## Security Notes

- Never commit `.env` file to version control
- Use strong JWT secrets
- Enable MongoDB authentication in production
- Use HTTPS in production
- Implement rate limiting for API endpoints
- Regularly rotate API keys

## Troubleshooting

1. **MongoDB connection fails:**
   - Ensure MongoDB is running
   - Check connection string in `.env`

2. **Plaid sync fails:**
   - Verify API credentials
   - Check if in correct environment (sandbox/development/production)

3. **Google Sheets not updating:**
   - Verify service account has edit access to the sheet
   - Check sheet ID in `.env`

4. **PayPal transactions missing:**
   - Ensure correct date range
   - Check API permissions

## License

Private use only