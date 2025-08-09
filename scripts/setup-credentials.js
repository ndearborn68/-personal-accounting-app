#!/usr/bin/env node

/**
 * Interactive credential setup script
 * Run with: node scripts/setup-credentials.js
 */

const readline = require('readline');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const envPath = path.join(__dirname, '..', '.env');

async function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function questionSecret(prompt) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    let password = '';
    stdin.on('data', function(char) {
      char = char + '';
      
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          resolve(password);
          break;
        case '\u0003':
          process.exit();
          break;
        default:
          stdout.write('*');
          password += char;
          break;
      }
    });
  });
}

async function setupCredentials() {
  console.log('🏦 Personal Accounting App - Credential Setup');
  console.log('==========================================\n');

  const credentials = {};

  // Basic Configuration
  console.log('📋 BASIC CONFIGURATION');
  credentials.NODE_ENV = await question('Environment (development/production) [development]: ') || 'development';
  credentials.PORT = await question('Server port [5000]: ') || '5000';

  // MongoDB
  console.log('\n💾 MONGODB CONFIGURATION');
  const mongoChoice = await question('Use MongoDB Atlas cloud (y) or local MongoDB (n)? [y]: ');
  
  if (mongoChoice.toLowerCase() === 'n' || mongoChoice.toLowerCase() === 'no') {
    credentials.MONGODB_URI = 'mongodb://localhost:27017/accounting-app';
  } else {
    console.log('Go to https://cloud.mongodb.com to create a free cluster');
    credentials.MONGODB_URI = await question('MongoDB connection string: ');
  }

  // JWT Secret
  console.log('\n🔐 SECURITY');
  const generateJWT = await question('Generate secure JWT secret automatically? [y]: ');
  if (generateJWT.toLowerCase() !== 'n' && generateJWT.toLowerCase() !== 'no') {
    credentials.JWT_SECRET = crypto.randomBytes(64).toString('hex');
    console.log('✅ JWT secret generated automatically');
  } else {
    credentials.JWT_SECRET = await question('Enter JWT secret (64+ characters): ');
  }

  // Plaid
  console.log('\n🏦 PLAID (BANK ACCOUNTS)');
  const setupPlaid = await question('Setup Plaid for bank account integration? [y]: ');
  if (setupPlaid.toLowerCase() !== 'n' && setupPlaid.toLowerCase() !== 'no') {
    console.log('Sign up at https://plaid.com and get your API keys');
    credentials.PLAID_CLIENT_ID = await question('Plaid Client ID: ');
    credentials.PLAID_SECRET = await questionSecret('Plaid Secret Key: ');
    credentials.PLAID_ENV = await question('Plaid Environment (sandbox/development/production) [sandbox]: ') || 'sandbox';
    credentials.PLAID_PRODUCTS = 'transactions,accounts,liabilities';
    credentials.PLAID_COUNTRY_CODES = 'US';
  }

  // PayPal
  console.log('\n💳 PAYPAL');
  const setupPayPal = await question('Setup PayPal integration? [y]: ');
  if (setupPayPal.toLowerCase() !== 'n' && setupPayPal.toLowerCase() !== 'no') {
    console.log('Go to https://developer.paypal.com to create an app');
    credentials.PAYPAL_CLIENT_ID = await question('PayPal Client ID: ');
    credentials.PAYPAL_CLIENT_SECRET = await questionSecret('PayPal Client Secret: ');
    credentials.PAYPAL_MODE = await question('PayPal Mode (sandbox/live) [sandbox]: ') || 'sandbox';
  }

  // Google Sheets
  console.log('\n📊 GOOGLE SHEETS');
  const setupSheets = await question('Setup Google Sheets for debt tracking? [y]: ');
  if (setupSheets.toLowerCase() !== 'n' && setupSheets.toLowerCase() !== 'no') {
    console.log('Go to https://console.cloud.google.com:');
    console.log('1. Create a project');
    console.log('2. Enable Google Sheets API');
    console.log('3. Create Service Account credentials');
    console.log('4. Download the JSON key file');
    credentials.GOOGLE_SHEETS_ID = await question('Google Sheet ID (from URL): ');
    credentials.GOOGLE_SERVICE_ACCOUNT_EMAIL = await question('Service Account Email: ');
    console.log('Paste the private key (including -----BEGIN/END PRIVATE KEY-----):');
    credentials.GOOGLE_PRIVATE_KEY = await question('Private Key: ');
  }

  // Credit Card APIs (Optional)
  console.log('\n💳 CREDIT CARD APIS (Optional - Manual entry available)');
  
  const setupCapitalOne = await question('Setup Capital One API? [n]: ');
  if (setupCapitalOne.toLowerCase() === 'y' || setupCapitalOne.toLowerCase() === 'yes') {
    console.log('Apply for Capital One DevExchange at https://developer.capitalone.com');
    credentials.CAPITAL_ONE_CLIENT_ID = await question('Capital One Client ID: ');
    credentials.CAPITAL_ONE_CLIENT_SECRET = await questionSecret('Capital One Client Secret: ');
    credentials.CAPITAL_ONE_API_URL = 'https://api.capitalone.com';
  }

  const setupAmex = await question('Setup American Express API? [n]: ');
  if (setupAmex.toLowerCase() === 'y' || setupAmex.toLowerCase() === 'yes') {
    console.log('Apply for Amex for Developers at https://developer.americanexpress.com');
    credentials.AMEX_CLIENT_ID = await question('Amex Client ID: ');
    credentials.AMEX_CLIENT_SECRET = await questionSecret('Amex Client Secret: ');
    credentials.AMEX_API_URL = 'https://api.americanexpress.com';
  }

  // SBA Loan API (Optional)
  console.log('\n🏛️ SBA LOAN API (Optional - Manual entry available)');
  const setupSBA = await question('Setup SBA Loan API? [n]: ');
  if (setupSBA.toLowerCase() === 'y' || setupSBA.toLowerCase() === 'yes') {
    console.log('Contact SBA for API access at https://lending.sba.gov');
    credentials.SBA_CLIENT_ID = await question('SBA Client ID: ');
    credentials.SBA_CLIENT_SECRET = await questionSecret('SBA Client Secret: ');
    credentials.SBA_API_KEY = await question('SBA API Key: ');
    credentials.SBA_BORROWER_ID = await question('SBA Borrower ID: ');
  }

  // Email Notifications (Optional)
  console.log('\n📧 EMAIL NOTIFICATIONS (Optional)');
  const setupEmail = await question('Setup email notifications? [n]: ');
  if (setupEmail.toLowerCase() === 'y' || setupEmail.toLowerCase() === 'yes') {
    credentials.EMAIL_USER = await question('Gmail address: ');
    credentials.EMAIL_PASS = await questionSecret('Gmail app password: ');
    credentials.EMAIL_TO = await question('Notification recipient email: ');
  }

  // Write .env file
  console.log('\n📝 Writing configuration file...');
  
  let envContent = '# Personal Accounting App Configuration\n';
  envContent += '# Generated on ' + new Date().toISOString() + '\n\n';

  // Group credentials by category
  const categories = {
    'BASIC CONFIGURATION': ['NODE_ENV', 'PORT'],
    'DATABASE': ['MONGODB_URI'],
    'SECURITY': ['JWT_SECRET'],
    'PLAID (BANK ACCOUNTS)': ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV', 'PLAID_PRODUCTS', 'PLAID_COUNTRY_CODES'],
    'PAYPAL': ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_MODE'],
    'GOOGLE SHEETS': ['GOOGLE_SHEETS_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY'],
    'CAPITAL ONE (OPTIONAL)': ['CAPITAL_ONE_CLIENT_ID', 'CAPITAL_ONE_CLIENT_SECRET', 'CAPITAL_ONE_API_URL'],
    'AMERICAN EXPRESS (OPTIONAL)': ['AMEX_CLIENT_ID', 'AMEX_CLIENT_SECRET', 'AMEX_API_URL'],
    'SBA LOAN API (OPTIONAL)': ['SBA_CLIENT_ID', 'SBA_CLIENT_SECRET', 'SBA_API_KEY', 'SBA_BORROWER_ID'],
    'EMAIL NOTIFICATIONS (OPTIONAL)': ['EMAIL_USER', 'EMAIL_PASS', 'EMAIL_TO']
  };

  for (const [category, keys] of Object.entries(categories)) {
    const categoryCredentials = keys.filter(key => credentials[key]);
    if (categoryCredentials.length > 0) {
      envContent += `# ${category}\n`;
      for (const key of categoryCredentials) {
        if (key === 'GOOGLE_PRIVATE_KEY') {
          envContent += `${key}="${credentials[key]}"\n`;
        } else {
          envContent += `${key}=${credentials[key]}\n`;
        }
      }
      envContent += '\n';
    }
  }

  fs.writeFileSync(envPath, envContent);
  
  console.log('✅ Configuration saved to .env file');
  
  // Summary
  console.log('\n🎉 SETUP COMPLETE!');
  console.log('==================');
  console.log('Your credentials have been saved to .env file.');
  console.log('\nNext steps:');
  console.log('1. Install dependencies: npm install');
  console.log('2. Initialize companies: npm run init-companies');
  console.log('3. Start the application: npm run dev');
  console.log('\nThe app will be available at http://localhost:' + (credentials.PORT || '5000'));
  
  if (credentials.GOOGLE_SHEETS_ID) {
    console.log('\n📊 Don\'t forget to:');
    console.log('- Share your Google Sheet with: ' + credentials.GOOGLE_SERVICE_ACCOUNT_EMAIL);
    console.log('- Initialize sheets: curl -X POST http://localhost:5000/api/sheets/initialize-sheets');
  }

  console.log('\n💡 Pro tip: Check DEPLOYMENT.md for production deployment instructions!');
}

// Add init-companies script to package.json
function addInitScript() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  if (!packageJson.scripts['init-companies']) {
    packageJson.scripts['init-companies'] = 'node -e "require(\'./server/models/Company\'); const axios = require(\'axios\'); axios.post(\'http://localhost:5000/api/companies/initialize\').then(() => console.log(\'Companies initialized\')).catch(console.error);"';
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  }
}

async function main() {
  try {
    await setupCredentials();
    addInitScript();
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { setupCredentials };