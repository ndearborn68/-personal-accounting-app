# Deploy to Render.com

Render is perfect for your accounting app - it's simple, affordable, and includes a free MongoDB database.

## Why Render?
✅ **Free tier available** (perfect for getting started)  
✅ **Automatic HTTPS** (secure by default)  
✅ **Git-based deployment** (deploy on every push)  
✅ **Built-in MongoDB** (no separate database needed)  
✅ **Environment variables** (secure credential storage)  
✅ **Auto-scaling** (handles traffic spikes)  

## Quick Deployment (5 Minutes)

### Step 1: Prepare Your Code

1. **Initialize Git repository** (if not already done):
```bash
cd C:\Users\isaac\accounting-app
git init
git add .
git commit -m "Initial commit - Personal Accounting App"
```

2. **Push to GitHub:**
   - Create a new repository on GitHub
   - Push your code:
```bash
git remote add origin https://github.com/yourusername/accounting-app.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy to Render

1. **Sign up at Render:** https://render.com
2. **Connect GitHub:** Link your GitHub account
3. **Create new Web Service:**
   - Click "New +" → "Web Service"
   - Select your `accounting-app` repository
   - Use these settings:
     - **Name:** `personal-accounting-app`
     - **Environment:** `Node`
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Plan:** `Starter` (Free)

### Step 3: Add Database

1. **Create MongoDB database:**
   - Click "New +" → "PostgreSQL" → Wait, we need MongoDB!
   - Unfortunately, Render doesn't have managed MongoDB
   - **Use MongoDB Atlas instead** (free tier):

2. **Set up MongoDB Atlas:**
   - Go to https://cloud.mongodb.com
   - Create free cluster (512MB storage)
   - Get connection string like: `mongodb+srv://username:password@cluster.mongodb.net/accounting`

### Step 4: Configure Environment Variables

In your Render dashboard, add these environment variables:

#### Required Variables:
```
NODE_ENV=production
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_64_character_random_string
```

#### Plaid (Bank Accounts):
```
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
PLAID_PRODUCTS=transactions,accounts,liabilities
PLAID_COUNTRY_CODES=US
```

#### PayPal:
```
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_secret
PAYPAL_MODE=sandbox
```

#### Google Sheets (Optional):
```
GOOGLE_SHEETS_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account_email
GOOGLE_PRIVATE_KEY=your_private_key_with_newlines
```

#### Credit Cards (Optional):
```
CAPITAL_ONE_CLIENT_ID=your_capital_one_id
CAPITAL_ONE_CLIENT_SECRET=your_capital_one_secret
AMEX_CLIENT_ID=your_amex_id
AMEX_CLIENT_SECRET=your_amex_secret
```

### Step 5: Deploy and Initialize

1. **Deploy:** Render will automatically deploy when you push to GitHub
2. **Wait for build** (usually 2-3 minutes)
3. **Initialize companies:** Once deployed, visit:
   ```
   https://your-app-name.onrender.com/api/companies/initialize
   ```

## Alternative: One-Click Render Deployment

I can create a "Deploy to Render" button for even easier deployment:

### Method 1: Manual Render Deployment (Recommended)
Follow the steps above for full control.

### Method 2: Quick Deploy Button
1. **Fork the repository** on GitHub
2. **Click deploy button** (when available)
3. **Configure environment variables**

## Cost Breakdown

### Free Tier (Perfect for Starting):
- **Render Web Service:** Free (sleeps after 15min inactivity)
- **MongoDB Atlas:** Free (512MB storage)
- **Custom domain:** Free
- **SSL certificate:** Free (automatic)
- **Total:** $0/month

### Paid Tier (Production Ready):
- **Render Web Service:** $7/month (always on, 512MB RAM)
- **MongoDB Atlas:** $9/month (2GB storage, backup)
- **Total:** $16/month

## Production Configuration

For production use, update these settings:

### Environment Variables:
```
NODE_ENV=production
PLAID_ENV=production  # Use real bank data
PAYPAL_MODE=live      # Use live PayPal
```

### Custom Domain:
1. **Add domain in Render dashboard**
2. **Point DNS to Render:**
   - Add CNAME: `your-domain.com` → `your-app.onrender.com`
   - SSL certificate is automatic

### Monitoring:
- **Health checks:** Automatic (uses `/api/health` endpoint)
- **Logs:** Available in Render dashboard
- **Alerts:** Email notifications on failures

## Advantages of Render vs Other Platforms

| Feature | Render | Heroku | Vercel | Railway |
|---------|--------|--------|---------|----------|
| **Free tier** | ✅ Good | ✅ Limited | ❌ Functions only | ✅ Limited |
| **Auto HTTPS** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Database** | ➕ MongoDB Atlas | ➕ Add-ons | ❌ External only | ✅ Built-in |
| **Sleeping** | 😴 15min inactivity | 😴 30min inactivity | ❌ N/A | ❌ No sleeping |
| **Build time** | ⚡ Fast | ⚡ Fast | ⚡ Very fast | ⚡ Fast |
| **Pricing** | 💰 $7/month | 💰 $7/month | 💰 $20/month | 💰 $5/month |

## Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Render account created and GitHub connected
- [ ] Web service created with correct build settings
- [ ] MongoDB Atlas database created
- [ ] Environment variables configured
- [ ] Application deployed successfully
- [ ] Health check passing (`/api/health`)
- [ ] Companies initialized (`/api/companies/initialize`)
- [ ] UI accessible at your Render URL
- [ ] Bank accounts ready to connect
- [ ] Credit cards ready to add

## Troubleshooting

### Build Fails:
- Check Node.js version in `package.json`
- Verify all dependencies are in `package.json`
- Check build logs in Render dashboard

### App Won't Start:
- Verify `PORT` environment variable (should be automatic)
- Check start command: `npm start`
- Review application logs

### Database Connection Fails:
- Verify MongoDB Atlas connection string
- Check IP whitelist (allow all: `0.0.0.0/0`)
- Ensure database user has read/write permissions

### Environment Variables:
- Use Render dashboard to add variables
- Sensitive values are automatically encrypted
- Restart service after adding variables

## Next Steps After Deployment

1. **Test the deployment:** Visit your Render URL
2. **Connect integrations:** Add Plaid, PayPal, etc.
3. **Add credit cards:** Connect or manually add cards
4. **Start expense tracking:** Begin allocating transactions
5. **Set up monitoring:** Configure alerts and backups

Your accounting app will be live at: `https://your-app-name.onrender.com` 🚀

## Support

- **Render Documentation:** https://render.com/docs
- **MongoDB Atlas:** https://docs.atlas.mongodb.com
- **Your app health:** `https://your-app.onrender.com/api/health`