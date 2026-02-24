require('dotenv').config();

const express = require('express');
const http = require('http');
const https = require('https');
const socketIO = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const { initializeDatabase, userDB, dmDB, fileDB, reactionDB, friendDB, serverDB, channelDB, sessionDB, notificationDB } = require('./database');

const app = express();

// Check for SSL certificates
const certPath = process.env.SSL_CERT;
const keyPath = process.env.SSL_KEY;
const useSSL = certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath);

let server;
if (useSSL) {
    const sslOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
    };
    server = https.createServer(sslOptions, app);
    console.log('HTTPS enabled');
} else {
    server = http.createServer(app);
    console.log('HTTP mode (no SSL certificates found)');
}

const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const PORT = process.env.PORT || 3000;

// Generate random token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Authenticate token from database
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        const session = await sessionDB.findBySessionId(token);
        if (!session) {
            return res.status(403).json({ error: 'Invalid token' });
        }

        // Optionally check if session has expired
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            await sessionDB.deleteBySessionId(token);
            return res.status(403).json({ error: 'Session expired' });
        }

        const user = await userDB.findById(session.user_id);
        if (!user) {
            return res.status(403).json({ error: 'User not found' });
        }

        req.user = { id: user.id, email: user.email };
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
}

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));
app.use(express.json());

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// Serve client static files
const clientDir = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
            'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/webm', 'audio/opus',
            'video/mp4', 'video/webm', 'video/quicktime',
            'application/zip', 'application/x-rar-compressed'
        ];

        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf', '.doc', '.docx',
                                   '.txt', '.mp3', '.mp4', '.webm', '.mov', '.zip', '.rar', '.ogg', '.opus'];

        const ext = path.extname(file.originalname).toLowerCase();

        if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(null, true);
        }
    }
});

// Initialize database
initializeDatabase();
// Start session cleanup
sessionDB.cleanup();

// Link Preview API - fetch Open Graph metadata from URL
app.get('/api/link-preview', async (req, res) => {
    const { url } = req.query;

    if (!url || !url.startsWith('http')) {
        return res.status(400).json({ error: 'Valid URL required' });
    }

    try {
        // Security: Block private IP ranges
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        
        // Block localhost and private IPs
        if (hostname === 'localhost' || 
            hostname === '127.0.0.1' ||
            hostname.match(/^10\./) ||
            hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
            hostname.match(/^192\.168\./) ||
            hostname.match(/^169\.254\./)) {
            return res.status(403).json({ error: 'Access to private URLs is not allowed' });
        }

        const response = await new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            const request = client.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
                    'Accept': 'text/html',
                },
                timeout: 10000,
                maxRedirects: 5
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });

            request.on('error', reject);
            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });

        if (response.statusCode !== 200) {
            return res.status(404).json({ error: 'Failed to fetch URL' });
        }

        // Limit response size
        const MAX_SIZE = 500 * 1024; // 500KB
        if (response.data.length > MAX_SIZE) {
            response.data = response.data.substring(0, MAX_SIZE);
        }

        const dom = new JSDOM(response.data);
        const doc = dom.window.document;

        const metadata = {
            url: url,
            title: '',
            description: '',
            image: '',
            siteName: '',
            favicon: ''
        };

        // Open Graph tags
        const ogTitle = doc.querySelector('meta[property="og:title"]');
        if (ogTitle) metadata.title = ogTitle.getAttribute('content') || '';

        const ogDesc = doc.querySelector('meta[property="og:description"]');
        if (ogDesc) metadata.description = ogDesc.getAttribute('content') || '';

        const ogImage = doc.querySelector('meta[property="og:image"]');
        if (ogImage) {
            let imgUrl = ogImage.getAttribute('content') || '';
            if (imgUrl && imgUrl.startsWith('/')) {
                imgUrl = urlObj.origin + imgUrl;
            }
            metadata.image = imgUrl;
        }

        const ogSiteName = doc.querySelector('meta[property="og:site_name"]');
        if (ogSiteName) metadata.siteName = ogSiteName.getAttribute('content') || '';

        // Twitter Card tags (fallback)
        if (!metadata.title) {
            const twitterTitle = doc.querySelector('meta[name="twitter:title"]');
            if (twitterTitle) metadata.title = twitterTitle.getAttribute('content') || '';
        }
        if (!metadata.description) {
            const twitterDesc = doc.querySelector('meta[name="twitter:description"]');
            if (twitterDesc) metadata.description = twitterDesc.getAttribute('content') || '';
        }
        if (!metadata.image) {
            const twitterImage = doc.querySelector('meta[name="twitter:image"]');
            if (twitterImage) {
                let imgUrl = twitterImage.getAttribute('content') || '';
                if (imgUrl && imgUrl.startsWith('/')) {
                    imgUrl = urlObj.origin + imgUrl;
                }
                metadata.image = imgUrl;
            }
        }

        // Fallback to regular meta tags
        if (!metadata.title) {
            const metaTitle = doc.querySelector('meta[name="title"]');
            if (metaTitle) metadata.title = metaTitle.getAttribute('content') || '';
        }
        if (!metadata.title) {
            const docTitle = doc.querySelector('title');
            if (docTitle) metadata.title = docTitle.textContent.trim() || '';
        }
        if (!metadata.description) {
            const metaDesc = doc.querySelector('meta[name="description"]');
            if (metaDesc) metadata.description = metaDesc.getAttribute('content') || '';
        }

        // Favicon
        const favicon = doc.querySelector('link[rel="icon"]') || doc.querySelector('link[rel="shortcut icon"]');
        if (favicon) {
            let faviconUrl = favicon.getAttribute('href') || '';
            if (faviconUrl) {
                if (faviconUrl.startsWith('/')) {
                    faviconUrl = urlObj.origin + faviconUrl;
                } else if (!faviconUrl.startsWith('http')) {
                    faviconUrl = urlObj.origin + '/' + faviconUrl;
                }
                metadata.favicon = faviconUrl;
            }
        }

        res.json(metadata);
    } catch (error) {
        console.error('Link preview error:', error.message);
        res.status(500).json({ error: 'Failed to fetch link preview' });
    }
});

// API Routes

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existingUser = await userDB.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await userDB.create(username, email, hashedPassword);

        // Подписываем нового пользователя на системный канал
        const systemChannel = await channelDB.getSystemChannel();
        if (systemChannel) {
            await channelDB.subscribe(systemChannel.id, user.id, 1);
        }

        const token = generateToken();
        await sessionDB.create(token, user.id);

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatar: username.charAt(0).toUpperCase()
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await userDB.findByEmail(email);
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = generateToken();
        await sessionDB.create(token, user.id);

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatar: user.avatar || user.username.charAt(0).toUpperCase()
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    try {
        await sessionDB.deleteBySessionId(token);
        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

// Get user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await userDB.findById(req.user.id);
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// Get all users
app.get('/api/users', authenticateToken, async (req, res) => {
    try {
        const users = await userDB.getAll();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// File upload
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { dmId, senderId } = req.body;
        // Сохраняем файл с ID отправителя и получателя, но без связи с конкретным сообщением
        // Мы будем связывать файл с сообщением позже, когда сообщение будет создано
        const fileRecord = await fileDB.create(
            req.file.filename,
            req.file.path,
            req.file.mimetype,
            req.file.size,
            req.user.id,
            null  // Пока не знаем ID сообщения
        );

        // Обновляем запись файла, чтобы она содержала ID отправителя и получателя
        await fileDB.updateSenderReceiver(fileRecord.id, senderId, dmId);

        res.json({
            id: fileRecord.id,
            filename: req.file.originalname,
            url: `/uploads/${req.file.filename}`,
            type: req.file.mimetype,
            size: req.file.size
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});


// Get direct messages
app.get('/api/dm/:userId', authenticateToken, async (req, res) => {
    try {
        const messages = await dmDB.getConversation(req.user.id, req.params.userId);

        // For each message, get its reactions and associated files
        const messagesWithReactionsAndFiles = await Promise.all(messages.map(async (message) => {
            const reactions = await reactionDB.getByMessage(message.id);

            // Get associated file for this message
            const files = await fileDB.getByDM(message.id);
            let file = null;
            if (files.length > 0) {
                const fileRecord = files[0];
                file = {
                    id: fileRecord.id,
                    filename: fileRecord.filename,
                    url: `/uploads/${fileRecord.filepath.split('/').pop()}`, // Извлекаем имя файла из пути
                    type: fileRecord.filetype,
                    size: fileRecord.filesize
                };
            }

            // Добавляем информацию об ответе, если он есть
            let replyTo = null;
            if (message.replyTo) {
                replyTo = message.replyTo;
                // Определяем, является ли ответ голосовым сообщением или файлом
                const replyMessage = await dmDB.getById(message.replyTo.id);
                if (replyMessage) {
                    const replyFiles = await fileDB.getByDM(message.replyTo.id);
                    if (replyFiles.length > 0) {
                        const replyFileRecord = replyFiles[0];
                        const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'webm', 'm4a', 'aac'];
                        const fileExt = replyFileRecord.filename.split('.').pop().toLowerCase();
                        replyTo.isVoiceMessage = audioExtensions.includes(fileExt);
                        replyTo.file = {
                            id: replyFileRecord.id,
                            filename: replyFileRecord.filename,
                            url: `/uploads/${replyFileRecord.filepath.split('/').pop()}`,
                            type: replyFileRecord.filetype,
                            size: replyFileRecord.filesize
                        };
                    }
                }
            }

            return {
                ...message,
                reactions: reactions,
                file: file,  // Добавляем информацию о файле, если он есть
                edited: message.edited,  // Используем поле edited из базы данных
                originalContent: message.originalContent,  // Добавляем оригинальное содержимое
                replyTo: replyTo  // Добавляем информацию об ответе
            };
        }));

        // Устанавливаем заголовки для предотвращения кэширования
        res.set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.json(messagesWithReactionsAndFiles);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Server routes
app.post('/api/servers', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || name.trim().length < 2) {
            return res.status(400).json({ error: 'Server name must be at least 2 characters' });
        }

        const srv = await serverDB.create(name.trim(), req.user.id);
        await serverDB.addMember(srv.id, req.user.id);

        res.json(srv);
    } catch (error) {
        console.error('Create server error:', error);
        res.status(500).json({ error: 'Failed to create server' });
    }
});

app.get('/api/servers', authenticateToken, async (req, res) => {
    try {
        const servers = await serverDB.getUserServers(req.user.id);
        res.json(servers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get servers' });
    }
});

app.get('/api/servers/:serverId/members', authenticateToken, async (req, res) => {
    try {
        const members = await serverDB.getMembers(req.params.serverId);
        res.json(members);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get server members' });
    }
});

// Channel routes
app.get('/api/channels/system', authenticateToken, async (req, res) => {
    try {
        console.log('Fetching system channel...');
        const systemChannel = await channelDB.getSystemChannel();
        console.log('System channel result:', systemChannel);
        if (!systemChannel) {
            return res.status(404).json({ error: 'System channel not found' });
        }

        // Добавляем количество подписчиков
        console.log('Fetching subscriber count for channel:', systemChannel.id);
        const subscriberCount = await channelDB.getSubscriberCount(systemChannel.id);
        console.log('Subscriber count:', subscriberCount);
        res.json({
            ...systemChannel,
            subscriberCount: subscriberCount
        });
    } catch (error) {
        console.error('Get system channel error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to get system channel' });
    }
});

app.get('/api/friends', authenticateToken, async (req, res) => {
    try {
        const friends = await friendDB.getFriends(req.user.id);
        res.json(friends);
    } catch (error) {
        console.error('Get friends error:', error);
        res.status(500).json({ error: 'Failed to get friends' });
    }
});

app.get('/api/friends/pending', authenticateToken, async (req, res) => {
    try {
        const requests = await friendDB.getPendingRequests(req.user.id);
        res.json(requests);
    } catch (error) {
        console.error('Get pending requests error:', error);
        res.status(500).json({ error: 'Failed to get pending requests' });
    }
});

// Friend request routes
app.post('/api/friends/request', authenticateToken, async (req, res) => {
    try {
        const { friendId } = req.body;
        const result = await friendDB.sendRequest(req.user.id, friendId);

        if (result.changes > 0) {
            const receiverSocket = Array.from(users.values()).find(u => u.id === friendId);
            if (receiverSocket) {
                io.to(receiverSocket.socketId).emit('new-friend-request');
            }
        }

        res.sendStatus(200);
    } catch (error) {
        console.error('Friend request error:', error);
        res.status(500).json({ error: 'Failed to send friend request' });
    }
});

app.post('/api/friends/accept', authenticateToken, async (req, res) => {
    try {
        const { friendId } = req.body;
        await friendDB.acceptRequest(req.user.id, friendId);
        res.sendStatus(200);
    } catch (error) {
        console.error('Accept friend request error:', error);
        res.status(500).json({ error: 'Failed to accept friend request' });
    }
});

app.post('/api/friends/reject', authenticateToken, async (req, res) => {
    try {
        const { friendId } = req.body;
        await friendDB.rejectRequest(req.user.id, friendId);
        res.sendStatus(200);
    } catch (error) {
        console.error('Reject friend request error:', error);
        res.status(500).json({ error: 'Failed to reject friend request' });
    }
});

app.delete('/api/friends/:friendId', authenticateToken, async (req, res) => {
    try {
        await friendDB.removeFriend(req.user.id, req.params.friendId);
        res.sendStatus(200);
    } catch (error) {
        console.error('Remove friend error:', error);
        res.status(500).json({ error: 'Failed to remove friend' });
    }
});

// Notification API routes
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await notificationDB.getAll(req.user.id, 50);
        const unreadCount = await notificationDB.getUnreadCount(req.user.id);
        res.json({ notifications, unreadCount });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

app.get('/api/notifications/unread', authenticateToken, async (req, res) => {
    try {
        const notifications = await notificationDB.getUnread(req.user.id);
        const unreadCount = await notificationDB.getUnreadCount(req.user.id);
        res.json({ notifications, unreadCount });
    } catch (error) {
        console.error('Get unread notifications error:', error);
        res.status(500).json({ error: 'Failed to get unread notifications' });
    }
});

app.post('/api/notifications/mark-all-read', authenticateToken, async (req, res) => {
    try {
        await notificationDB.markAllAsRead(req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

app.post('/api/notifications/mark-user-read', authenticateToken, async (req, res) => {
    try {
        const { fromUserId } = req.body;
        await notificationDB.markFromUserAsRead(req.user.id, fromUserId);
        res.json({ success: true });
    } catch (error) {
        console.error('Mark user read error:', error);
        res.status(500).json({ error: 'Failed to mark notifications as read' });
    }
});

app.delete('/api/notifications/:notificationId', authenticateToken, async (req, res) => {
    try {
        await notificationDB.delete(req.params.notificationId, req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ error: 'Failed to delete notification' });
    }
});

app.delete('/api/notifications', authenticateToken, async (req, res) => {
    try {
        await notificationDB.deleteAll(req.user.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete all notifications error:', error);
        res.status(500).json({ error: 'Failed to delete all notifications' });
    }
});

// Store connected users
const users = new Map();
const rooms = new Map();
// Store active calls
const activeCalls = new Map();
// Store user call states
const userCallStates = new Map();

// Socket.IO connection handling
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }

    try {
        const session = await sessionDB.findBySessionId(token);
        if (!session) {
            return next(new Error('Authentication error'));
        }

        // Optionally check if session has expired
        if (session.expires_at && new Date(session.expires_at) < new Date()) {
            await sessionDB.deleteBySessionId(token);
            return next(new Error('Session expired'));
        }

        const user = await userDB.findById(session.user_id);
        if (!user) {
            return next(new Error('User not found'));
        }

        socket.userId = user.id;
        socket.userEmail = user.email;
        next();
    } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication error'));
    }
});

io.on('connection', async (socket) => {
    console.log('User connected:', socket.userId);

    try {
        const user = await userDB.findById(socket.userId);

        users.set(socket.id, {
            ...user,
            socketId: socket.id
        });

        await userDB.updateStatus(socket.userId, 'Online');

        io.emit('user-list-update', Array.from(users.values()));
    } catch (error) {
        console.error('Error loading user:', error);
    }


    socket.on('send-dm', async (data) => {
        try {
            const { receiverId, message } = data;
            const sender = await userDB.findById(socket.userId);

            // Если сообщение содержит файл и текст пустой, сохраняем пустую строку вместо текста "Uploaded [filename]"
            let messageText = message.text;
            if (message.file && message.text === '') {
                messageText = '';
            }

            // Извлекаем ID ответа, если он есть
            const replyToId = message.replyTo ? message.replyTo.id : null;

            const savedMessage = await dmDB.create(
                messageText,
                socket.userId,
                receiverId,
                message.timestamp,
                replyToId
            );

            // Если сообщение содержит файл, обновляем запись файла, чтобы она указывала на ID сообщения
            if (message.file) {
                await fileDB.linkToFileMessage(message.file.id, savedMessage.id);
            }

            // Создаем уведомление для получателя (если он не в сети)
            const receiverSocket = Array.from(users.values()).find(u => u.id === receiverId);
            const content = messageText || (message.file ? '📎 Вложение' : '');
            await notificationDB.create(receiverId, socket.userId, 'message', content);

            // Get reactions for the new message
            const reactions = await reactionDB.getByMessage(savedMessage.id);

            // Формируем replyTo из данных, которые пришли от клиента
            let replyToPayload = null;
            if (message.replyTo) {
                replyToPayload = {
                    id: message.replyTo.id,
                    author: message.replyTo.author,
                    text: message.replyTo.text,
                    isVoiceMessage: message.replyTo.isVoiceMessage || false,
                    file: message.replyTo.file || null
                };
            }

            const messagePayload = {
                id: savedMessage.id,
                author: sender.username,
                avatar: sender.avatar || sender.username.charAt(0).toUpperCase(),
                text: message.text,
                timestamp: message.timestamp,
                reactions: reactions,
                file: message.file,  // Добавляем информацию о файле, если она есть
                replyTo: replyToPayload  // Добавляем информацию об ответе
            };

            if (receiverSocket) {
                io.to(receiverSocket.socketId).emit('new-dm', {
                    senderId: socket.userId,
                    message: messagePayload
                });
            }

            socket.emit('dm-sent', {
                receiverId,
                message: messagePayload
            });
        } catch (error) {
            console.error('DM error:', error);
        }
    });

    socket.on('update-dm', async (data) => {
        try {
            const { messageId, newText, receiverId } = data;
            
            // Проверяем, что пользователь является автором сообщения
            const message = await dmDB.getById(messageId);
            if (!message || message.sender_id !== socket.userId) {
                console.error('User trying to update message they did not send');
                return;
            }
            
            // Обновляем сообщение в базе данных
            await dmDB.update(messageId, newText);

            // Получаем обновленное сообщение с оригинальным содержимым
            const updatedMessage = await dmDB.getById(messageId);
            const sender = await userDB.findById(socket.userId);

            // Get reactions for the updated message
            const reactions = await reactionDB.getByMessage(messageId);

            const updatedMessagePayload = {
                id: updatedMessage.id,
                author: sender.username,
                avatar: sender.avatar || sender.username.charAt(0).toUpperCase(),
                text: newText,
                timestamp: updatedMessage.created_at,
                reactions: reactions,
                edited: true,  // Помечаем, что сообщение было отредактировано
                originalContent: updatedMessage.originalContent,  // Добавляем оригинальное содержимое
                replyTo: updatedMessage.reply_to_id ? {
                    id: updatedMessage.reply_to_id,
                    author: updatedMessage.reply_to_author,
                    text: updatedMessage.reply_to_content
                } : null  // Добавляем информацию об ответе
            };

            // Отправляем обновленное сообщение получателю
            const receiverSocket = Array.from(users.values())
                .find(u => u.id === receiverId);

            if (receiverSocket) {
                io.to(receiverSocket.socketId).emit('updated-dm', {
                    receiverId: socket.userId,
                    message: updatedMessagePayload
                });
            }

            // Отправляем обновленное сообщение отправителю
            socket.emit('dm-updated', {
                receiverId,
                message: updatedMessagePayload
            });
        } catch (error) {
            console.error('Update DM error:', error);
        }
    });

    socket.on('delete-dm', async (data) => {
        try {
            const { messageId, receiverId } = data;

            // Проверяем, что пользователь является автором сообщения
            const message = await dmDB.getById(messageId);
            if (!message || message.sender_id !== socket.userId) {
                console.error('User trying to delete message they did not send');
                return;
            }

            // Удаляем сообщение из базы данных
            await dmDB.delete(messageId);

            const sender = await userDB.findById(socket.userId);

            // Отправляем уведомление о удалении получателю
            const receiverSocket = Array.from(users.values())
                .find(u => u.id === receiverId);

            if (receiverSocket) {
                io.to(receiverSocket.socketId).emit('deleted-dm', {
                    messageId: messageId,
                    deletedBy: socket.userId
                });
            }

            // Отправляем уведомление об удалении отправителю
            socket.emit('dm-deleted', {
                messageId: messageId
            });
        } catch (error) {
            console.error('Delete DM error:', error);
        }
    });

    socket.on('add-reaction', async (data) => {
        try {
            const { messageId, emoji } = data;
            await reactionDB.add(emoji, messageId, socket.userId);

            const reactions = await reactionDB.getByMessage(messageId);
            io.emit('reaction-update', { messageId, reactions });
        } catch (error) {
            console.error('Reaction error:', error);
        }
    });

    socket.on('remove-reaction', async (data) => {
        try {
            const { messageId, emoji } = data;
            await reactionDB.remove(emoji, messageId, socket.userId);

            const reactions = await reactionDB.getByMessage(messageId);
            io.emit('reaction-update', { messageId, reactions });
        } catch (error) {
            console.error('Reaction error:', error);
        }
    });

    socket.on('voice-activity', (data) => {
        socket.broadcast.emit('user-speaking', {
            userId: socket.userId,
            speaking: data.speaking
        });
    });

    socket.on('join-voice-channel', (channelData) => {
        const { channelName, userId } = channelData;

        socket.join(`voice-${channelName}`);

        if (!rooms.has(channelName)) {
            rooms.set(channelName, new Set());
        }
        rooms.get(channelName).add(socket.id);

        socket.to(`voice-${channelName}`).emit('user-joined-voice', {
            userId,
            socketId: socket.id
        });

        const existingUsers = Array.from(rooms.get(channelName))
            .filter(id => id !== socket.id)
            .map(id => users.get(id));

        socket.emit('existing-voice-users', existingUsers);
    });

    socket.on('offer', (data) => {
        const { to, offer, from } = data;
        console.log(`Forwarding offer from ${from} to ${to}`);
        io.to(to).emit('offer', {
            offer: offer,
            from: from
        });
    });

    socket.on('answer', (data) => {
        const { to, answer, from } = data;
        console.log(`Forwarding answer from ${from} to ${to}`);
        io.to(to).emit('answer', {
            answer: answer,
            from: from
        });
    });

    socket.on('ice-candidate', (data) => {
        const { to, candidate, from } = data;
        console.log(`Forwarding ICE candidate from ${from} to ${to}`);
        io.to(to).emit('ice-candidate', {
            candidate: candidate,
            from: from
        });
    });

    socket.on('leave-voice-channel', (channelName) => {
        socket.leave(`voice-${channelName}`);

        if (rooms.has(channelName)) {
            rooms.get(channelName).delete(socket.id);
            socket.to(`voice-${channelName}`).emit('user-left-voice', socket.id);
        }
    });

    socket.on('initiate-call', (data) => {
        const { to, type, from } = data;
        console.log(`Call initiated from ${from.id} to ${to}, type: ${type}`);

        const receiverSocket = Array.from(users.values()).find(u => u.id === to);
        if (receiverSocket) {
            // Проверяем, находится ли получатель уже в звонке
            if (userCallStates.has(to) && userCallStates.get(to).inCall) {
                // Если пользователь уже в звонке, отправляем сигнал о присоединении к существующему звонку
                const existingCall = userCallStates.get(to).callId;
                const callData = activeCalls.get(existingCall);

                if (callData) {
                    // Добавляем инициатора к существующему звонку
                    callData.participants.push(from.id);
                    callData.socketIds.push(socket.id);

                    // Уведомляем инициатора о необходимости присоединиться к существующему звонку
                    socket.emit('join-existing-call', {
                        callId: existingCall,
                        participants: callData.participants,
                        type: type
                    });
                }
            } else {
                // Создаем запись активного звонка
                const callId = `${from.id}-${to}-${Date.now()}`;
                activeCalls.set(callId, {
                    participants: [from.id, to],
                    initiator: from.id,
                    socketIds: [socket.id, receiverSocket.socketId]
                });

                // Обновляем состояние пользователя
                userCallStates.set(to, {
                    inCall: true,
                    callId: callId
                });
                userCallStates.set(from.id, {
                    inCall: true,
                    callId: callId
                });

                io.to(receiverSocket.socketId).emit('incoming-call', {
                    from: {
                        id: from.id,
                        username: from.username,
                        socketId: socket.id,
                        avatar: from.username?.charAt(0).toUpperCase()
                    },
                    type: type
                });
            }
        } else {
            // Пользователь офлайн - сохраняем пропущенный звонок в базу
            notificationDB.create(to, from.id, 'missed-call', null, type);
            
            socket.emit('missed-call-notification', {
                to: to,
                from: {
                    id: from.id,
                    username: from.username,
                    avatar: from.username?.charAt(0).toUpperCase()
                },
                type: type,
                timestamp: new Date().toISOString()
            });
        }
    });

    socket.on('accept-call', (data) => {
        const { to, from } = data;
        console.log(`Call accepted by ${from.id}, connecting to ${to}`);

        // Обновляем состояние пользователя
        const callId = `${from.id}-${to.id}-${Date.now()}`; // нужно получить реальный ID звонка
        userCallStates.set(from.id, {
            inCall: true,
            callId: callId
        });
        
        io.to(to).emit('call-accepted', {
            from: {
                id: from.id,
                username: from.username,
                socketId: socket.id
            }
        });
        
        // Также отправляем подтверждение обратно тому, кто принял вызов
        socket.emit('call-accepted', {
            from: {
                id: from.id,
                username: from.username,
                socketId: socket.id
            }
        });
    });

    socket.on('reject-call', (data) => {
        const { to } = data;
        console.log(`Call rejected, notifying ${to}`);

        io.to(to).emit('call-rejected', {
            from: socket.id,
            message: 'Call was declined'
        });
    });

    socket.on('video-toggle', (data) => {
        const { to, enabled } = data;
        if (to) {
            io.to(to).emit('video-toggle', {
                from: socket.id,
                enabled: enabled
            });
        }
    });

    socket.on('end-call', (data) => {
        const { to } = data;
        if (to) {
            io.to(to).emit('call-ended', { from: socket.id });
            
            // Уведомляем других участников звонка о выходе пользователя
            for (let [callId, callData] of activeCalls.entries()) {
                if (callData.socketIds.includes(socket.id)) {
                    // Удаляем текущий сокет из списка участников
                    const otherParticipants = callData.socketIds.filter(sockId => sockId !== socket.id);
                    
                    // Уведомляем других участников о выходе
                    otherParticipants.forEach(otherSocketId => {
                        io.to(otherSocketId).emit('user-left-call', {
                            userId: socket.userId,
                            socketId: socket.id
                        });
                    });
                    
                    // Удаляем звонок из активных
                    activeCalls.delete(callId);
                    
                    // Обновляем состояние пользователей
                    callData.participants.forEach(userId => {
                        if (userCallStates.has(userId)) {
                            userCallStates.delete(userId);
                        }
                    });
                    break;
                }
            }
        }
    });
    
    // Обработка приглашения к звонку
    socket.on('invite-to-call', (data) => {
        const { to, callId, type, inviter } = data;
        console.log(`${inviter.username} invited user ${to} to join call ${callId}`);
        
        // Находим сокет получателя приглашения
        const recipientSocket = Array.from(users.values()).find(u => u.id == to);
        if (recipientSocket) {
            io.to(recipientSocket.socketId).emit('call-invitation', {
                inviter: inviter,
                callId: callId,
                type: type
            });
        }
    });
    
    // Обработка добавления участника к существующему звонку
    socket.on('add-participant-to-call', (data) => {
        const { to, from, type, participants } = data;
        console.log(`${from.username} is adding user ${to} to call`);
        
        io.to(to).emit('add-participant-to-call', {
            from: from,
            type: type,
            participants: participants
        });
    });

    socket.on('disconnect', async () => {
        const user = users.get(socket.id);

        if (user) {
            console.log(`${user.username} disconnected`);

            try {
                await userDB.updateStatus(socket.userId, 'Offline');
            } catch (error) {
                console.error('Error updating status:', error);
            }

            // Уведомляем других участников активных звонков о выходе пользователя
            for (let [callId, callData] of activeCalls.entries()) {
                if (callData.socketIds.includes(socket.id)) {
                    // Удаляем текущий сокет из списка участников
                    const otherParticipants = callData.socketIds.filter(sockId => sockId !== socket.id);
                    
                    // Уведомляем других участников о выходе
                    otherParticipants.forEach(otherSocketId => {
                        io.to(otherSocketId).emit('user-left-call', {
                            userId: socket.userId,
                            socketId: socket.id
                        });
                    });
                    
                    // Удаляем звонок из активных
                    activeCalls.delete(callId);
                    
                    // Обновляем состояние пользователей
                    callData.participants.forEach(userId => {
                        if (userCallStates.has(userId)) {
                            userCallStates.delete(userId);
                        }
                    });
                }
            }
            
            rooms.forEach((members, roomName) => {
                if (members.has(socket.id)) {
                    members.delete(socket.id);
                    io.to(`voice-${roomName}`).emit('user-left-voice', socket.id);
                }
            });

            users.delete(socket.id);
            io.emit('user-list-update', Array.from(users.values()));
        }
    });
});

// SPA fallback - serve index.html for routes without file extension
if (fs.existsSync(clientDir)) {
    app.get(/.*/, (req, res) => {
        // Don't fallback for files with extensions
        if (path.extname(req.path)) {
            return res.status(404).send('Not found');
        }
        res.sendFile(path.join(clientDir, 'index.html'));
    });
}

// Start server
server.listen(PORT, () => {
    const protocol = useSSL ? 'https' : 'http';
    const address = server.address();
    const host = address.address === '::' || address.address === '0.0.0.0' ? 'localhost' : address.address;
    console.log(`Discord Clone server running on ${protocol}://${host}:${address.port}`);
});
