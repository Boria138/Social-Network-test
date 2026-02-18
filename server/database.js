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
            read BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users(id),
            FOREIGN KEY (receiver_id) REFERENCES users(id)
        )
    `);

    // Миграция: добавляем недостающие столбцы в direct_messages
    const dmColumns = db.pragma('table_info(direct_messages)');
    const hasUpdatedAtColumn = dmColumns.some(col => col.name === 'updated_at');
    const hasIsEditedColumn = dmColumns.some(col => col.name === 'is_edited');
    const hasOriginalContentColumn = dmColumns.some(col => col.name === 'original_content');

    if (!hasUpdatedAtColumn) {
        try {
            db.exec("ALTER TABLE direct_messages ADD COLUMN updated_at DATETIME;");
            db.exec("UPDATE direct_messages SET updated_at = created_at WHERE updated_at IS NULL;");
            console.log("✓ Добавлен столбец updated_at в direct_messages");
        } catch (err) {
            console.error("Ошибка при добавлении updated_at:", err.message);
        }
    }

    if (!hasIsEditedColumn) {
        try {
            db.exec("ALTER TABLE direct_messages ADD COLUMN is_edited BOOLEAN DEFAULT 0;");
            console.log("✓ Добавлен столбец is_edited в direct_messages");
        } catch (err) {
            console.error("Ошибка при добавлении is_edited:", err.message);
        }
    }

    if (!hasOriginalContentColumn) {
        try {
            db.exec("ALTER TABLE direct_messages ADD COLUMN original_content TEXT;");
            console.log("✓ Добавлен столбец original_content в direct_messages");
        } catch (err) {
            console.error("Ошибка при добавлении original_content:", err.message);
        }
    }

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
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (dm_id) REFERENCES direct_messages(id)
        )
    `);

    // Миграция: добавляем недостающие столбцы в file_uploads
    const fileColumns = db.pragma('table_info(file_uploads)');
    const hasDmIdColumn = fileColumns.some(col => col.name === 'dm_id');
    const hasSenderIdColumn = fileColumns.some(col => col.name === 'sender_id');
    const hasReceiverIdColumn = fileColumns.some(col => col.name === 'receiver_id');

    if (!hasDmIdColumn) {
        try {
            db.exec("ALTER TABLE file_uploads ADD COLUMN dm_id INTEGER;");
            console.log("✓ Добавлен столбец dm_id в file_uploads");
        } catch (err) {
            console.error("Ошибка при добавлении dm_id:", err.message);
        }
    }

    if (!hasSenderIdColumn) {
        try {
            db.exec("ALTER TABLE file_uploads ADD COLUMN sender_id INTEGER;");
            console.log("✓ Добавлен столбец sender_id в file_uploads");
        } catch (err) {
            console.error("Ошибка при добавлении sender_id:", err.message);
        }
    }

    if (!hasReceiverIdColumn) {
        try {
            db.exec("ALTER TABLE file_uploads ADD COLUMN receiver_id INTEGER;");
            console.log("✓ Добавлен столбец receiver_id в file_uploads");
        } catch (err) {
            console.error("Ошибка при добавлении receiver_id:", err.message);
        }
    }

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

    console.log('Database initialized successfully');
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

    findById: (id) => {
        const stmt = db.prepare('SELECT id, username, email, avatar, status FROM users WHERE id = ?');
        return Promise.resolve(stmt.get(id));
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
    create: (content, senderId, receiverId) => {
        const stmt = db.prepare('INSERT INTO direct_messages (content, original_content, sender_id, receiver_id) VALUES (?, ?, ?, ?)');
        const result = stmt.run(content, content, senderId, receiverId);
        return Promise.resolve({ id: result.lastInsertRowid, content, senderId, receiverId });
    },

    getConversation: (userId1, userId2, limit = 50) => {
        const stmt = db.prepare(`
            SELECT dm.*, u.username, u.avatar
            FROM direct_messages dm
            JOIN users u ON dm.sender_id = u.id
            WHERE (dm.sender_id = ? AND dm.receiver_id = ?)
               OR (dm.sender_id = ? AND dm.receiver_id = ?)
            ORDER BY dm.created_at DESC
            LIMIT ?
        `);
        const rows = stmt.all(userId1, userId2, userId2, userId1, limit);
        const processedRows = rows.map(row => ({
            ...row,
            edited: Boolean(row.is_edited),
            originalContent: row.is_edited ? row.original_content : undefined
        }));
        return Promise.resolve(processedRows.reverse());
    },

    getById: (messageId) => {
        const stmt = db.prepare('SELECT *, CASE WHEN is_edited THEN original_content ELSE NULL END AS originalContent FROM direct_messages WHERE id = ?');
        return Promise.resolve(stmt.get(messageId));
    },

    update: (messageId, newContent) => {
        const originalMessage = dmDB.getById(messageId).then(msg => msg);
        
        return originalMessage.then(originalMessage => {
            const dmColumns = db.pragma('table_info(direct_messages)');
            const hasUpdatedAtColumn = dmColumns.some(col => col.name === 'updated_at');
            const hasIsEditedColumn = dmColumns.some(col => col.name === 'is_edited');
            const hasOriginalContentColumn = dmColumns.some(col => col.name === 'original_content');

            let stmt;
            if (hasUpdatedAtColumn && hasIsEditedColumn && hasOriginalContentColumn) {
                if (!originalMessage.is_edited) {
                    stmt = db.prepare('UPDATE direct_messages SET content = ?, original_content = ?, updated_at = CURRENT_TIMESTAMP, is_edited = TRUE WHERE id = ?');
                    stmt.run(newContent, originalMessage.content, messageId);
                } else {
                    stmt = db.prepare('UPDATE direct_messages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
                    stmt.run(newContent, messageId);
                }
            } else if (hasUpdatedAtColumn && hasIsEditedColumn) {
                stmt = db.prepare('UPDATE direct_messages SET content = ?, updated_at = CURRENT_TIMESTAMP, is_edited = TRUE WHERE id = ?');
                stmt.run(newContent, messageId);
            } else if (hasUpdatedAtColumn) {
                stmt = db.prepare('UPDATE direct_messages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
                stmt.run(newContent, messageId);
            } else if (hasIsEditedColumn) {
                stmt = db.prepare('UPDATE direct_messages SET content = ?, is_edited = TRUE WHERE id = ?');
                stmt.run(newContent, messageId);
            } else {
                stmt = db.prepare('UPDATE direct_messages SET content = ? WHERE id = ?');
                stmt.run(newContent, messageId);
            }
            return Promise.resolve();
        });
    },

    delete: (messageId) => {
        const deleteReactions = db.prepare('DELETE FROM reactions WHERE message_id = ?');
        const deleteFiles = db.prepare('DELETE FROM file_uploads WHERE dm_id = ?');
        const deleteMessage = db.prepare('DELETE FROM direct_messages WHERE id = ?');

        const transaction = db.transaction((id) => {
            deleteReactions.run(id);
            deleteFiles.run(id);
            deleteMessage.run(id);
        });

        transaction(messageId);
        return Promise.resolve();
    },

    markAsRead: (messageId) => {
        const stmt = db.prepare('UPDATE direct_messages SET read = 1 WHERE id = ?');
        stmt.run(messageId);
        return Promise.resolve();
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
        const stmt = db.prepare('INSERT OR IGNORE INTO reactions (emoji, message_id, user_id) VALUES (?, ?, ?)');
        const result = stmt.run(emoji, messageId, userId);
        return Promise.resolve({ id: result.lastInsertRowid, emoji, messageId, userId });
    },

    remove: (emoji, messageId, userId) => {
        const stmt = db.prepare('DELETE FROM reactions WHERE emoji = ? AND message_id = ? AND user_id = ?');
        stmt.run(emoji, messageId, userId);
        return Promise.resolve();
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

// Friend operations
const friendDB = {
    sendRequest: (userId, friendId) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, "pending")');
        const result = stmt.run(userId, friendId);
        return Promise.resolve({ changes: result.changes });
    },

    acceptRequest: (userId, friendId) => {
        const updateStmt = db.prepare('UPDATE friends SET status = "accepted" WHERE user_id = ? AND friend_id = ?');
        const insertStmt = db.prepare('INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, "accepted")');
        
        updateStmt.run(friendId, userId);
        insertStmt.run(userId, friendId);
        return Promise.resolve();
    },

    rejectRequest: (userId, friendId) => {
        const stmt = db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?');
        stmt.run(friendId, userId);
        return Promise.resolve();
    },

    removeFriend: (userId, friendId) => {
        const stmt1 = db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?');
        const stmt2 = db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?');
        
        stmt1.run(userId, friendId);
        stmt2.run(friendId, userId);
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
        const stmt = db.prepare('SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = "accepted"');
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
            SELECT u.id, u.username, u.email, u.avatar, u.status
            FROM server_members sm
            JOIN users u ON sm.user_id = u.id
            WHERE sm.server_id = ?
        `);
        return Promise.resolve(stmt.all(serverId));
    },

    getById: (serverId) => {
        const stmt = db.prepare('SELECT * FROM servers WHERE id = ?');
        return Promise.resolve(stmt.get(serverId));
    },

    update: (serverId, name) => {
        const stmt = db.prepare('UPDATE servers SET name = ? WHERE id = ?');
        stmt.run(name, serverId);
        return Promise.resolve();
    },

    delete: (serverId) => {
        const deleteMembers = db.prepare('DELETE FROM server_members WHERE server_id = ?');
        const deleteServer = db.prepare('DELETE FROM servers WHERE id = ?');
        
        const transaction = db.transaction((id) => {
            deleteMembers.run(id);
            deleteServer.run(id);
        });
        
        transaction(serverId);
        return Promise.resolve();
    },

    removeMember: (serverId, userId) => {
        const stmt = db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?');
        stmt.run(serverId, userId);
        return Promise.resolve();
    },

    isMember: (serverId, userId) => {
        const stmt = db.prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?');
        const row = stmt.get(serverId, userId);
        return Promise.resolve(!!row);
    }
};

// Session operations
const sessionDB = {
    create: (id, userId, expiresAt) => {
        const stmt = db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)');
        stmt.run(id, userId, expiresAt);
        return Promise.resolve();
    },

    findById: (id) => {
        const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
        return Promise.resolve(stmt.get(id));
    },

    findBySessionId: (id) => {
        const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
        return Promise.resolve(stmt.get(id));
    },

    delete: (id) => {
        const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
        stmt.run(id);
        return Promise.resolve();
    },

    deleteExpired: () => {
        const stmt = db.prepare('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP');
        stmt.run();
        return Promise.resolve();
    },

    deleteByUserId: (userId) => {
        const stmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');
        stmt.run(userId);
        return Promise.resolve();
    },

    cleanup: () => {
        // Запускаем периодическую очистку просроченных сессий (каждые 30 минут)
        setInterval(() => {
            try {
                const stmt = db.prepare('DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP');
                const result = stmt.run();
                if (result.changes > 0) {
                    console.log(`🧹 Удалено ${result.changes} просроченных сессий`);
                }
            } catch (err) {
                console.error('Ошибка при очистке сессий:', err.message);
            }
        }, 30 * 60 * 1000);
        return Promise.resolve();
    }
};

module.exports = {
    initializeDatabase,
    userDB,
    dmDB,
    fileDB,
    reactionDB,
    friendDB,
    serverDB,
    sessionDB,
    db
};
