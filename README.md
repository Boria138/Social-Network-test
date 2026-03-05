# Voxii

Real-time chat application with voice/video calls, file sharing, and notifications.

Works on Linux, Windows, Android and any platform with a browser.

## Features

- **Authentication** — session tokens, bcrypt hashing
- **Real-time chat** — direct messages (DM), system news channel, Socket.IO
- **Voice/Video calls** — WebRTC, HD video, voice activity detection
- **Screen sharing** — full screen or individual windows
- **File sharing** — up to 10MB, images, documents, media
- **Reactions** — emoji on messages
- **User search** — find and add friends
- **System News Channel** — official channel for announcements (forced subscription)
- **Voice message transcription** — speech-to-text via whisper-cpp

## Project Structure

```
voxii/
├── client/                 # Web client
│   ├── index.html
│   ├── login.html
│   └── package.json
├── server/                 # API server
│   ├── server.js           # Express + Socket.IO
│   ├── database.js         # SQLite
│   └── package.json
├── deploy.sh               # Deploy script
└── README.md
```

## Build and Run

```bash
# Build project (install dependencies and build client)
npm run build:all

# Or client only
npm run build

# Full build and run production
npm run serve
```

## Deploy to VPS

Client and server are hosted together — one port, one address.

```bash
./deploy.sh root@YOUR_SERVER_IP
```

After deploy open: `http://YOUR_SERVER_IP:3000`

### What the script does

1. Builds client (`npm run build`)
2. Uploads `server/` and `client/dist/` to VPS
3. Installs Node.js and PM2 (if not installed)
4. Starts server via PM2

### Manual Deploy

```bash
# Local - build client
cd client && npm install && npm run build && cd ..

# Upload to server
scp -r server client/dist root@YOUR_SERVER_IP:/opt/voxii/

# On server
ssh root@YOUR_SERVER_IP
cd /opt/voxii/server
npm install --production
npm install -g pm2
pm2 start server.js --name voxii
pm2 save
```

### Open Port

```bash
ufw allow 3000
```

## Configuration

### server/.env

```env
PORT=3000
NODE_ENV=production
SSL_CERT=/root/cert/cert.crt
SSL_KEY=/root/cert/secret.key
WHISPER_CPP_PATH=/usr/local/bin/whisper-cli
WHISPER_CPP_MODEL=/usr/local/share/whisper.cpp/ggml-tiny-q8_0.bin
```

## API

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/register | Register new user |
| POST | /api/login | Login (returns session token) |
| POST | /api/logout | Logout (requires token) |
| GET | /api/user/profile | Get current user profile |
| PUT | /api/user/profile | Update user profile |

### Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List all users |
| GET | /api/users/search?q=query | Search users by name |

### Direct Messages (DM)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/dm/:userId | Get chat history with user |
| POST | /api/dm/:userId | Send message to user |
| PUT | /api/dm/:messageId | Edit your message |
| DELETE | /api/dm/:messageId | Delete message |
| POST | /api/dm/:messageId/reaction | Add reaction to message |
| DELETE | /api/dm/:messageId/reaction/:emoji | Remove reaction from message |

### Friends

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/friends | List friends |
| GET | /api/friends/pending | Pending friend requests |
| POST | /api/friends/request | Send friend request |
| POST | /api/friends/accept | Accept friend request |
| POST | /api/friends/reject | Reject friend request |
| DELETE | /api/friends/:friendId | Remove friend |

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/notifications | Get all notifications |
| GET | /api/notifications/unread | Get unread notifications |
| POST | /api/notifications/mark-all-read | Mark all as read |
| POST | /api/notifications/mark-user-read | Mark notifications from user as read |
| DELETE | /api/notifications/:notificationId | Delete notification |
| DELETE | /api/notifications | Delete all notifications |

### Servers and Channels

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/servers | Create server |
| GET | /api/servers | List user's servers |
| GET | /api/servers/:serverId/members | Server members |
| GET | /api/channels/system | System news channel |

### Files and Media

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/upload | Upload file (max 10MB) |
| POST | /api/transcribe | Transcribe voice message |
| GET | /api/link-preview | Get link preview (Open Graph) |

## PM2 Commands

```bash
pm2 status              # Status
pm2 logs voxii          # Logs
pm2 restart voxii       # Restart
pm2 stop voxii          # Stop
```

## Troubleshooting

### Site won't open
- Check port 3000 is open: `ufw allow 3000`
- Check status: `pm2 status`
- View logs: `pm2 logs voxii`

### Camera/microphone not working
- WebRTC requires HTTPS (except localhost)
- Configure nginx with SSL certificate

### Transcription not working
- Check whisper-cpp installation: `whisper-cli --help`
- Verify model is downloaded: `ls /usr/local/share/whisper.cpp/`
- For VPS with 1GB RAM use `tiny-q8_0` model (~40MB RAM)
- Check logs: `pm2 logs voxii | grep Transcribe`

## License

MIT
