#!/bin/bash

# Quick Deploy Script for Personal Accounting App
# Usage: ./scripts/quick-deploy.sh [production|staging]

set -e

ENVIRONMENT=${1:-staging}
APP_NAME="accounting-app"
PM2_APP_NAME="accounting-app-$ENVIRONMENT"

echo "🚀 Deploying Personal Accounting App to $ENVIRONMENT"
echo "=================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   log_error "This script should not be run as root"
   exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    log_error ".env file not found!"
    log_info "Run 'node scripts/setup-credentials.js' first to set up credentials"
    exit 1
fi

# Install dependencies
log_info "Installing dependencies..."
npm install --production
log_success "Dependencies installed"

# Run database initialization
log_info "Initializing database..."
if curl -s -f -X POST http://localhost:5000/api/health > /dev/null 2>&1; then
    log_warning "Application is already running, skipping database init"
else
    # Start app temporarily for init
    npm start &
    APP_PID=$!
    sleep 5
    
    # Initialize companies
    if curl -s -f -X POST http://localhost:5000/api/companies/initialize > /dev/null 2>&1; then
        log_success "Companies initialized"
    else
        log_warning "Could not initialize companies - will initialize on first run"
    fi
    
    # Stop temporary instance
    kill $APP_PID 2>/dev/null || true
    sleep 2
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2 process manager..."
    npm install -g pm2
    log_success "PM2 installed"
fi

# Create PM2 ecosystem file
log_info "Creating PM2 configuration..."
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$PM2_APP_NAME',
    script: 'server/index.js',
    env: {
      NODE_ENV: '$ENVIRONMENT',
      PORT: process.env.PORT || 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 5000
    },
    instances: $ENVIRONMENT === 'production' ? 'max' : 1,
    exec_mode: $ENVIRONMENT === 'production' ? 'cluster' : 'fork',
    watch: false,
    max_memory_restart: '500M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Create logs directory
mkdir -p logs

# Stop existing instance
log_info "Stopping existing application..."
pm2 stop $PM2_APP_NAME 2>/dev/null || true
pm2 delete $PM2_APP_NAME 2>/dev/null || true

# Start application
log_info "Starting application..."
pm2 start ecosystem.config.js --env $ENVIRONMENT
pm2 save

log_success "Application deployed successfully!"

# Display status
echo ""
log_info "Application Status:"
pm2 status $PM2_APP_NAME

# Setup startup script (only on first deploy)
if [ ! -f "/etc/systemd/system/pm2-$(whoami).service" ]; then
    log_info "Setting up PM2 startup script..."
    pm2 startup systemd -u $(whoami) --hp $(eval echo ~$(whoami)) | tail -1 | sudo bash
    log_success "PM2 startup script configured"
fi

# Check application health
log_info "Checking application health..."
sleep 5

PORT=$(grep "^PORT=" .env | cut -d'=' -f2 | tr -d ' ' | head -1)
PORT=${PORT:-5000}

if curl -s -f http://localhost:$PORT/api/health > /dev/null; then
    log_success "Application is healthy and running on port $PORT"
    
    # Display useful information
    echo ""
    echo "🎉 DEPLOYMENT COMPLETE!"
    echo "======================"
    echo "Application: $PM2_APP_NAME"
    echo "Environment: $ENVIRONMENT"
    echo "Port: $PORT"
    echo "Status: $(pm2 jlist | jq -r '.[] | select(.name=="'$PM2_APP_NAME'") | .pm2_env.status')"
    echo ""
    echo "📊 Useful Commands:"
    echo "pm2 status                    # Check application status"
    echo "pm2 logs $PM2_APP_NAME       # View logs"
    echo "pm2 restart $PM2_APP_NAME    # Restart application"
    echo "pm2 stop $PM2_APP_NAME       # Stop application"
    echo "pm2 monit                     # Monitor resources"
    echo ""
    echo "🌐 Access your application:"
    echo "Local: http://localhost:$PORT"
    
    # Check if nginx is configured
    if command -v nginx &> /dev/null && [ -f "/etc/nginx/sites-enabled/$APP_NAME" ]; then
        DOMAIN=$(grep "server_name" /etc/nginx/sites-enabled/$APP_NAME | awk '{print $2}' | sed 's/;//')
        echo "Public: https://$DOMAIN (if DNS is configured)"
    else
        log_warning "Nginx not configured. See DEPLOYMENT.md for reverse proxy setup"
    fi
    
    echo ""
    echo "📈 Next steps:"
    echo "1. Set up SSL certificate if not done already"
    echo "2. Configure monitoring and backups"
    echo "3. Connect your bank accounts and credit cards"
    echo "4. Start tracking your business expenses!"
    
else
    log_error "Application failed to start properly"
    echo ""
    log_info "Checking logs..."
    pm2 logs $PM2_APP_NAME --lines 20
    exit 1
fi

# Optional: Run basic smoke tests
if [ "$ENVIRONMENT" = "production" ]; then
    log_info "Running smoke tests..."
    
    # Test API endpoints
    ENDPOINTS=("/api/health" "/api/companies" "/api/dashboard/summary")
    
    for endpoint in "${ENDPOINTS[@]}"; do
        if curl -s -f http://localhost:$PORT$endpoint > /dev/null; then
            log_success "✓ $endpoint"
        else
            log_warning "✗ $endpoint (may need initialization)"
        fi
    done
fi

echo ""
log_success "Deployment completed successfully! 🎉"