# Voxii — AI Agent Guidelines

**Project:** Voxii — Real-time chat with voice/video calls & Notifications
**Domain:** voxii.lenuma.ru
**Languages:** JavaScript (ES2022+), Node.js 20+
**Platform:** Linux (POSIX), Web Application
**License:** MIT
**Build:** npm workspaces

---

**Summary:** AI agents MUST behave as conservative patching assistants, prioritizing minimal changes and existing patterns over architectural refactoring or code cleanup. AI MUST NOT perform architectural improvements unless explicitly requested.

**Scope:** These guidelines apply exclusively to AI-generated code. Documentation updates and human maintainers are exempt from line limits and these constraints.

---

## Core Principles

| Principle | Required | Forbidden |
|-----------|----------|-----------|
| KISS | Functions ≤50 lines | Deep nesting |
| YAGNI | Concrete code | Future abstractions |
| DRY | Extract functions (if directly related to task) | Copy-paste |
| SRP | 1 task per function | God functions |
| Minimal changes | Modify relevant section only | Rewrite entire files |

**Priority order (highest to lowest):**

1. Minimal changes (overrides DRY, SRP)
2. Security (no hardcoded credentials, input validation)
3. Linux compatibility
4. KISS / YAGNI
5. DRY / SRP

**When principles conflict:**

- Prefer minimal diff over extracting functions
- Prefer existing patterns over "correct" refactoring
- Prefer small targeted fix over comprehensive cleanup
- Never break security for code quality
- Remove duplicates only if directly related to current task

---

## Code Metrics

| Check | Limit |
|-------|-------|
| Functions | ≤50 lines, ≤4 params |
| Files | ≤800 lines |
| Nesting | ≤4 levels |
| Comments | English, 1-2 lines max |
| Indentation | 2 spaces (no tabs) |
| Whitespace | No trailing spaces |
| Blank lines | No excessive blank lines |
| EOF | Exactly one newline |
| Commits | English, ≤72 chars |
| Version | Sync with CHANGELOG.md |

### Version Management

**CRITICAL:** Version in `package.json` MUST match the latest version in `CHANGELOG.md`.

```bash
# Check current versions
cat package.json | grep version        # package.json version
head -20 CHANGELOG.md | grep '## \['   # CHANGELOG version
```

**Rules:**
- **ALWAYS** check CHANGELOG.md before modifying version
- **ALWAYS** update package.json when CHANGELOG has newer version
- **NEVER** change version without corresponding CHANGELOG entry
- **NEVER** leave package.json version behind CHANGELOG

**Example:**
```json
// package.json - GOOD
{
  "name": "discord-clone",
  "version": "1.3.0"  // Matches CHANGELOG
}
```

```markdown
## CHANGELOG.md - GOOD
## [1.3.0] - 2026-03-04
```

---

## Forbidden Patterns

```javascript
// NEVER: 6+ parameters
function processMessage(user, ctx, log, val, map, cache, extra) { ... }

// NEVER: Deep nesting
if (c1) {
    if (c2) {
        if (c3) {
            if (c4) { ... }
        }
    }
}

// NEVER: console.log in production code
console.log(`Message ${id} sent`);

// NEVER: SQL injection risks
db.prepare(`SELECT * FROM users WHERE id = ${userId}`).get();

// NEVER: Hardcoded credentials
const API_KEY = "sk-abc123";

// NEVER: Path traversal
const filePath = `/uploads/${userFilename}`;

// NEVER: shell=True equivalent
exec(`rm -rf ${userPath}`);
```

```javascript
// ALWAYS: ≤4 parameters
function processMessage(messageId, content, userId, channelId) {
    // Process message data
    ...
}

// ALWAYS: Early returns
if (!condition1) return;
if (!condition2) return;

// ALWAYS: Logging via dedicated module
import { logger } from './logger.js';
logger.info('Message %s sent', id);

// ALWAYS: Parameterized queries
db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

// ALWAYS: Environment variables
const API_KEY = process.env.API_KEY;

// ALWAYS: Sanitize paths
const filePath = path.join(UPLOAD_DIR, path.basename(userFilename));
```

---

## Code Modification Rules

- NEVER rewrite entire file unless explicitly requested
- Modify only the relevant section
- Preserve existing architecture and naming
- Do not auto-format unrelated code
- Do not reorder imports unless necessary
- Do not introduce abstractions without request
- Do not change logging system
- Do not change public APIs without reason
- Do not add dependencies unless required
- Do not refactor unrelated code
- Do not add comments for obvious code
- **NEVER leave outdated comments after refactoring**
- **ALWAYS update or remove comments that reference removed dependencies, patterns, or context**
- **NEVER leave stub/no-op functions** (e.g., `function func() {}` with comment "removed")
- **When removing a feature, delete the function entirely, not stub it**
- Never invent modules
- Do not move files unless requested
- Do not create new files for organization (unless task requires a new module)
- No circular imports
- Database calls in dedicated functions
- No mutable global state (except logger)

**ALWAYS:**

- Minimal diff
- Targeted changes only
- Preserve existing patterns
- Keep surrounding code unchanged

---

## LLM Prohibitions

**Specific prohibitions for AI-generated code:**

- Add JSDoc to existing code unless requested (new code MUST include JSDoc)
- Replace existing patterns with "better" alternatives
- Consolidate similar code blocks
- Extract functions without request
- Add validation or error handling beyond scope (unless it fixes a security vulnerability)
- Generate boilerplate or scaffolding
- Add configuration options
- Create new files for "organization" (unless explicitly requested for a new module)
- Split or merge existing modules
- Change function signatures
- Modify JSDoc unnecessarily
- Add or remove blank lines for "style"
- Normalize or standardize code patterns
- Invent CLI arguments, config files, API endpoints, environment variables, theme structures, or localization keys

---

## AI Permissions

AI agents MAY:
- Fix obvious bugs within the modified block
- Improve variable naming inside the modified block
- Add missing logging if required by policy
- Add missing JSDoc in new functions

---

## Performance Rules

**CRITICAL:** This project runs on a VPS with **1 CPU core and 1GB RAM**. All code MUST be optimized for minimal resource usage.

### Memory Limits

| Component | Max Memory | Action |
|-----------|------------|--------|
| Node.js process | 512MB | Use `--max-old-space-size=512` |
| SQLite cache | 64MB | Limit page_cache |
| File uploads | 10MB max | Reject larger files |
| Concurrent connections | 100-200 | Rate limit |

### CPU Optimization

```javascript
// ALWAYS: Use streaming for large data
const stream = fs.createReadStream(largeFile);
stream.pipe(response);

// NEVER: Load entire file into memory
const data = fs.readFileSync(largeFile); // Bad - OOM risk

// ALWAYS: Use pagination for database queries
const messages = db.prepare('SELECT * FROM messages LIMIT ? OFFSET ?').all(limit, offset);

// NEVER: Load all records at once
const allMessages = db.prepare('SELECT * FROM messages').all(); // Bad - memory exhaustion
```

### SQLite Optimization for 1GB RAM

```javascript
// ALWAYS: Configure SQLite for low memory
db.pragma('cache_size = -16000'); // 16MB cache (negative = KB)
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 268435456'); // 256MB mmap
db.pragma('page_size = 4096');
db.pragma('wal_autocheckpoint = 1000');

// ALWAYS: Use prepared statements (reuse execution plans)
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);

// ALWAYS: Batch writes in transactions
const transaction = db.transaction((messages) => {
    for (const msg of messages) {
        db.prepare('INSERT INTO messages ...').run(msg);
    }
});
transaction(messages);

// ALWAYS: Add indexes for WHERE, JOIN, ORDER BY
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC)');

// ALWAYS: Select only needed columns
const users = db.prepare('SELECT id, username FROM users').all();

// ALWAYS: Use LIMIT for user-facing queries
const messages = db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 50').all();

// NEVER: Full table scans on large tables
// NEVER: SELECT * without LIMIT
// NEVER: Individual writes without transaction
```

### Connection Limits

```javascript
// ALWAYS: Limit concurrent connections
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});
```

### Socket.IO Optimization

```javascript
// ALWAYS: Use rooms for targeted broadcasts
io.to(userId).emit('notification', data); // Efficient

// ALWAYS: Limit reconnection attempts
socket.on('reconnect_attempt', (attempt) => {
    if (attempt > 5) socket.disconnect();
});

// NEVER: Broadcast to all when not needed
// NEVER: Allow unlimited messages per socket
```

### File Upload Limits

```javascript
// ALWAYS: Strict file size limits
const upload = multer({
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
        files: 1 // Single file per request
    }
});
```

### Query Optimization

```javascript
// ALWAYS: Use EXPLAIN QUERY PLAN for new queries
const plan = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM messages WHERE sender_id = ?').all(userId);

// ALWAYS: Select only needed columns
const users = db.prepare('SELECT id, username FROM users').all();

// NEVER: Full table scan without index
// NEVER: SELECT * when not needed
```

### Memory Monitoring

```javascript
// ALWAYS: Monitor memory usage
setInterval(() => {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    console.log(`Heap: ${heapUsedMB}MB`);
    if (heapUsedMB > 400) console.warn('WARNING: Memory usage high (>400MB)');
}, 60000); // Check every minute
```

### Garbage Collection

```bash
# ALWAYS: Start Node.js with memory limit
NODE_OPTIONS="--max-old-space-size=512" node server.js
```

### Caching Strategy

```javascript
// ALWAYS: Use LRU cache with size limit
const cache = new Map();
const MAX_CACHE_SIZE = 1000;

function set(key, value) {
    if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, value);
}

// NEVER: Unbounded cache (memory leak)
```

### Background Tasks

```javascript
// ALWAYS: Run heavy tasks with setImmediate or setTimeout
setImmediate(() => { sessionDB.cleanup(); });

// NEVER: Block main request loop with heavy operations
```

### Rules Summary

- **ALWAYS** configure SQLite for low memory
- **ALWAYS** use prepared statements and indexes
- **ALWAYS** paginate database queries (LIMIT/OFFSET)
- **ALWAYS** stream large files
- **ALWAYS** set memory limit: `--max-old-space-size=512`
- **ALWAYS** rate limit all endpoints
- **ALWAYS** use LRU cache with max size
- **NEVER** SELECT * without LIMIT
- **NEVER** load entire files into memory
- **NEVER** allow unlimited connections
- **NEVER** run heavy tasks in request handlers
- **NEVER** ignore memory monitoring

---

## Socket.IO Rules

- No business logic in socket handlers
- Use rooms for channel isolation
- No heavy operations in event handlers
- Use callbacks/acknowledgments for complex logic
- Offload long tasks to worker threads or queues
- Validate all incoming socket data
- Rate limit socket events

---

## Express.js Rules

- No business logic in route handlers
- Use middleware for cross-cutting concerns
- Validate all request inputs
- Use async/await consistently
- Handle errors with try/catch or error middleware
- Set appropriate HTTP headers
- Use parameterized queries for database

---

## Refactoring Constraints

- Max 1 module per task (unless explicitly requested)
- Preserve git blame
- Avoid renaming unless necessary

---

## When Uncertain

Ask before proceeding if unsure about:
- Architecture
- Naming
- Design decisions

Do not assume conventions. Never invent behavior.

---

## Development Workflow

```bash
# Build and run production
npm run serve

# Commit
git commit -m "feat: description in English ≤72 chars"
```

### Code Quality Checks

| Check | Tool |
|-------|------|
| Linting | eslint (if configured) |
| Formatting | prettier (if configured) |
| Security | npm audit |

### Linting and Type-Checking

AI agents MUST NOT run linting or type-checking tools directly unless explicitly configured in the project.

#### Forbidden

- Running `eslint` directly
- Running `prettier` directly
- Running any linter/formatter binary directly
- Installing dev tools automatically

These tools are executed ONLY if configured in package.json scripts or pre-commit hooks.

#### Allowed

- `npm run lint` (if script exists)
- `npm run format` (if script exists)

#### Rationale

Linting and formatting tools are managed by project configuration.
Direct execution bypasses project configuration and is forbidden.

Do not attempt to execute binaries manually.

---

## AI Agent Checklist

### Writing Code

- [ ] Functions ≤50 lines, ≤4 params
- [ ] Nesting ≤4 levels
- [ ] LF line endings, 2-space indent
- [ ] No excessive blank lines, no trailing whitespace
- [ ] JSDoc for new public functions
- [ ] Logging via dedicated logger
- [ ] Error handling (try/catch)
- [ ] No circular imports
- [ ] Database calls in dedicated functions
- [ ] No global state (except logger)
- [ ] No blocking calls in request handlers
- [ ] Input validation for user data
- [ ] Parameterized SQL queries

### Refactoring

- [ ] No code duplicates (only if directly related to current task)
- [ ] No unused imports
- [ ] No commented-out code
- [ ] No TODO without tickets
- [ ] Clear variable names

### Dependencies

- [ ] Prefer standard library / existing deps
- [ ] No heavy frameworks
- [ ] License MIT compatible
- [ ] Added to appropriate package.json
- [ ] `npm install` run

---

## Error Handling Policy

### When to Rethrow

| Condition | Action | Example |
|-----------|--------|---------|
| Cannot handle locally | Rethrow | Database errors in business logic |
| Need to add context | Wrap & rethrow | `throw new Error('Invalid user ID: ' + userId);` |
| Public API boundary | Rethrow | Let caller decide |
| Expected & recoverable | Handle silently | Cache miss → fetch from source |

```javascript
// Bad: Silent swallow
try {
    data = loadConfig();
} catch (e) {
    // ignored
}

// Good: Rethrow with context
try {
    data = loadConfig();
} catch (e) {
    throw new Error(`Config not found: ${path}`);
}
```

### When to Log and Continue

| Condition | Action | Example |
|-----------|--------|---------|
| Non-critical failure | Log, continue | Thumbnail download failed |
| Fallback available | Log, use fallback | Cache miss → database query |
| Best-effort operation | Log, skip | Optional metadata |
| User notification only | Log, notify UI | Network timeout |

```javascript
// Log and continue for non-critical
try {
    cover = await downloadCover(url);
} catch (e) {
    logger.warn('Cover download failed: %s', e.message);
    cover = getDefaultCover(); // Use placeholder
}
```

### When to Fail Fast

| Condition | Action | Example |
|-----------|--------|---------|
| Critical dependency | Throw immediately | Database connection lost |
| Data corruption | Throw immediately | Invalid config format |
| Security violation | Throw immediately | Path traversal attempt |
| Unrecoverable state | Throw immediately | Missing required file |

```javascript
// Fail fast for critical
if (!configPath) {
    throw new Error(`Required config missing: ${configPath}`);
}
```

### Error Handling Patterns

```javascript
// Pattern 1: Guard clauses for validation
function processMessage(messageId, content) {
    if (!messageId) {
        throw new ValidationError('Message ID required');
    }
    ...
}

// Pattern 2: Specific exception handling
try {
    response = await fetch(url);
} catch (e) {
    if (e.name === 'TimeoutError') {
        logger.warn('Request timeout for %s', url);
        return null;
    }
    logger.error('Request failed: %s', e.message);
    throw new APIError('Network unavailable');
}

// Pattern 3: Async error handling
async function runInHandler(socket, data) {
    try {
        const result = await longOperation(data);
        socket.emit('success', result);
    } catch (e) {
        logger.error('Operation failed: %s', e.message);
        socket.emit('error', { message: e.message });
    }
}
```

### Request Handler Rules

| Context | Strategy |
|---------|----------|
| Express route | Never block, use async/await |
| Socket handler | Catch, emit error event |
| Async operations | Return error in response |

```javascript
// Socket handler pattern
socket.on('message', async (data, ack) => {
    try {
        const result = await handleMessage(data);
        ack({ success: true, data: result });
    } catch (e) {
        logger.error('Message handling failed: %s', e.message);
        ack({ success: false, error: e.message });
    }
});
```

### Logging Guidelines

| Level | When to Use |
|-------|-------------|
| DEBUG | Detailed diagnostic info |
| INFO | Normal operation events |
| WARN | Recoverable issues |
| ERROR | Failures requiring attention |
| CRITICAL | System-wide failures |

```javascript
// Log with context
logger.error('Failed to load message %s: %s', messageId, e.message);

// Include stack trace for unexpected errors
try {
    ...
} catch (e) {
    logger.exception('Unexpected error processing %s', messageId);
}
```

### Forbidden Patterns

```javascript
// NEVER: Bare catch
try {
    ...
} catch {
    // ignored
}

// NEVER: Catch Error without logging
try {
    ...
} catch (e) {
    // silent
}

// NEVER: Silent failures in critical paths
if (!criticalFile) {
    return null; // Should throw
}

// NEVER: Multiple exceptions in one handler
try {
    ...
} catch (e) {
    // handles everything without distinction
}
```

---

## Code Style

### Imports
```javascript
// Standard library
import path from 'path';
import { fileURLToPath } from 'url';

// Third-party
import express from 'express';
import { Server } from 'socket.io';
import Database from 'better-sqlite3';

// Local
import { logger } from './logger.js';
import { config } from './config.js';
```

### JSDoc
```javascript
/**
 * Get game by ID.
 * @param {string} gameId - The game ID.
 * @param {Object} [cache] - Optional cache object.
 * @returns {Object|null} Game object or null.
 */
function getGame(gameId, cache = null) {
    ...
}

/**
 * @typedef {Object} Game
 * @property {string} name - Game name.
 * @property {number} playtime - Playtime in minutes.
 * @property {string|null} coverUrl - Cover image URL.
 */
```

### Comments
```javascript
// NEVER: Russian or verbose
// Проверить существование файла

// ALWAYS: Concise English
// Check if file exists
if (path.exists(filePath)) {
    ...
}

// ALWAYS: JSDoc for public functions
/**
 * Check if file exists at given path.
 * @param {string} filePath - Path to check.
 * @returns {boolean} True if exists.
 */
function checkFileExists(filePath) {
    ...
}
```

---

## Code Review Guidelines

### Security (CRITICAL)

- Hardcoded credentials
- SQL injection risks
- Missing input validation
- Insecure dependencies
- Path traversal risks
- Command injection

### Code Quality (HIGH)

- Functions >50 lines
- Files >800 lines
- Nesting >4 levels
- Missing error handling
- Circular imports
- Global state
- Blocking calls in request handlers

### Performance (MEDIUM)

- O(n²) when O(n log n) possible
- Missing caching
- N+1 queries

### Best Practices (MEDIUM)

- Emoji usage
- TODO without tickets
- Poor variable naming (x, tmp, data)
- Magic numbers
- Non-English comments

### Review Output

```
[CRITICAL] Hardcoded API key
File: server/steam_api.js:42
Issue: API key exposed in source code
Fix: Use environment variable

const API_KEY = "sk-abc123"; // Bad
const API_KEY = process.env.API_KEY; // Good
```

### Approval

- **Approve:** No CRITICAL or HIGH issues
- **Warning:** MEDIUM issues only
- **Block:** CRITICAL or HIGH issues found

---

## Database Guidelines

The project uses `better-sqlite3` for synchronous SQLite operations.

### Query Patterns

```javascript
// ALWAYS: Parameterized queries
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);

// NEVER: String interpolation
const user = db.prepare(`SELECT * FROM users WHERE id = ${userId}`).get(); // Bad
```

### Transactions

```javascript
// Use transactions for multiple related writes
const transaction = db.transaction((userId, message) => {
    db.prepare('INSERT INTO messages ...').run(message);
    db.prepare('UPDATE users SET ...').run(userId);
});
transaction(userId, message);
```

### Common Errors

```javascript
// Bad: Missing error handling
db.prepare('INSERT INTO ...').run(data);

// Good: With error handling
try {
    db.prepare('INSERT INTO ...').run(data);
} catch (e) {
    logger.error('Database insert failed: %s', e.message);
    throw new DatabaseError('Failed to save data');
}
```

### Database Migration Policy

**CRITICAL:** Database changes MUST NOT break existing data or require manual migration.

| Change Type | Required Action |
|-------------|-----------------|
| New table | Add `CREATE TABLE IF NOT EXISTS` |
| New column | Add `ALTER TABLE ... ADD COLUMN` with default |
| Modify column | Provide migration script |
| Remove column | Deprecate first, remove in next version |
| Rename column | Add new column, migrate data, deprecate old |

```javascript
// ALWAYS: Backward-compatible schema changes
db.exec(`
    ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL;
`);

// NEVER: Breaking changes without migration
db.exec(`DROP TABLE old_table`); // Bad - data loss

// ALWAYS: Migration script in server/migrations/
// File: 002_add_avatar_column.js
export function migrate(db) {
    db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL`);
}
```

### Migration Script Template

```javascript
// server/migrations/003_example_migration.js
import Database from 'better-sqlite3';

/**
 * @param {Database} db
 */
export function up(db) {
    // Add new schema
    db.exec(`ALTER TABLE messages ADD COLUMN edited_at TEXT DEFAULT NULL`);
}

/**
 * @param {Database} db
 */
export function down(db) {
    // Rollback (optional, for development)
    db.exec(`ALTER TABLE messages DROP COLUMN edited_at`);
}
```

### Database Versioning

```javascript
// Track schema version
db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
`);

// Check before applying migrations
const currentVersion = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
```

### Rules

- **NEVER** drop tables or columns without migration
- **NEVER** change column types without data migration
- **ALWAYS** provide `up()` and `down()` functions
- **ALWAYS** test migrations on copy of production data
- **ALWAYS** backup database before migration
- **PRESERVE** existing data unless explicitly requested

---

## Localization (i18n) Policy

**CRITICAL:** All user-facing strings MUST use translation keys via `window.i18n.t()`, NOT hardcoded text.

### Translation System Overview

The project uses a dictionary-based i18n system:

- **Dictionary:** `window.I18N` in `client/config.js`
- **API:** `window.i18n.t(key)`, `window.i18n.applyI18n(root)`
- **Supported languages:** `en` (English), `ru` (Russian)
- **Storage:** `localStorage` for user preference

### Rules

| Context | Required | Forbidden |
|---------|----------|-----------|
| UI text | `data-i18n` attribute | Hardcoded string |
| Placeholder | `data-i18n-placeholder` | Inline placeholder |
| Title/aria-label | `data-i18n-title` | Hardcoded title |
| Dynamic text | `window.i18n.t('key')` | Direct string |
| Logs | English | Translation key |
| API responses | English error codes | User-facing text |

### Adding New Translations

**Step 1:** Add key to `window.I18N` dictionary in `client/config.js`:

```javascript
window.I18N = {
  en: {
    "app.title": "Voxii",
    "chat.messageSent": "Message sent",
    "errors.networkError": "Network error. Check connection."
  },
  ru: {
    "app.title": "Voxii",
    "chat.messageSent": "Сообщение отправлено",
    "errors.networkError": "Ошибка сети. Проверьте подключение."
  }
};
```

**Step 2:** Use in HTML with data attributes:

```html
<!-- Static text -->
<span data-i18n="chat.messageSent">Message sent</span>

<!-- Placeholder -->
<input type="text" data-i18n-placeholder="chat.placeholder" />

<!-- Title and aria-label -->
<button data-i18n-title="actions.close" aria-label="Close">✕</button>
```

**Step 3:** Use in JavaScript for dynamic content:

```javascript
// ALWAYS: Use translation function
const message = window.i18n.t('chat.messageSent');
const error = window.i18n.t('errors.networkError');

// With fallback for optional i18n
const label = window.i18n ? window.i18n.t('actions.voiceMessage') : 'Voice Message';

// NEVER: Hardcoded strings
const message = 'Message sent'; // Bad
const error = 'Network error'; // Bad
```

### applyI18n for Dynamic Content

For dynamically created elements, use `applyI18n()`:

```javascript
// Create element with data-i18n attribute
const chatHeaderInfo = document.createElement('div');
chatHeaderInfo.innerHTML = `
    <span class="channel-name" data-i18n="chat.selfChat">Self Chat</span>
`;

// Apply translations
window.i18n.applyI18n(chatHeaderInfo);
```

### Key Naming Convention

```
category.specificName
```

| Category | Usage |
|----------|-------|
| `app.*` | Application-wide |
| `nav.*` | Navigation |
| `dm.*` | Direct messages |
| `chat.*` | Chat messages |
| `friends.*` | Friends list |
| `actions.*` | Buttons/actions |
| `errors.*` | Error messages |
| `time.*` | Time/date formats |
| `theme.*` | Theme settings |
| `status.*` | Status indicators |

### Examples

```javascript
// Good: Using translation key
alert(window.i18n.t('friends.requestSent'));

// Good: With fallback
const btnLabel = window.i18n ? window.i18n.t('actions.transcribe') : 'Transcribe';

// Good: Dynamic content
const editedIndicator = ' <span class="edited-indicator">' + 
    (window.i18n ? window.i18n.t('message.edited') : '(edited)') + '</span>';

// Bad: Hardcoded
alert('Friend request sent!'); // Bad
const btnLabel = 'Transcribe'; // Bad
```

### Rules Summary

- **ALWAYS** add new strings to `window.I18N` in `client/config.js`
- **ALWAYS** provide both `en` and `ru` translations
- **ALWAYS** use `data-i18n`, `data-i18n-placeholder`, `data-i18n-title` in HTML
- **ALWAYS** use `window.i18n.t('key')` in JavaScript
- **ALWAYS** call `window.i18n.applyI18n(element)` for dynamic content
- **NEVER** use hardcoded user-facing strings
- **NEVER** translate log messages (keep English)
- **PRESERVE** translation keys when refactoring
- **USE** fallback pattern for optional i18n: `window.i18n ? window.i18n.t('key') : 'Fallback'`

---

## REST API Guidelines

**CRITICAL:** The server MUST provide a comprehensive REST API suitable for native mobile/desktop clients.

### API Design Principles

| Principle | Required | Forbidden |
|-----------|----------|-----------|
| RESTful | Resource-based URLs | RPC-style endpoints |
| Statelessness | All context in request | Server-side session state |
| Consistency | Uniform response format | Mixed response formats |
| Versioning | `/api/v1/` prefix | Unversioned breaking changes |
| Documentation | JSDoc for endpoints | Undocumented APIs |

### Response Format

**ALL** API responses MUST follow this structure:

```javascript
// Success response (2xx)
{
    "success": true,
    "data": { ... },
    "meta": {
        "page": 1,
        "limit": 20,
        "total": 100
    }
}

// Error response (4xx, 5xx)
{
    "success": false,
    "error": {
        "code": "INVALID_CREDENTIALS",
        "message": "Invalid email or password",
        "details": { ... } // Optional
    }
}
```

### HTTP Status Codes

| Code | Usage | Example |
|------|-------|---------|
| 200 | Success | GET /api/users/:id |
| 201 | Created | POST /api/users |
| 204 | No Content | DELETE /api/users/:id |
| 400 | Bad Request | Missing required fields |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | User not found |
| 409 | Conflict | Email already exists |
| 422 | Validation Error | Invalid email format |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Database error |

### Authentication

All protected endpoints MUST require Bearer token:

```javascript
// Request header
Authorization: Bearer <session_token>

// Server middleware
async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required'
            }
        });
    }

    // Validate token...
}
```

### Pagination

ALL list endpoints MUST support pagination:

```javascript
// Request query params
GET /api/users?page=1&limit=20&sort=created_at&order=desc

// Response
{
    "success": true,
    "data": [...],
    "meta": {
        "page": 1,
        "limit": 20,
        "total": 150,
        "totalPages": 8,
        "hasNext": true,
        "hasPrev": false
    }
}
```

### Filtering and Search

```javascript
// Filter by field
GET /api/users?status=online&role=admin

// Search
GET /api/users/search?q=john

// Date range
GET /api/messages?from=2026-01-01&to=2026-03-05

// Combined
GET /api/users?status=online&sort=username&order=asc&page=1&limit=10
```

### API Endpoint Standards

#### Resource Naming

```javascript
// GOOD: Plural nouns, lowercase
/api/users
/api/messages
/api/friends
/api/notifications

// BAD: Singular, mixed case
/api/user
/api/getMessages
/API/Friends
```

#### Nested Resources

```javascript
// User's messages
GET /api/users/:userId/messages

// Message reactions
GET /api/messages/:messageId/reactions

// Friend requests
GET /api/users/:userId/friends/requests
```

### Request Validation

ALL endpoints MUST validate input:

```javascript
const Joi = require('joi');

const registerSchema = Joi.object({
    username: Joi.string().min(3).max(32).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).max(128).required()
});

app.post('/api/register', async (req, res) => {
    const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
    
    if (error) {
        return res.status(422).json({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: error.details.map(d => ({
                    field: d.path.join('.'),
                    message: d.message
                }))
            }
        });
    }
    
    // Process valid data...
});
```

### Error Codes

Standardized error codes for native clients:

```javascript
// server/errorCodes.js
module.exports = {
    // Authentication
    UNAUTHORIZED: 'UNAUTHORIZED',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_INVALID: 'TOKEN_INVALID',
    
    // Validation
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    REQUIRED_FIELD: 'REQUIRED_FIELD',
    INVALID_FORMAT: 'INVALID_FORMAT',
    
    // Users
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    USER_EXISTS: 'USER_EXISTS',
    EMAIL_EXISTS: 'EMAIL_EXISTS',
    USERNAME_EXISTS: 'USERNAME_EXISTS',
    
    // Messages
    MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
    MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
    CANNOT_SEND_SELF: 'CANNOT_SEND_SELF',
    
    // Friends
    FRIEND_REQUEST_EXISTS: 'FRIEND_REQUEST_EXISTS',
    NOT_FRIENDS: 'NOT_FRIENDS',
    ALREADY_FRIENDS: 'ALREADY_FRIENDS',
    
    // Files
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
    UPLOAD_FAILED: 'UPLOAD_FAILED',
    
    // Server
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    RATE_LIMITED: 'RATE_LIMITED'
};
```

### Rate Limiting

Protect endpoints from abuse:

```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests, please try again later'
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// Stricter limits for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // 5 attempts per 15 minutes
});

app.post('/api/login', authLimiter, async (req, res) => { ... });
```

### API Versioning

```javascript
// Version prefix for all routes
const router = express.Router();
app.use('/api/v1', router);

// Future breaking changes
app.use('/api/v2', v2Router);
```

### CORS for Native Apps

```javascript
app.use(cors({
    origin: '*', // Allow all for native apps
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // 24 hours
}));
```

### OpenAPI/Swagger Documentation

Generate API documentation:

```javascript
// Use swagger-jsdoc for auto-generated docs
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get list of users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 */
app.get('/api/users', authenticateToken, async (req, res) => { ... });
```

### Example Complete Endpoint

```javascript
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('./middleware/auth');
const { validateRequest } = require('./middleware/validate');
const ErrorCodes = require('./errorCodes');
const Joi = require('joi');

/**
 * @swagger
 * /api/messages:
 *   post:
 *     summary: Send a new message
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiverId
 *               - content
 *             properties:
 *               receiverId:
 *                 type: integer
 *               content:
 *                 type: string
 *                 maxLength: 2000
 *               replyToId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */

const sendMessageSchema = Joi.object({
    receiverId: Joi.number().integer().required(),
    content: Joi.string().min(1).max(2000).required(),
    replyToId: Joi.number().integer().optional()
});

router.post('/messages', 
    authenticateToken, 
    validateRequest(sendMessageSchema),
    async (req, res) => {
        try {
            const { receiverId, content, replyToId } = req.body;
            const senderId = req.user.id;

            // Check receiver exists
            const receiver = await userDB.findById(receiverId);
            if (!receiver) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: ErrorCodes.USER_NOT_FOUND,
                        message: 'Receiver not found'
                    }
                });
            }

            // Cannot send to self
            if (senderId === receiverId) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: ErrorCodes.CANNOT_SEND_SELF,
                        message: 'Cannot send message to yourself'
                    }
                });
            }

            // Create message
            const message = await dmDB.create({
                sender_id: senderId,
                receiver_id: receiverId,
                content,
                reply_to_id: replyToId
            });

            // Fetch full message with sender info
            const fullMessage = await dmDB.findById(message.id);

            res.status(201).json({
                success: true,
                data: fullMessage
            });

        } catch (error) {
            console.error('Send message error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: ErrorCodes.DATABASE_ERROR,
                    message: 'Failed to send message'
                }
            });
        }
    }
);

module.exports = router;
```

### WebSocket Events for Real-time

Native apps need real-time updates via Socket.IO:

```javascript
// Server emits
io.to(userId).emit('message:new', { message });
io.to(userId).emit('message:updated', { messageId, content });
io.to(userId).emit('message:deleted', { messageId });
io.to(userId).emit('user:status', { userId, status: 'online' });
io.to(userId).emit('notification:new', { notification });

// Client emits
socket.emit('message:send', { receiverId, content }, (response) => {
    // Acknowledgment callback
});
socket.emit('message:edit', { messageId, content });
socket.emit('message:delete', { messageId });
socket.emit('typing:start', { receiverId });
socket.emit('typing:stop', { receiverId });
```

### File Upload API

```javascript
// POST /api/upload
// Request: multipart/form-data
// Response:
{
    "success": true,
    "data": {
        "id": 123,
        "url": "/uploads/1234567890-file.jpg",
        "filename": "file.jpg",
        "size": 102400,
        "mimeType": "image/jpeg"
    }
}
```

### Native Client Integration Examples

#### Swift (iOS/macOS)

```swift
// API Client structure
final class VoxiiAPIClient {
    static let shared = VoxiiAPIClient()
    
    func login(baseURL: String, email: String, password: String) async throws -> AuthResponse {
        let payload = ["email": email, "password": password]
        return try await request(
            baseURL: baseURL,
            path: "/api/login",
            method: "POST",
            body: payload
        )
    }
    
    func fetchMessages(baseURL: String, token: String, userID: Int) async throws -> [DirectMessage] {
        try await request(
            baseURL: baseURL,
            path: "/api/dm/\(userID)",
            method: "GET",
            token: token
        )
    }
    
    func sendMessage(baseURL: String, token: String, to receiverID: Int, text: String) async throws -> DirectMessage {
        let payload = ["text": text, "timestamp": ISO8601DateFormatter().string(from: Date())]
        return try await request(
            baseURL: baseURL,
            path: "/api/dm/\(receiverID)",
            method: "POST",
            token: token,
            body: payload
        )
    }
}

// Models
struct AuthResponse: Codable {
    let token: String
    let user: APIUser
}

struct DirectMessage: Codable, Identifiable {
    let id: Int
    let content: String
    let senderID: Int
    let receiverID: Int
    let createdAt: String
    
    enum CodingKeys: String, CodingKey {
        case id, content
        case senderID = "sender_id"
        case receiverID = "receiver_id"
        case createdAt = "created_at"
    }
}

// Session management
@MainActor
final class SessionStore: ObservableObject {
    @Published private(set) var token: String?
    @Published private(set) var currentUser: APIUser?
    
    func login(email: String, password: String) async -> Bool {
        do {
            let response = try await VoxiiAPIClient.shared.login(
                baseURL: serverURL,
                email: email,
                password: password
            )
            saveSession(token: response.token, user: response.user)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}
```

#### Kotlin (Android)

```kotlin
// Retrofit API interface
interface VoxiiApiService {
    @POST("api/login")
    suspend fun login(@Body credentials: Credentials): AuthResponse
    
    @GET("api/dm/{userId}")
    suspend fun getMessages(
        @Path("userId") userId: Int,
        @Header("Authorization") token: String
    ): List<DirectMessage>
    
    @POST("api/dm/{userId}")
    suspend fun sendMessage(
        @Path("userId") userId: Int,
        @Header("Authorization") token: String,
        @Body message: SendMessageRequest
    ): DirectMessage
}

// Data classes
data class AuthResponse(
    val token: String,
    val user: User
)

data class DirectMessage(
    val id: Int,
    val content: String,
    @SerializedName("sender_id") val senderId: Int,
    @SerializedName("receiver_id") val receiverId: Int,
    @SerializedName("created_at") val createdAt: String
)

// Repository
class AuthRepository(private val api: VoxiiApiService) {
    suspend fun login(email: String, password: String): Result<AuthResponse> {
        return try {
            val response = api.login(Credentials(email, password))
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
```

### Rules Summary

- **ALWAYS** use standardized response format `{success, data, error}`
- **ALWAYS** use HTTP status codes correctly
- **ALWAYS** require authentication for protected endpoints
- **ALWAYS** validate input data
- **ALWAYS** use error codes from ErrorCodes dictionary
- **ALWAYS** support pagination for list endpoints
- **ALWAYS** use plural resource names
- **ALWAYS** document endpoints with JSDoc/OpenAPI
- **ALWAYS** use snake_case for response fields (native client compatibility)
- **NEVER** return raw database errors to clients
- **NEVER** expose internal implementation details
- **NEVER** break API compatibility without version bump
- **NEVER** use camelCase in JSON responses (use snake_case for native clients)

---

## Project Structure

```
voxii/
├── client/                 # Web client
│   ├── index.html         # Main HTML
│   ├── login.html         # Login page
│   ├── auth.js            # Auth logic
│   ├── script.js          # Main client logic
│   ├── styles.css         # Styles
│   ├── build.js           # Build script
│   └── package.json
├── server/                 # API server
│   ├── server.js          # Express + Socket.IO
│   ├── database.js        # SQLite database
│   ├── config.js          # Configuration
│   └── package.json
├── deploy.sh              # Deployment script
├── package.json           # Root workspace config
└── README.md
```

---

## Dependencies

### Server

| Package | Purpose | License |
|---------|---------|---------|
| express | Web framework | MIT |
| socket.io | Real-time communication | MIT |
| better-sqlite3 | SQLite database | MIT |
| bcrypt | Password hashing | MIT |
| multer | File uploads | MIT |
| cors | CORS middleware | MIT |
| dotenv | Environment variables | BSD-2 |
| jsdom | DOM parsing | MIT |

### Client

| Package | Purpose | License |
|---------|---------|---------|
| serve | Local development server | MIT |

**License compatibility:**
- MIT, BSD, Apache-2.0: Compatible
- GPL: Requires careful consideration
- Proprietary: Incompatible

---

## Resources

- [Express.js documentation](https://expressjs.com/)
- [Socket.IO documentation](https://socket.io/docs/)
- [better-sqlite3 documentation](https://github.com/JoshuaWise/better-sqlite3)
- [WebRTC documentation](https://webrtc.org/)
- [MDN Web Documentation](https://developer.mozilla.org/)

---

**Last updated:** 2026-03-05
**Version:** 1.0
**Status:** Active Development
