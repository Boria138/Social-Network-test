const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'discord_clone.db');
const db = new Database(dbPath);

// Включаем внешние ключи
db.pragma('foreign_keys = ON');

// Initialize database tables
function initializeDatabase() {
    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            avatar TEXT,
            status TEXT DEFAULT 'Online',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Servers table
    db.exec(`
        CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT,
            owner_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        )
    `);

    // Direct messages table
    db.exec(`
        CREATE TABLE IF NOT EXISTS direct_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            sender_id INTEGER,
            receiver_id INTEGER,
            reply_to_id INTEGER,
            is_pinned BOOLEAN DEFAULT FALSE,
            pinned_at DATETIME,
            read BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_edited BOOLEAN DEFAULT FALSE,
            original_content TEXT,
            FOREIGN KEY (sender_id) REFERENCES users(id),
            FOREIGN KEY (receiver_id) REFERENCES users(id),
            FOREIGN KEY (reply_to_id) REFERENCES direct_messages(id)
        )
    `);

    // File uploads table
    db.exec(`
        CREATE TABLE IF NOT EXISTS file_uploads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            filetype TEXT,
            filesize INTEGER,
            user_id INTEGER,
            dm_id INTEGER,
            sender_id INTEGER,
            receiver_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (dm_id) REFERENCES direct_messages(id)
        )
    `);

    // Reactions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emoji TEXT NOT NULL,
            message_id INTEGER,
            user_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES direct_messages(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(message_id, user_id, emoji)
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS news_reactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            news_id TEXT NOT NULL,
            emoji TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(news_id, user_id, emoji)
        )
    `);

    // Server members table
    db.exec(`
        CREATE TABLE IF NOT EXISTS server_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER,
            user_id INTEGER,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES servers(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(server_id, user_id)
        )
    `);

    // Friends table
    db.exec(`
        CREATE TABLE IF NOT EXISTS friends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            friend_id INTEGER,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (friend_id) REFERENCES users(id),
            UNIQUE(user_id, friend_id)
        )
    `);

    // Sessions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // Channels table - для системных и пользовательских каналов
    db.exec(`
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            type TEXT DEFAULT 'public',
            is_system INTEGER DEFAULT 0,
            owner_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (owner_id) REFERENCES users(id)
        )
    `);

    // Channel subscriptions - подписки на каналы
    db.exec(`
        CREATE TABLE IF NOT EXISTS channel_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER,
            user_id INTEGER,
            is_forced INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES channels(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(channel_id, user_id)
        )
    `);

    // Notifications - уведомления (пропущенные звонки и непрочитанные сообщения)
    db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            from_user_id INTEGER,
            type TEXT NOT NULL CHECK(type IN ('message', 'missed-call')),
            call_type TEXT,
            content TEXT,
            read BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (from_user_id) REFERENCES users(id)
        )
    `);

    // Индекс для быстрого поиска уведомлений пользователя
    try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)');
    } catch (e) {
        // Индекс может уже существовать
    }

    // Channel messages - сообщения в каналах
    db.exec(`
        CREATE TABLE IF NOT EXISTS channel_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            channel_id INTEGER,
            sender_id INTEGER,
            reply_to_id INTEGER,
            read BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_edited BOOLEAN DEFAULT FALSE,
            original_content TEXT,
            FOREIGN KEY (channel_id) REFERENCES channels(id),
            FOREIGN KEY (sender_id) REFERENCES users(id),
            FOREIGN KEY (reply_to_id) REFERENCES channel_messages(id)
        )
    `);

    console.log('Database initialized successfully');
    
    // Миграция: добавляем поле reply_to_id если его нет
    try {
        db.exec('ALTER TABLE direct_messages ADD COLUMN reply_to_id INTEGER REFERENCES direct_messages(id)');
        console.log('Migration: Added reply_to_id column to direct_messages');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: добавляем колонку updated_at если её нет
    try {
        db.exec('ALTER TABLE direct_messages ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
        console.log('Migration: Added updated_at column to direct_messages');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: добавляем колонку is_edited если её нет
    try {
        db.exec('ALTER TABLE direct_messages ADD COLUMN is_edited BOOLEAN DEFAULT FALSE');
        console.log('Migration: Added is_edited column to direct_messages');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: добавляем колонку original_content если её нет
    try {
        db.exec('ALTER TABLE direct_messages ADD COLUMN original_content TEXT');
        console.log('Migration: Added original_content column to direct_messages');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    try {
        db.exec('ALTER TABLE direct_messages ADD COLUMN is_pinned BOOLEAN DEFAULT FALSE');
        console.log('Migration: Added is_pinned column to direct_messages');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    try {
        db.exec('ALTER TABLE direct_messages ADD COLUMN pinned_at DATETIME');
        console.log('Migration: Added pinned_at column to direct_messages');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: создаем таблицу channels если нет
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                type TEXT DEFAULT 'public',
                is_system INTEGER DEFAULT 0,
                owner_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (owner_id) REFERENCES users(id)
            )
        `);
        console.log('Migration: Created channels table');
    } catch (error) {
        if (!error.message.includes('already exists')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: добавляем колонку is_system если её нет
    try {
        db.exec('ALTER TABLE channels ADD COLUMN is_system INTEGER DEFAULT 0');
        console.log('Migration: Added is_system column to channels');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: добавляем колонку description если её нет
    try {
        db.exec('ALTER TABLE channels ADD COLUMN description TEXT');
        console.log('Migration: Added description column to channels');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: добавляем колонку type если её нет
    try {
        db.exec('ALTER TABLE channels ADD COLUMN type TEXT DEFAULT "public"');
        console.log('Migration: Added type column to channels');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: добавляем колонку owner_id если её нет
    try {
        db.exec('ALTER TABLE channels ADD COLUMN owner_id INTEGER');
        console.log('Migration: Added owner_id column to channels');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: добавляем колонку created_at если её нет
    try {
        db.exec('ALTER TABLE channels ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
        console.log('Migration: Added created_at column to channels');
    } catch (error) {
        if (!error.message.includes('duplicate column')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: создаем таблицу channel_subscriptions если нет
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS channel_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id INTEGER,
                user_id INTEGER,
                is_forced INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (channel_id) REFERENCES channels(id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(channel_id, user_id)
            )
        `);
        console.log('Migration: Created channel_subscriptions table');
    } catch (error) {
        if (!error.message.includes('already exists')) {
            console.error('Migration error:', error);
        }
    }

    // Миграция: создаем таблицу channel_messages если нет
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS channel_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                channel_id INTEGER,
                sender_id INTEGER,
                reply_to_id INTEGER,
                read BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_edited BOOLEAN DEFAULT FALSE,
                original_content TEXT,
                FOREIGN KEY (channel_id) REFERENCES channels(id),
                FOREIGN KEY (sender_id) REFERENCES users(id),
                FOREIGN KEY (reply_to_id) REFERENCES channel_messages(id)
            )
        `);
        console.log('Migration: Created channel_messages table');
    } catch (error) {
        if (!error.message.includes('already exists')) {
            console.error('Migration error:', error);
        }
    }

    // Создаем системный канал если его нет
    createSystemChannel();
}

// Создание системного канала
function createSystemChannel() {
    try {
        // Проверяем существует ли уже системный канал
        const existing = db.prepare('SELECT id FROM channels WHERE is_system = 1').get();
        if (!existing) {
            // Создаем системный канал
            const stmt = db.prepare(`
                INSERT INTO channels (name, description, type, is_system, owner_id)
                VALUES ('Новости', 'Официальные новости и обновления платформы', 'public', 1, NULL)
            `);
            const result = stmt.run();
            const systemChannelId = result.lastInsertRowid;
            console.log(`System channel created with ID: ${systemChannelId}`);

            // Подписываем всех текущих пользователей
            const users = db.prepare('SELECT id FROM users').all();
            const subStmt = db.prepare(`
                INSERT OR IGNORE INTO channel_subscriptions (channel_id, user_id, is_forced)
                VALUES (?, ?, 1)
            `);
            users.forEach(user => {
                subStmt.run(systemChannelId, user.id);
            });
            console.log(`Subscribed ${users.length} users to system channel`);

            // Публикуем приветственное сообщение
            const welcomeStmt = db.prepare(`
                INSERT INTO channel_messages (content, original_content, channel_id, sender_id)
                VALUES (?, ?, ?, NULL)
            `);
            const welcomeMessage = `👋 **Добро пожаловать в Voxii!**

Это официальный канал новостей и обновлений платформы.

Здесь вы будете получать:
• 📢 Новости об обновлениях
• 🔧 Информация о технических работах
• 🎉 Анонсы новых функций

Вы подписаны на этот канал автоматически и не можете отписаться.
`;
            welcomeStmt.run(welcomeMessage, welcomeMessage, systemChannelId);
            console.log('Published welcome message in system channel');
        } else {
            console.log('System channel already exists');
        }
    } catch (error) {
        console.error('Error creating system channel:', error);
    }
}

// User operations
const userDB = {
    create: (username, email, hashedPassword) => {
        const stmt = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
        const result = stmt.run(username, email, hashedPassword);
        return Promise.resolve({ id: result.lastInsertRowid, username, email });
    },

    findByEmail: (email) => {
        const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
        return Promise.resolve(stmt.get(email));
    },

    findByUsername: (username) => {
        const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
        return Promise.resolve(stmt.get(username));
    },

    findById: (id) => {
        const stmt = db.prepare('SELECT id, username, email, avatar, status FROM users WHERE id = ?');
        return Promise.resolve(stmt.get(id));
    },

    findAll: () => {
        const stmt = db.prepare('SELECT id, username, email, avatar, status FROM users');
        return Promise.resolve(stmt.all());
    },

    update: (id, updates) => {
        const fields = [];
        const values = [];
        if (updates.username) {
            fields.push('username = ?');
            values.push(updates.username);
        }
        if (updates.avatar !== undefined) {
            fields.push('avatar = ?');
            values.push(updates.avatar);
        }
        if (updates.status) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (fields.length === 0) return Promise.resolve();
        values.push(id);
        const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
        return Promise.resolve();
    },

    updateStatus: (id, status) => {
        const stmt = db.prepare('UPDATE users SET status = ? WHERE id = ?');
        stmt.run(status, id);
        return Promise.resolve();
    },

    getAll: () => {
        const stmt = db.prepare('SELECT id, username, email, avatar, status FROM users');
        return Promise.resolve(stmt.all());
    }
};

// Direct message operations
const dmDB = {
    create: (content, senderId, receiverId, timestamp = null, replyToId = null) => {
        const stmt = db.prepare('INSERT INTO direct_messages (content, original_content, sender_id, receiver_id, reply_to_id, created_at) VALUES (?, ?, ?, ?, ?, ?)');
        const ts = timestamp || new Date().toISOString();
        const result = stmt.run(content, content, senderId, receiverId, replyToId, ts);
        return Promise.resolve({
            id: result.lastInsertRowid,
            content,
            senderId,
            receiverId,
            reply_to_id: replyToId,
            created_at: ts,
            is_pinned: 0,
            pinned_at: null
        });
    },

    getConversation: (userId1, userId2, limit = 50) => {
        const stmt = db.prepare(`
            SELECT dm.*, u.username, u.avatar,
                   reply_dm.content as reply_to_content,
                   reply_sender.username as reply_to_author
            FROM direct_messages dm
            JOIN users u ON dm.sender_id = u.id
            LEFT JOIN direct_messages reply_dm ON dm.reply_to_id = reply_dm.id
            LEFT JOIN users reply_sender ON reply_dm.sender_id = reply_sender.id
            WHERE (dm.sender_id = ? AND dm.receiver_id = ?)
               OR (dm.sender_id = ? AND dm.receiver_id = ?)
            ORDER BY dm.created_at DESC
            LIMIT ?
        `);
        const rows = stmt.all(userId1, userId2, userId2, userId1, limit);
        const processedRows = rows.map(row => ({
            ...row,
            edited: Boolean(row.is_edited),
            originalContent: row.is_edited ? row.original_content : undefined,
            pinned: Boolean(row.is_pinned),
            pinnedAt: row.pinned_at || null,
            replyTo: row.reply_to_id ? {
                id: row.reply_to_id,
                author: row.reply_to_author,
                text: row.reply_to_content
            } : null
        }));
        return Promise.resolve(processedRows.reverse());
    },

    getById: (messageId) => {
        const stmt = db.prepare(`
            SELECT dm.*,
                   CASE WHEN dm.is_edited THEN dm.original_content ELSE NULL END AS originalContent,
                   reply_dm.content as reply_to_content,
                   reply_sender.username as reply_to_author
            FROM direct_messages dm
            LEFT JOIN direct_messages reply_dm ON dm.reply_to_id = reply_dm.id
            LEFT JOIN users reply_sender ON reply_dm.sender_id = reply_sender.id
            WHERE dm.id = ?
        `);
        return Promise.resolve(stmt.get(messageId));
    },

    findById: (messageId) => {
        const stmt = db.prepare('SELECT * FROM direct_messages WHERE id = ?');
        return Promise.resolve(stmt.get(messageId));
    },

    update: (messageId, newContent) => {
        const originalMessage = dmDB.getById(messageId);

        return originalMessage.then(msg => {
            if (!msg.is_edited) {
                const stmt = db.prepare('UPDATE direct_messages SET content = ?, original_content = ?, is_edited = TRUE WHERE id = ?');
                stmt.run(newContent, msg.content, messageId);
            } else {
                const stmt = db.prepare('UPDATE direct_messages SET content = ? WHERE id = ?');
                stmt.run(newContent, messageId);
            }
            return Promise.resolve();
        });
    },

    delete: (messageId) => {
        db.transaction(() => {
            db.prepare('DELETE FROM reactions WHERE message_id = ?').run(messageId);
            db.prepare('DELETE FROM file_uploads WHERE dm_id = ?').run(messageId);
            db.prepare('DELETE FROM direct_messages WHERE id = ?').run(messageId);
        })();
        return Promise.resolve();
    },

    markAsRead: (messageId) => {
        const stmt = db.prepare('UPDATE direct_messages SET read = 1 WHERE id = ?');
        stmt.run(messageId);
        return Promise.resolve();
    },

    setPinned: (messageId, pinned) => {
        if (pinned) {
            db.prepare('UPDATE direct_messages SET is_pinned = 1, pinned_at = CURRENT_TIMESTAMP WHERE id = ?').run(messageId);
        } else {
            db.prepare('UPDATE direct_messages SET is_pinned = 0, pinned_at = NULL WHERE id = ?').run(messageId);
        }
        return Promise.resolve();
    },

    togglePinned: (messageId) => {
        const message = db.prepare('SELECT is_pinned FROM direct_messages WHERE id = ?').get(messageId);
        if (!message) {
            return Promise.resolve(null);
        }

        const nextPinned = !Boolean(message.is_pinned);
        if (nextPinned) {
            db.prepare('UPDATE direct_messages SET is_pinned = 1, pinned_at = CURRENT_TIMESTAMP WHERE id = ?').run(messageId);
        } else {
            db.prepare('UPDATE direct_messages SET is_pinned = 0, pinned_at = NULL WHERE id = ?').run(messageId);
        }

        const updated = db.prepare('SELECT is_pinned, pinned_at FROM direct_messages WHERE id = ?').get(messageId);
        return Promise.resolve({
            pinned: Boolean(updated.is_pinned),
            pinnedAt: updated.pinned_at || null
        });
    }
};

// File operations
const fileDB = {
    create: (filename, filepath, filetype, filesize, userId, dmId) => {
        const stmt = db.prepare('INSERT INTO file_uploads (filename, filepath, filetype, filesize, user_id, dm_id) VALUES (?, ?, ?, ?, ?, ?)');
        const result = stmt.run(filename, filepath, filetype, filesize, userId, dmId);
        return Promise.resolve({ id: result.lastInsertRowid, filename, filepath });
    },

    getByDM: (dmId) => {
        const stmt = db.prepare(`
            SELECT f.*, u.username
            FROM file_uploads f
            JOIN users u ON f.user_id = u.id
            WHERE f.dm_id = ?
            ORDER BY f.created_at DESC
        `);
        return Promise.resolve(stmt.all(dmId));
    },

    updateSenderReceiver: (fileId, senderId, receiverId) => {
        const stmt = db.prepare('UPDATE file_uploads SET sender_id = ?, receiver_id = ? WHERE id = ?');
        stmt.run(senderId, receiverId, fileId);
        return Promise.resolve();
    },

    linkToFileMessage: (fileId, messageId) => {
        const stmt = db.prepare('UPDATE file_uploads SET dm_id = ? WHERE id = ?');
        stmt.run(messageId, fileId);
        return Promise.resolve();
    }
};

// Reaction operations
const reactionDB = {
    add: (emoji, messageId, userId) => {
        // Сначала проверяем, существует ли сообщение
        const message = db.prepare('SELECT id FROM direct_messages WHERE id = ?').get(messageId);
        if (!message) {
            console.error('[REACTION DB] Сообщение не найдено для добавления реакции:', messageId);
            return Promise.reject(new Error('Message not found'));
        }
        
        const stmt = db.prepare('INSERT OR IGNORE INTO reactions (emoji, message_id, user_id) VALUES (?, ?, ?)');
        const result = stmt.run(emoji, messageId, userId);
        return Promise.resolve({ id: result.lastInsertRowid, emoji, messageId, userId });
    },

    create: (messageId, userId, emoji) => {
        // Сначала проверяем, существует ли сообщение
        const message = db.prepare('SELECT id FROM direct_messages WHERE id = ?').get(messageId);
        if (!message) {
            console.error('[REACTION DB] Сообщение не найдено для создания реакции:', messageId);
            return Promise.reject(new Error('Message not found'));
        }
        
        const stmt = db.prepare('INSERT OR IGNORE INTO reactions (emoji, message_id, user_id) VALUES (?, ?, ?)');
        const result = stmt.run(emoji, messageId, userId);
        return Promise.resolve({ id: result.lastInsertRowid, emoji, messageId, userId });
    },

    delete: (reactionId) => {
        const stmt = db.prepare('DELETE FROM reactions WHERE id = ?');
        stmt.run(reactionId);
        return Promise.resolve();
    },

    remove: (emoji, messageId, userId) => {
        const stmt = db.prepare('DELETE FROM reactions WHERE emoji = ? AND message_id = ? AND user_id = ?');
        stmt.run(emoji, messageId, userId);
        return Promise.resolve();
    },

    findByMessageAndUser: (messageId, userId, emoji) => {
        const stmt = db.prepare('SELECT * FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?');
        return Promise.resolve(stmt.get(messageId, userId, emoji));
    },

    findByMessage: (messageId) => {
        const stmt = db.prepare('SELECT emoji, user_id FROM reactions WHERE message_id = ?');
        return Promise.resolve(stmt.all(messageId));
    },

    getByMessage: (messageId) => {
        const stmt = db.prepare(`
            SELECT r.emoji, COUNT(*) as count, GROUP_CONCAT(u.username) as users
            FROM reactions r
            JOIN users u ON r.user_id = u.id
            WHERE r.message_id = ?
            GROUP BY r.emoji
        `);
        return Promise.resolve(stmt.all(messageId));
    }
};

const newsReactionDB = {
    add: (emoji, newsId, userId) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO news_reactions (news_id, emoji, user_id) VALUES (?, ?, ?)');
        const result = stmt.run(newsId, emoji, userId);
        return Promise.resolve({ id: result.lastInsertRowid, newsId, emoji, userId });
    },

    remove: (emoji, newsId, userId) => {
        const stmt = db.prepare('DELETE FROM news_reactions WHERE emoji = ? AND news_id = ? AND user_id = ?');
        stmt.run(emoji, newsId, userId);
        return Promise.resolve();
    },

    getByNewsId: (newsId) => {
        const stmt = db.prepare(`
            SELECT nr.emoji, COUNT(*) as count, GROUP_CONCAT(u.username) as users
            FROM news_reactions nr
            JOIN users u ON nr.user_id = u.id
            WHERE nr.news_id = ?
            GROUP BY nr.emoji
        `);
        return Promise.resolve(stmt.all(newsId));
    },

    getByNewsIds: (newsIds) => {
        if (!Array.isArray(newsIds) || newsIds.length === 0) {
            return Promise.resolve([]);
        }
        const placeholders = newsIds.map(() => '?').join(',');
        const stmt = db.prepare(`
            SELECT nr.news_id, nr.emoji, COUNT(*) as count, GROUP_CONCAT(u.username) as users
            FROM news_reactions nr
            JOIN users u ON nr.user_id = u.id
            WHERE nr.news_id IN (${placeholders})
            GROUP BY nr.news_id, nr.emoji
        `);
        return Promise.resolve(stmt.all(...newsIds));
    }
};

// Friend operations
const friendDB = {
    sendRequest: (userId, friendId) => {
        // Check if request already exists
        const existing = db.prepare('SELECT id FROM friends WHERE user_id = ? AND friend_id = ?').get(userId, friendId);
        if (existing) {
            return Promise.resolve({ changes: 0, error: 'Request already exists' });
        }

        const stmt = db.prepare("INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, 'pending')");
        const result = stmt.run(userId, friendId);
        return Promise.resolve({ changes: result.changes, lastInsertRowid: result.lastInsertRowid });
    },

    acceptRequest: (userId, friendId) => {
        db.transaction(() => {
            db.prepare("UPDATE friends SET status = 'accepted' WHERE user_id = ? AND friend_id = ?").run(friendId, userId);
            db.prepare("INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, 'accepted')").run(userId, friendId);
        })();
        return Promise.resolve();
    },

    rejectRequest: (userId, friendId) => {
        const stmt = db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?');
        stmt.run(friendId, userId);
        return Promise.resolve();
    },

    removeFriend: (userId, friendId) => {
        db.transaction(() => {
            db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(userId, friendId);
            db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(friendId, userId);
        })();
        return Promise.resolve();
    },

    getFriends: (userId) => {
        const stmt = db.prepare(`
            SELECT u.id, u.username, u.email, u.avatar, u.status, f.status as friendship_status
            FROM friends f
            JOIN users u ON f.friend_id = u.id
            WHERE f.user_id = ? AND f.status = 'accepted'
        `);
        return Promise.resolve(stmt.all(userId));
    },

    getPendingRequests: (userId) => {
        const stmt = db.prepare(`
            SELECT u.id, u.username, u.email, u.avatar, u.status
            FROM friends f
            JOIN users u ON f.user_id = u.id
            WHERE f.friend_id = ? AND f.status = 'pending'
        `);
        return Promise.resolve(stmt.all(userId));
    },

    checkFriendship: (userId, friendId) => {
        const stmt = db.prepare("SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'");
        const row = stmt.get(userId, friendId);
        return Promise.resolve(!!row);
    }
};

// Server operations
const serverDB = {
    create: (name, ownerId) => {
        const icon = name.charAt(0).toUpperCase();
        const stmt = db.prepare('INSERT INTO servers (name, icon, owner_id) VALUES (?, ?, ?)');
        const result = stmt.run(name, icon, ownerId);
        return Promise.resolve({ id: result.lastInsertRowid, name, icon, ownerId });
    },

    getUserServers: (userId) => {
        const stmt = db.prepare(`
            SELECT s.* FROM servers s
            JOIN server_members sm ON s.id = sm.server_id
            WHERE sm.user_id = ?
            ORDER BY s.created_at ASC
        `);
        return Promise.resolve(stmt.all(userId));
    },

    addMember: (serverId, userId) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)');
        stmt.run(serverId, userId);
        return Promise.resolve();
    },

    getMembers: (serverId) => {
        const stmt = db.prepare(`
            SELECT u.id, u.username, u.avatar, u.status
            FROM users u
            JOIN server_members sm ON u.id = sm.user_id
            WHERE sm.server_id = ?
        `);
        return Promise.resolve(stmt.all(serverId));
    }
};

// Channel operations
const channelDB = {
    // Получить все каналы пользователя (включая системные)
    getUserChannels: (userId) => {
        const stmt = db.prepare(`
            SELECT c.* FROM channels c
            JOIN channel_subscriptions cs ON c.id = cs.channel_id
            WHERE cs.user_id = ?
            ORDER BY c.is_system DESC, c.created_at ASC
        `);
        return Promise.resolve(stmt.all(userId));
    },

    // Получить системный канал
    getSystemChannel: () => {
        const stmt = db.prepare('SELECT * FROM channels WHERE is_system = 1 LIMIT 1');
        return Promise.resolve(stmt.get());
    },

    // Создать канал
    create: (name, description, ownerId, type = 'public') => {
        const stmt = db.prepare('INSERT INTO channels (name, description, type, is_system, owner_id) VALUES (?, ?, ?, 0, ?)');
        const result = stmt.run(name, description, type, ownerId);
        return Promise.resolve({ id: result.lastInsertRowid, name, description, type, ownerId });
    },

    // Подписать пользователя на канал
    subscribe: (channelId, userId, isForced = 0) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO channel_subscriptions (channel_id, user_id, is_forced) VALUES (?, ?, ?)');
        stmt.run(channelId, userId, isForced);
        return Promise.resolve();
    },

    // Отписать пользователя от канала (если не системный)
    unsubscribe: (channelId, userId) => {
        const channel = channelDB.getById(channelId);
        return channel.then(ch => {
            if (ch && ch.is_system) {
                throw new Error('Cannot unsubscribe from system channel');
            }
            const stmt = db.prepare('DELETE FROM channel_subscriptions WHERE channel_id = ? AND user_id = ?');
            stmt.run(channelId, userId);
            return Promise.resolve();
        });
    },

    // Проверить подписку
    isSubscribed: (channelId, userId) => {
        const stmt = db.prepare('SELECT * FROM channel_subscriptions WHERE channel_id = ? AND user_id = ?');
        const sub = stmt.get(channelId, userId);
        return Promise.resolve(!!sub);
    },

    // Получить канал по ID
    getById: (channelId) => {
        const stmt = db.prepare('SELECT * FROM channels WHERE id = ?');
        return Promise.resolve(stmt.get(channelId));
    },

    // Получить сообщения канала
    getMessages: (channelId, limit = 50) => {
        const stmt = db.prepare(`
            SELECT cm.*, u.username, u.avatar,
                   reply_cm.content as reply_to_content,
                   reply_sender.username as reply_to_author
            FROM channel_messages cm
            JOIN users u ON cm.sender_id = u.id
            LEFT JOIN channel_messages reply_cm ON cm.reply_to_id = reply_cm.id
            LEFT JOIN users reply_sender ON reply_cm.sender_id = reply_sender.id
            WHERE cm.channel_id = ?
            ORDER BY cm.created_at DESC
            LIMIT ?
        `);
        const rows = stmt.all(channelId, limit);
        const processedRows = rows.map(row => ({
            ...row,
            edited: Boolean(row.is_edited),
            originalContent: row.is_edited ? row.original_content : undefined,
            replyTo: row.reply_to_id ? {
                id: row.reply_to_id,
                author: row.reply_to_author,
                text: row.reply_to_content
            } : null
        }));
        return Promise.resolve(processedRows.reverse());
    },

    // Создать сообщение в канале
    createMessage: (content, channelId, senderId, replyToId = null) => {
        const stmt = db.prepare('INSERT INTO channel_messages (content, original_content, channel_id, sender_id, reply_to_id) VALUES (?, ?, ?, ?, ?)');
        const result = stmt.run(content, content, channelId, senderId, replyToId);
        return Promise.resolve({ id: result.lastInsertRowid, content, channelId, senderId, reply_to_id: replyToId });
    },

    // Обновить сообщение
    updateMessage: (messageId, newContent) => {
        const stmt = db.prepare('UPDATE channel_messages SET content = ?, original_content = ?, updated_at = CURRENT_TIMESTAMP, is_edited = TRUE WHERE id = ?');
        stmt.run(newContent, newContent, messageId);
        return Promise.resolve();
    },

    // Удалить сообщение
    deleteMessage: (messageId) => {
        const stmt = db.prepare('DELETE FROM channel_messages WHERE id = ?');
        stmt.run(messageId);
        return Promise.resolve();
    },

    // Подписать всех пользователей на системный канал
    subscribeAllToSystem: () => {
        const systemChannel = channelDB.getSystemChannel();
        return systemChannel.then(ch => {
            if (!ch) return Promise.resolve();
            const users = db.prepare('SELECT id FROM users').all();
            const stmt = db.prepare('INSERT OR IGNORE INTO channel_subscriptions (channel_id, user_id, is_forced) VALUES (?, ?, 1)');
            users.forEach(user => {
                stmt.run(ch.id, user.id);
            });
            return Promise.resolve();
        });
    },

    // Получить количество подписчиков канала
    getSubscriberCount: (channelId) => {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM channel_subscriptions WHERE channel_id = ?');
        const result = stmt.get(channelId);
        return Promise.resolve(result ? result.count : 0);
    }
};

// Notification operations
const notificationDB = {
    // Создать уведомление
    create: (userId, fromUserId, type, content = null, callType = null) => {
        const stmt = db.prepare(`
            INSERT INTO notifications (user_id, from_user_id, type, content, call_type)
            VALUES (?, ?, ?, ?, ?)
        `);
        const result = stmt.run(userId, fromUserId, type, content, callType);
        return Promise.resolve({ 
            id: result.lastInsertRowid, 
            userId, 
            fromUserId, 
            type, 
            content, 
            callType,
            read: false 
        });
    },

    // Получить все непрочитанные уведомления пользователя
    getUnread: (userId) => {
        const stmt = db.prepare(`
            SELECT n.*, u.username as from_username, u.avatar as from_avatar
            FROM notifications n
            LEFT JOIN users u ON n.from_user_id = u.id
            WHERE n.user_id = ? AND n.read = 0
            ORDER BY n.created_at DESC
        `);
        return Promise.resolve(stmt.all(userId).map(row => ({
            id: row.id,
            userId: row.user_id,
            fromUserId: row.from_user_id,
            fromUsername: row.from_username,
            fromAvatar: row.from_avatar,
            type: row.type,
            callType: row.call_type,
            content: row.content,
            read: row.read,
            createdAt: row.created_at
        })));
    },

    // Получить все уведомления пользователя
    getAll: (userId, limit = 50) => {
        const stmt = db.prepare(`
            SELECT n.*, u.username as from_username, u.avatar as from_avatar
            FROM notifications n
            LEFT JOIN users u ON n.from_user_id = u.id
            WHERE n.user_id = ?
            ORDER BY n.created_at DESC
            LIMIT ?
        `);
        return Promise.resolve(stmt.all(userId, limit).map(row => ({
            id: row.id,
            userId: row.user_id,
            fromUserId: row.from_user_id,
            fromUsername: row.from_username,
            fromAvatar: row.from_avatar,
            type: row.type,
            callType: row.call_type,
            content: row.content,
            read: row.read,
            createdAt: row.created_at
        })));
    },

    // Отметить уведомление как прочитанное
    markAsRead: (notificationId, userId) => {
        const stmt = db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?');
        stmt.run(notificationId, userId);
        return Promise.resolve();
    },

    // Отметить все уведомления пользователя как прочитанные
    markAllAsRead: (userId) => {
        const stmt = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0');
        stmt.run(userId);
        return Promise.resolve();
    },

    // Отметить все уведомления от конкретного пользователя как прочитанные
    markFromUserAsRead: (userId, fromUserId) => {
        const stmt = db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND from_user_id = ? AND read = 0');
        stmt.run(userId, fromUserId);
        return Promise.resolve();
    },

    // Удалить уведомление
    delete: (notificationId, userId) => {
        const stmt = db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?');
        stmt.run(notificationId, userId);
        return Promise.resolve();
    },

    // Удалить все уведомления пользователя
    deleteAll: (userId) => {
        const stmt = db.prepare('DELETE FROM notifications WHERE user_id = ?');
        stmt.run(userId);
        return Promise.resolve();
    },

    // Получить количество непрочитанных уведомлений
    getUnreadCount: (userId) => {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND read = 0');
        const result = stmt.get(userId);
        return Promise.resolve(result ? result.count : 0);
    },

    // Получить количество непрочитанных от конкретного пользователя
    getUnreadFromUserCount: (userId, fromUserId) => {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND from_user_id = ? AND read = 0');
        const result = stmt.get(userId, fromUserId);
        return Promise.resolve(result ? result.count : 0);
    }
};

// Session operations
const sessionDB = {
    create: (sessionId, userId, expiresAt = null) => {
        const stmt = db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)');
        stmt.run(sessionId, userId, expiresAt);
        return Promise.resolve({ id: sessionId, user_id: userId, expires_at: expiresAt });
    },

    findBySessionId: (sessionId) => {
        const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
        return Promise.resolve(stmt.get(sessionId));
    },

    deleteBySessionId: (sessionId) => {
        const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
        stmt.run(sessionId);
        return Promise.resolve();
    },

    deleteExpired: () => {
        const stmt = db.prepare("DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < datetime('now')");
        stmt.run();
        return Promise.resolve();
    },

    cleanup: () => {
        setInterval(() => {
            try {
                sessionDB.deleteExpired();
            } catch (error) {
                console.error('Session cleanup error:', error);
            }
        }, 60 * 60 * 1000);
    }
};

module.exports = {
    db,
    initializeDatabase,
    userDB,
    dmDB,
    fileDB,
    reactionDB,
    newsReactionDB,
    friendDB,
    serverDB,
    channelDB,
    sessionDB,
    notificationDB
};
