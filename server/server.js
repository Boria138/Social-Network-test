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

const { initializeDatabase, userDB, dmDB, fileDB, reactionDB, friendDB, serverDB, sessionDB } = require('./database');

const app = express();

// Check for SSL certificates
const certPath = process.env.SSL_CERT || '/root/cert/cert.crt';
const keyPath = process.env.SSL_KEY || '/root/cert/secret.key';
const useSSL = fs.existsSync(certPath) && fs.existsSync(keyPath);

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
        origin: process.env.CLIENT_URL || ['http://localhost:5173', 'http://localhost:3000', 'https://localhost:5173', 'https://localhost:3000'],
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
const corsOptions = {
    origin: process.env.CLIENT_URL || ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
};
app.use(cors(corsOptions));
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
            'text/plain', 'audio/mpeg', 'audio/mp3', 'video/mp4', 'video/webm', 'video/quicktime',
            'application/zip', 'application/x-rar-compressed'
        ];

        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf', '.doc', '.docx',
                                   '.txt', '.mp3', '.mp4', '.webm', '.mov', '.zip', '.rar'];

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

            return {
                ...message,
                reactions: reactions,
                file: file  // Добавляем информацию о файле, если он есть
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

// Store connected users
const users = new Map();
const rooms = new Map();

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
            const savedMessage = await dmDB.create(
                messageText,
                socket.userId,
                receiverId
            );

            // Если сообщение содержит файл, обновляем запись файла, чтобы она указывала на ID сообщения
            if (message.file) {
                await fileDB.linkToFileMessage(message.file.id, savedMessage.id);
            }

            // Get reactions for the new message
            const reactions = await reactionDB.getByMessage(savedMessage.id);

            const messagePayload = {
                id: savedMessage.id,
                author: sender.username,
                avatar: sender.avatar || sender.username.charAt(0).toUpperCase(),
                text: message.text,
                timestamp: new Date(),
                reactions: reactions,
                file: message.file  // Добавляем информацию о файле, если она есть
            };

            const receiverSocket = Array.from(users.values())
                .find(u => u.id === receiverId);

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
        socket.to(data.to).emit('offer', {
            offer: data.offer,
            from: socket.id
        });
    });

    socket.on('answer', (data) => {
        socket.to(data.to).emit('answer', {
            answer: data.answer,
            from: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.to).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.id
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
            io.to(receiverSocket.socketId).emit('incoming-call', {
                from: {
                    id: from.id,
                    username: from.username,
                    socketId: socket.id,
                    avatar: from.username?.charAt(0).toUpperCase()
                },
                type: type
            });
        } else {
            socket.emit('call-rejected', { message: 'User is offline' });
        }
    });

    socket.on('accept-call', (data) => {
        const { to, from } = data;
        console.log(`Call accepted by ${from.id}, connecting to ${to}`);

        io.to(to).emit('call-accepted', {
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
        }
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
    console.log(`Discord Clone server running on ${protocol}://localhost:${PORT}`);
});
