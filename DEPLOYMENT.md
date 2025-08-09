# Deployment Guide - Personal Accounting App

## Prerequisites

- Node.js 18+ installed
- MongoDB database (local or cloud)
- Domain name (for production)
- SSL certificate (for production APIs)

## 1. Local Development Setup

### Install Dependencies
```bash
cd accounting-app
npm install
```

### Environment Configuration
1. Copy the environment template:
```bash
cp .env.example .env
```

2. Edit `.env` with your credentials (see credential setup below)

### Start Local Development
```bash
# Start MongoDB (if running locally)
mongod

# Start the application
npm run dev
```

The app will run on `http://localhost:5000`

## 2. Credential Setup Guide

### MongoDB
**Local MongoDB:**
```env
MONGODB_URI=mongodb://localhost:27017/accounting-app
```

**MongoDB Atlas (Cloud):**
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/accounting-app
```

### Plaid (Bank Account Integration)
1. Sign up at https://plaid.com
2. Go to Dashboard > Team Settings > Keys
3. Get your credentials:

```env
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret_key
PLAID_ENV=sandbox  # Use 'sandbox' for testing, 'production' for live
PLAID_PRODUCTS=transactions,accounts,liabilities
PLAID_COUNTRY_CODES=US
```

**Plaid Environments:**
- `sandbox`: Testing with fake data
- `development`: Testing with real bank credentials
- `production`: Live environment

### PayPal Integration
1. Go to https://developer.paypal.com
2. Create an app in your dashboard
3. Get your credentials:

```env
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=sandbox  # Use 'sandbox' for testing, 'live' for production
```

### Google Sheets API
1. Go to https://console.cloud.google.com
2. Create a new project or select existing
3. Enable Google Sheets API
4. Create Service Account credentials:
   - Go to APIs & Services > Credentials
   - Create Credentials > Service Account
   - Download the JSON key file

5. Extract from JSON file:
```env
GOOGLE_SHEETS_ID=your_google_sheet_id_from_url
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n"
```

6. Share your Google Sheet with the service account email

### Credit Card API Integrations

#### Capital One (Optional)
1. Apply for Capital One DevExchange at https://developer.capitalone.com
2. Create an app and get credentials:
```env
CAPITAL_ONE_CLIENT_ID=your_capital_one_client_id
CAPITAL_ONE_CLIENT_SECRET=your_capital_one_client_secret
CAPITAL_ONE_API_URL=https://api.capitalone.com
```

#### American Express (Optional)
1. Apply for Amex for Developers at https://developer.americanexpress.com
2. Create an app and get credentials:
```env
AMEX_CLIENT_ID=your_amex_client_id
AMEX_CLIENT_SECRET=your_amex_client_secret
AMEX_API_URL=https://api.americanexpress.com
```

**Note:** If you don't have API access for Capital One or Amex, the app will fall back to manual entry.

### SBA Loan API (Optional)
1. Contact SBA for API access at https://lending.sba.gov
2. Request developer credentials:
```env
SBA_CLIENT_ID=your_sba_client_id
SBA_CLIENT_SECRET=your_sba_client_secret
SBA_API_KEY=your_sba_api_key
SBA_BORROWER_ID=your_borrower_id
```

**Note:** If SBA API is not available, the app supports manual loan tracking.

### JWT Security
```env
JWT_SECRET=your_very_long_random_secret_key_here
```

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 3. Production Deployment Options

### Option A: Cloud VPS (Recommended)

#### DigitalOcean/Linode/AWS EC2
1. **Create a server** (Ubuntu 20.04+, minimum 1GB RAM)

2. **Install Node.js and MongoDB:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

3. **Deploy application:**
```bash
# Clone your code (or upload via SCP/SFTP)
git clone your-repo-url accounting-app
cd accounting-app

# Install dependencies
npm install --production

# Set environment variables
nano .env  # Add your credentials

# Install PM2 for process management
sudo npm install -g pm2

# Start the application
pm2 start server/index.js --name "accounting-app"
pm2 startup
pm2 save
```

4. **Set up Nginx reverse proxy:**
```bash
sudo apt install nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/accounting-app
```

Nginx config:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/accounting-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

5. **Install SSL certificate:**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Option B: Heroku Deployment

1. **Install Heroku CLI and login:**
```bash
heroku login
```

2. **Create Heroku app:**
```bash
heroku create your-accounting-app
```

3. **Add MongoDB addon:**
```bash
heroku addons:create mongolab:sandbox
```

4. **Set environment variables:**
```bash
heroku config:set NODE_ENV=production
heroku config:set PLAID_CLIENT_ID=your_plaid_client_id
heroku config:set PLAID_SECRET=your_plaid_secret
# ... add all other environment variables
```

5. **Deploy:**
```bash
git add .
git commit -m "Deploy to Heroku"
git push heroku main
```

### Option C: Docker Deployment

1. **Create Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
```

2. **Create docker-compose.yml:**
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/accounting-app
    depends_on:
      - mongo
    env_file:
      - .env

  mongo:
    image: mongo:6.0
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

volumes:
  mongodb_data:
```

3. **Deploy:**
```bash
docker-compose up -d
```

## 4. Initial Setup After Deployment

### Initialize the Database
```bash
# Initialize companies
curl -X POST http://your-domain.com/api/companies/initialize

# Initialize Google Sheets (if using)
curl -X POST http://your-domain.com/api/sheets/initialize-sheets
```

### Test the API
```bash
# Health check
curl http://your-domain.com/api/health

# Check companies
curl http://your-domain.com/api/companies/
```

## 5. Security Checklist

- [ ] Strong JWT secret (64+ characters)
- [ ] HTTPS enabled with valid SSL certificate
- [ ] MongoDB authentication enabled
- [ ] Firewall configured (only ports 80, 443, 22 open)
- [ ] Regular backups configured
- [ ] Environment variables not in version control
- [ ] API rate limiting enabled
- [ ] Server hardened (fail2ban, automatic updates)

## 6. Monitoring and Maintenance

### Set up monitoring:
```bash
# Log monitoring
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30

# System monitoring
sudo apt install htop iotop
```

### Backup script:
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --uri="$MONGODB_URI" --out="/backups/mongo_$DATE"
tar -czf "/backups/accounting_app_$DATE.tar.gz" /path/to/accounting-app
```

### Auto-sync cron job:
```bash
# Add to crontab (crontab -e)
*/30 * * * * cd /path/to/accounting-app && npm run sync >> /var/log/accounting-sync.log 2>&1
```

## 7. Troubleshooting

### Common Issues:

**MongoDB connection fails:**
- Check MongoDB is running: `sudo systemctl status mongod`
- Verify connection string in .env
- Check firewall rules

**Plaid integration fails:**
- Verify API keys are correct
- Check environment (sandbox vs production)
- Ensure HTTPS for production

**Google Sheets not syncing:**
- Verify service account has access to sheet
- Check sheet ID is correct
- Ensure private key format is correct

**Credit card APIs not working:**
- APIs fall back to manual entry automatically
- Check API credentials if needed
- Some APIs require business approval

### Logs:
```bash
# Application logs
pm2 logs accounting-app

# System logs
sudo journalctl -u nginx
sudo journalctl -u mongod
```

## 8. Cost Estimates

### Monthly Operating Costs:
- **VPS (DigitalOcean/Linode):** $5-20/month
- **MongoDB Atlas:** $0-9/month (free tier available)
- **Domain:** $10-15/year
- **SSL Certificate:** Free (Let's Encrypt)

### API Costs:
- **Plaid:** $0.30-0.60 per account/month
- **PayPal API:** Free
- **Google Sheets API:** Free (up to quotas)
- **Credit Card APIs:** Usually free for personal use

**Total estimated cost: $10-40/month**

This gives you a production-ready deployment that will automatically sync all your financial data across your 4 businesses!