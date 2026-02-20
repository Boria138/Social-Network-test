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

# Обновление до Node.js 20 LTS (требуется для зависимостей)
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "Updating Node.js 18 -> Node.js 20 LTS..."
    apt-get update
    apt-get install -y curl
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
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
rm -rf node_modules package-lock.json
npm install --omit=dev

# Create .env if not exists
if [ ! -f .env ]; then
    echo "PORT=3000" > .env
    echo "NODE_ENV=production" >> .env
else
    # Если .env существует, убедиться, что PORT установлен
    if ! grep -q "^PORT=" .env; then
        echo "PORT=3000" >> .env
    fi
fi

# Get PORT from .env file
if [ -f .env ]; then
    PORT=$(grep "^PORT=" .env | cut -d'=' -f2)
    if [ -z "$PORT" ]; then
        PORT=80
    fi
else
    PORT=80
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

# Открыть порт в firewall
ufw allow $PORT

echo ""
echo "========================================="
echo "Deployed successfully!"
echo "========================================="
ENDSSH

rm /tmp/discord-clone.tar.gz

# Получить PORT из .env файла на удаленном сервере
PORT=$(ssh $SERVER "cd $APP_DIR/server && grep '^PORT=' .env | cut -d'=' -f2")
if [ -z "$PORT" ]; then
    PORT=3000
fi

SERVER_IP=$(echo $SERVER | cut -d'@' -f2)
echo ""
echo "========================================="
echo "Done! Open: http://$SERVER_IP:$PORT"
echo "========================================="
