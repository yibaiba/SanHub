#!/bin/bash

# Zero Downtime Deployment Script for SANHUB
# Usage: ./scripts/deploy.sh

set -e

echo "🚀 Starting zero-downtime deployment..."

# 1. Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install --production=false

# 3. Build Next.js app
echo "🔨 Building application..."
npm run build

# 4. Reload PM2 with zero downtime
echo "♻️  Reloading PM2 (zero downtime)..."
pm2 reload ecosystem.config.js --update-env

# 5. Check status
echo "✅ Deployment complete! Checking status..."
pm2 status

echo ""
echo "🎉 Deployment successful!"
echo "📊 View logs: pm2 logs sanhub"
echo "📈 Monitor: pm2 monit"
