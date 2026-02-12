const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'discord_clone.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
function initializeDatabase() {
    db.serialize(() => {
        // Users table
        db.run(`
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
        db.run(`
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
        db.run(`
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
        
        // Check if updated_at column exists, if not add it
        db.all("PRAGMA table_info(direct_messages)", (err, rows) => {
            if (!err) {
                const hasUpdatedAtColumn = rows.some(row => row.name === 'updated_at');
                const hasIsEditedColumn = rows.some(row => row.name === 'is_edited');
                const hasOriginalContentColumn = rows.some(row => row.name === 'original_content');

                if (!hasUpdatedAtColumn) {
                    db.run("ALTER TABLE direct_messages ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;", (err) => {
                        if (err) {
                            console.log("Error adding updated_at column:", err.message);
                        } else {
                            console.log("Added updated_at column to direct_messages table");
                        }
                    });
                }

                if (!hasIsEditedColumn) {
                    db.run("ALTER TABLE direct_messages ADD COLUMN is_edited BOOLEAN DEFAULT FALSE;", (err) => {
                        if (err) {
                            console.log("Error adding is_edited column:", err.message);
                        } else {
                            console.log("Added is_edited column to direct_messages table");
                        }
                    });
                }

                if (!hasOriginalContentColumn) {
                    db.run("ALTER TABLE direct_messages ADD COLUMN original_content TEXT;", (err) => {
                        if (err) {
                            console.log("Error adding original_content column:", err.message);
                        } else {
                            console.log("Added original_content column to direct_messages table");
                        }
                    });
                }
            }
        });

        // File uploads table
        db.run(`
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

        // Check if dm_id column exists, if not add it
        db.all("PRAGMA table_info(file_uploads)", (err, rows) => {
            if (!err) {
                const hasDmIdColumn = rows.some(row => row.name === 'dm_id');
                if (!hasDmIdColumn) {
                    db.run("ALTER TABLE file_uploads ADD COLUMN dm_id INTEGER;", (err) => {
                        if (err) {
                            console.log("Error adding dm_id column:", err.message);
                        } else {
                            console.log("Added dm_id column to file_uploads table");
                        }
                    });
                }

                // Check if sender_id and receiver_id columns exist, if not add them
                const hasSenderIdColumn = rows.some(row => row.name === 'sender_id');
                const hasReceiverIdColumn = rows.some(row => row.name === 'receiver_id');

                if (!hasSenderIdColumn) {
                    db.run("ALTER TABLE file_uploads ADD COLUMN sender_id INTEGER;", (err) => {
                        if (err) {
                            console.log("Error adding sender_id column:", err.message);
                        } else {
                            console.log("Added sender_id column to file_uploads table");
                        }
                    });
                }

                if (!hasReceiverIdColumn) {
                    db.run("ALTER TABLE file_uploads ADD COLUMN receiver_id INTEGER;", (err) => {
                        if (err) {
                            console.log("Error adding receiver_id column:", err.message);
                        } else {
                            console.log("Added receiver_id column to file_uploads table");
                        }
                    });
                }
            }
        });

        // Reactions table
        db.run(`
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
        db.run(`
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
        db.run(`
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
        db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);

        console.log('Database initialized successfully');
    });
}

// User operations
const userDB = {
    create: (username, email, hashedPassword) => {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
            db.run(sql, [username, email, hashedPassword], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, username, email });
            });
        });
    },

    findByEmail: (email) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM users WHERE email = ?';
            db.get(sql, [email], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    findById: (id) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT id, username, email, avatar, status FROM users WHERE id = ?';
            db.get(sql, [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    updateStatus: (id, status) => {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE users SET status = ? WHERE id = ?';
            db.run(sql, [status, id], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    getAll: () => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT id, username, email, avatar, status FROM users';
            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};


// Direct message operations
const dmDB = {
    create: (content, senderId, receiverId) => {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT INTO direct_messages (content, original_content, sender_id, receiver_id) VALUES (?, ?, ?, ?)';
            db.run(sql, [content, content, senderId, receiverId], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, content, senderId, receiverId });
            });
        });
    },

    getConversation: (userId1, userId2, limit = 50) => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT dm.*, u.username, u.avatar
                FROM direct_messages dm
                JOIN users u ON dm.sender_id = u.id
                WHERE (dm.sender_id = ? AND dm.receiver_id = ?)
                   OR (dm.sender_id = ? AND dm.receiver_id = ?)
                ORDER BY dm.created_at DESC
                LIMIT ?
            `;
            db.all(sql, [userId1, userId2, userId2, userId1, limit], (err, rows) => {
                if (err) reject(err);
                else {
                    // Преобразуем поле is_edited из числа в булевое значение
                    const processedRows = rows.map(row => ({
                        ...row,
                        edited: Boolean(row.is_edited),
                        originalContent: row.is_edited ? row.original_content : undefined
                    }));
                    resolve(processedRows.reverse());
                }
            });
        });
    },

    getById: (messageId) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT *, CASE WHEN is_edited THEN original_content ELSE NULL END AS originalContent FROM direct_messages WHERE id = ?';
            db.get(sql, [messageId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    update: (messageId, newContent) => {
        return new Promise((resolve, reject) => {
            // Сначала получаем текущее сообщение, чтобы проверить статус is_edited
            dmDB.getById(messageId)
                .then(originalMessage => {
                    // Проверяем наличие столбцов перед обновлением
                    db.all("PRAGMA table_info(direct_messages)", (err, rows) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        const hasUpdatedAtColumn = rows.some(row => row.name === 'updated_at');
                        const hasIsEditedColumn = rows.some(row => row.name === 'is_edited');
                        const hasOriginalContentColumn = rows.some(row => row.name === 'original_content');

                        let sql;
                        if (hasUpdatedAtColumn && hasIsEditedColumn && hasOriginalContentColumn) {
                            // Если все три столбца существуют
                            if (!originalMessage.is_edited) {
                                // Если сообщение еще не редактировалось, устанавливаем original_content
                                sql = 'UPDATE direct_messages SET content = ?, original_content = ?, updated_at = CURRENT_TIMESTAMP, is_edited = TRUE WHERE id = ?';
                                db.run(sql, [newContent, originalMessage.content, messageId], (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            } else {
                                // Если сообщение уже редактировалось, просто обновляем content и updated_at
                                sql = 'UPDATE direct_messages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                                db.run(sql, [newContent, messageId], (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            }
                        } else if (hasUpdatedAtColumn && hasIsEditedColumn) {
                            // Если только updated_at и is_edited существуют
                            sql = 'UPDATE direct_messages SET content = ?, updated_at = CURRENT_TIMESTAMP, is_edited = TRUE WHERE id = ?';
                            db.run(sql, [newContent, messageId], (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        } else if (hasUpdatedAtColumn) {
                            // Если только updated_at существует
                            sql = 'UPDATE direct_messages SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
                            db.run(sql, [newContent, messageId], (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        } else if (hasIsEditedColumn) {
                            // Если только is_edited существует
                            sql = 'UPDATE direct_messages SET content = ?, is_edited = TRUE WHERE id = ?';
                            db.run(sql, [newContent, messageId], (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        } else {
                            // Если ни один из дополнительных столбцов не существует
                            sql = 'UPDATE direct_messages SET content = ? WHERE id = ?';
                            db.run(sql, [newContent, messageId], (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        }
                    });
                })
                .catch(error => {
                    reject(error);
                });
        });
    },

    delete: (messageId) => {
        return new Promise((resolve, reject) => {
            // Удаляем сначала реакции и файлы, связанные с сообщением
            const deleteReactionsSql = 'DELETE FROM reactions WHERE message_id = ?';
            const deleteFilesSql = 'DELETE FROM file_uploads WHERE dm_id = ?';
            const deleteMessageSql = 'DELETE FROM direct_messages WHERE id = ?';
            
            db.serialize(() => {
                // Удаляем реакции
                db.run(deleteReactionsSql, [messageId], (err) => {
                    if (err) {
                        console.error('Error deleting reactions:', err);
                        // Продолжаем выполнение даже если возникла ошибка
                    }
                    
                    // Удаляем файлы
                    db.run(deleteFilesSql, [messageId], (err) => {
                        if (err) {
                            console.error('Error deleting files:', err);
                            // Продолжаем выполнение даже если возникла ошибка
                        }
                        
                        // Удаляем само сообщение
                        db.run(deleteMessageSql, [messageId], (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                });
            });
        });
    },

    markAsRead: (messageId) => {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE direct_messages SET read = 1 WHERE id = ?';
            db.run(sql, [messageId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

// File operations
const fileDB = {
    create: (filename, filepath, filetype, filesize, userId, dmId) => {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT INTO file_uploads (filename, filepath, filetype, filesize, user_id, dm_id) VALUES (?, ?, ?, ?, ?, ?)';
            db.run(sql, [filename, filepath, filetype, filesize, userId, dmId], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, filename, filepath });
            });
        });
    },

    getByDM: (dmId) => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT f.*, u.username
                FROM file_uploads f
                JOIN users u ON f.user_id = u.id
                WHERE f.dm_id = ?
                ORDER BY f.created_at DESC
            `;
            db.all(sql, [dmId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    updateSenderReceiver: (fileId, senderId, receiverId) => {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE file_uploads SET sender_id = ?, receiver_id = ? WHERE id = ?';
            db.run(sql, [senderId, receiverId, fileId], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    linkToFileMessage: (fileId, messageId) => {
        return new Promise((resolve, reject) => {
            const sql = 'UPDATE file_uploads SET dm_id = ? WHERE id = ?';
            db.run(sql, [messageId, fileId], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    }
};

// Reaction operations
const reactionDB = {
    add: (emoji, messageId, userId) => {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT OR IGNORE INTO reactions (emoji, message_id, user_id) VALUES (?, ?, ?)';
            db.run(sql, [emoji, messageId, userId], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, emoji, messageId, userId });
            });
        });
    },

    remove: (emoji, messageId, userId) => {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM reactions WHERE emoji = ? AND message_id = ? AND user_id = ?';
            db.run(sql, [emoji, messageId, userId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    getByMessage: (messageId) => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT r.emoji, COUNT(*) as count, GROUP_CONCAT(u.username) as users
                FROM reactions r
                JOIN users u ON r.user_id = u.id
                WHERE r.message_id = ?
                GROUP BY r.emoji
            `;
            db.all(sql, [messageId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

// Friend operations
const friendDB = {
    sendRequest: (userId, friendId) => {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, "pending")';
            db.run(sql, [userId, friendId], function(err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            });
        });
    },

    acceptRequest: (userId, friendId) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                // Update the request status
                const sql1 = 'UPDATE friends SET status = "accepted" WHERE user_id = ? AND friend_id = ?';
                db.run(sql1, [friendId, userId], (err) => {
                    if (err) return reject(err);
                });

                // Create reverse relationship
                const sql2 = 'INSERT OR IGNORE INTO friends (user_id, friend_id, status) VALUES (?, ?, "accepted")';
                db.run(sql2, [userId, friendId], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    },

    rejectRequest: (userId, friendId) => {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM friends WHERE user_id = ? AND friend_id = ?';
            db.run(sql, [friendId, userId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    removeFriend: (userId, friendId) => {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                const sql1 = 'DELETE FROM friends WHERE user_id = ? AND friend_id = ?';
                const sql2 = 'DELETE FROM friends WHERE user_id = ? AND friend_id = ?';
                
                db.run(sql1, [userId, friendId], (err) => {
                    if (err) return reject(err);
                });
                
                db.run(sql2, [friendId, userId], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });
    },

    getFriends: (userId) => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT u.id, u.username, u.email, u.avatar, u.status, f.status as friendship_status
                FROM friends f
                JOIN users u ON f.friend_id = u.id
                WHERE f.user_id = ? AND f.status = 'accepted'
            `;
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    getPendingRequests: (userId) => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT u.id, u.username, u.email, u.avatar, u.status
                FROM friends f
                JOIN users u ON f.user_id = u.id
                WHERE f.friend_id = ? AND f.status = 'pending'
            `;
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    checkFriendship: (userId, friendId) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = "accepted"';
            db.get(sql, [userId, friendId], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });
    }
};

// Server operations
const serverDB = {
    create: (name, ownerId) => {
        return new Promise((resolve, reject) => {
            const icon = name.charAt(0).toUpperCase();
            const sql = 'INSERT INTO servers (name, icon, owner_id) VALUES (?, ?, ?)';
            db.run(sql, [name, icon, ownerId], function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, name, icon, ownerId });
            });
        });
    },

    getUserServers: (userId) => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT s.* FROM servers s
                JOIN server_members sm ON s.id = sm.server_id
                WHERE sm.user_id = ?
                ORDER BY s.created_at ASC
            `;
            db.all(sql, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    addMember: (serverId, userId) => {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT OR IGNORE INTO server_members (server_id, user_id) VALUES (?, ?)';
            db.run(sql, [serverId, userId], function(err) {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    getMembers: (serverId) => {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT u.id, u.username, u.avatar, u.status
                FROM users u
                JOIN server_members sm ON u.id = sm.user_id
                WHERE sm.server_id = ?
            `;
            db.all(sql, [serverId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
};

// Session operations
const sessionDB = {
    create: (sessionId, userId, expiresAt = null) => {
        return new Promise((resolve, reject) => {
            const sql = 'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)';
            db.run(sql, [sessionId, userId, expiresAt], (err) => {
                if (err) reject(err);
                else resolve({ id: sessionId, user_id: userId, expires_at: expiresAt });
            });
        });
    },

    findBySessionId: (sessionId) => {
        return new Promise((resolve, reject) => {
            const sql = 'SELECT * FROM sessions WHERE id = ?';
            db.get(sql, [sessionId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    deleteBySessionId: (sessionId) => {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM sessions WHERE id = ?';
            db.run(sql, [sessionId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    deleteExpired: () => {
        return new Promise((resolve, reject) => {
            const sql = 'DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < datetime("now")';
            db.run(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    },

    cleanup: () => {
        // Clean up expired sessions periodically
        setInterval(async () => {
            try {
                await sessionDB.deleteExpired();
            } catch (error) {
                console.error('Session cleanup error:', error);
            }
        }, 60 * 60 * 1000); // Run every hour
    }
};

module.exports = {
    db,
    initializeDatabase,
    userDB,
    dmDB,
    fileDB,
    reactionDB,
    friendDB,
    serverDB,
    sessionDB
};