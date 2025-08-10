const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const mongoose = require('mongoose');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();

const plaidRoutes = require('./routes/plaid');
const paypalRoutes = require('./routes/paypal');
const sheetsRoutes = require('./routes/sheets');
const transactionRoutes = require('./routes/transactions');
const dashboardRoutes = require('./routes/dashboard');
const companiesRoutes = require('./routes/companies');
const creditCardsRoutes = require('./routes/creditCards');
const sbaLoanRoutes = require('./routes/sbaLoan');
const syncJobs = require('./jobs/syncAll');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/accounting-app', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

app.use('/api/plaid', plaidRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/sheets', sheetsRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/credit-cards', creditCardsRoutes);
app.use('/api/sba-loans', sbaLoanRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

cron.schedule('*/30 * * * *', async () => {
  console.log('Running automatic sync job...');
  await syncJobs.syncAll();
});

cron.schedule('0 0 * * *', async () => {
  console.log('Running daily summary job...');
  await syncJobs.generateDailySummary();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Automatic sync scheduled every 30 minutes');
  console.log('Daily summary scheduled at midnight');
});