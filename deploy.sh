#!/bin/bash

# Discord Clone Deploy Script
# Usage: ./deploy.sh user@your-server-ip
# Preserves database and uploads on update

set -e

if [ -z "$1" ]; then
    echo "Usage: ./deploy.sh user@server-ip"
    echo "Example: ./deploy.sh root@192.168.1.100"
    exit 1
fi

SERVER=$1
APP_DIR="/opt/discord-clone"

echo "==> Building client..."
cd "$(dirname "$0")/client"
node build.js
cd ..

echo "==> Creating archive..."
tar --exclude='node_modules' --exclude='.git' --exclude='*.db' --exclude='uploads' \
    -czf /tmp/discord-clone.tar.gz \
    server client/dist

echo "==> Uploading to $SERVER..."
scp /tmp/discord-clone.tar.gz "$SERVER:/tmp/"

echo "==> Installing on server..."
ssh "$SERVER" << 'ENDSSH'
set -e

APP_DIR="/opt/discord-clone"

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    apt-get update
    apt-get install -y nodejs npm
fi

# Install PM2 if not present
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# Create app directory
mkdir -p $APP_DIR

# Backup database and uploads before update
if [ -f "$APP_DIR/server/discord_clone.db" ]; then
    echo "Backing up database..."
    cp "$APP_DIR/server/discord_clone.db" /tmp/discord_clone.db.bak
fi

if [ -d "$APP_DIR/server/uploads" ]; then
    echo "Backing up uploads..."
    cp -r "$APP_DIR/server/uploads" /tmp/uploads.bak
fi

# Backup .env
if [ -f "$APP_DIR/server/.env" ]; then
    cp "$APP_DIR/server/.env" /tmp/env.bak
fi

# Extract new files (overwrites old code)
cd $APP_DIR
rm -rf server client
tar -xzf /tmp/discord-clone.tar.gz
rm /tmp/discord-clone.tar.gz

# Restore database
if [ -f /tmp/discord_clone.db.bak ]; then
    echo "Restoring database..."
    mv /tmp/discord_clone.db.bak "$APP_DIR/server/discord_clone.db"
fi

# Restore uploads
if [ -d /tmp/uploads.bak ]; then
    echo "Restoring uploads..."
    mv /tmp/uploads.bak "$APP_DIR/server/uploads"
fi

# Restore .env
if [ -f /tmp/env.bak ]; then
    mv /tmp/env.bak "$APP_DIR/server/.env"
fi

# Install server dependencies
cd server
npm install --production

# Create .env if not exists
if [ ! -f .env ]; then
    echo "PORT=3000" > .env
    echo "NODE_ENV=production" >> .env
fi

# Restart or start server
if pm2 describe discord-api > /dev/null 2>&1; then
    echo "Restarting server..."
    pm2 restart discord-api
else
    echo "Starting server..."
    pm2 start server.js --name discord-api
fi
pm2 save

echo ""
echo "========================================="
echo "Deployed successfully!"
echo "========================================="
ENDSSH

rm /tmp/discord-clone.tar.gz

SERVER_IP=$(echo $SERVER | cut -d'@' -f2)
echo ""
echo "========================================="
echo "Done! Open: http://$SERVER_IP:3000"
echo "========================================="
