const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');

// Clean dist
if (fs.existsSync(dist)) {
    fs.rmSync(dist, { recursive: true });
}
fs.mkdirSync(dist, { recursive: true });

// Files to copy
const files = [
    'index.html',
    'login.html',
    'styles.css',
    'auth.css',
    'script.js',
    'auth.js',
    'config.js',
    'reply-system.js',
    'notification-service.js'
];

// Copy files
files.forEach(file => {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(dist, file));
        console.log(`Copied: ${file}`);
    } else {
        console.warn(`Missing: ${file}`);
    }
});

// Helper: copy folder recursively
function copyDir(srcDir, destDir, label) {
    if (!fs.existsSync(srcDir)) return;

    fs.mkdirSync(destDir, { recursive: true });

    fs.readdirSync(srcDir, { withFileTypes: true }).forEach(entry => {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });

    console.log(`Copied: ${label || path.basename(srcDir) + '/'}`);
}

// Copy icons folder
copyDir(
    path.join(__dirname, 'icons'),
    path.join(dist, 'icons'),
    'icons/'
);

// Copy assets folder (Voxii logo lives here)
copyDir(
    path.join(__dirname, 'assets'),
    path.join(dist, 'assets'),
    'assets/'
);

// Generate news.json from CHANGELOG.md
function generateNewsJson() {
    const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
    const newsPath = path.join(dist, 'news.json');
    
    if (!fs.existsSync(changelogPath)) {
        console.warn('Missing: CHANGELOG.md');
        return;
    }
    
    const content = fs.readFileSync(changelogPath, 'utf-8');
    const lines = content.split('\n');
    
    const news = [];
    let currentVersion = null;
    let currentSection = null;
    let id = 1;
    
    const versionRegex = /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})/;
    const sectionRegex = /^### (.+)/;
    const changeRegex = /^- (.+)/;
    
    const iconMap = {
        'Добавлено': '✨',
        'Изменено': '🔄',
        'Удалено': '🗑️',
        'Исправлено': '🐛',
        'Added': '✨',
        'Changed': '🔄',
        'Removed': '🗑️',
        'Fixed': '🐛'
    };
    
    lines.forEach(line => {
        const versionMatch = line.match(versionRegex);
        if (versionMatch) {
            if (currentVersion) {
                news.push(currentVersion);
            }
            currentVersion = {
                id: id++,
                version: versionMatch[1],
                date: versionMatch[2],
                title: `Версия ${versionMatch[1]}`,
                icon: '📦',
                changes: []
            };
            currentSection = null;
            return;
        }
        
        if (currentVersion) {
            const sectionMatch = line.match(sectionRegex);
            if (sectionMatch) {
                currentSection = sectionMatch[1];
                return;
            }
            
            const changeMatch = line.match(changeRegex);
            if (changeMatch && currentSection) {
                let changeText = changeMatch[1].trim();
                // Пропускаем заголовки в изменениях
                if (!changeText.startsWith('**')) {
                    currentVersion.changes.push(changeText);
                }
            }
        }
    });
    
    // Добавляем последнюю версию
    if (currentVersion) {
        news.push(currentVersion);
    }
    
    // Устанавливаем иконки для первой версии каждой категории
    news.forEach(item => {
        if (item.changes.some(c => c.toLowerCase().includes('новост') || c.toLowerCase().includes('канал'))) {
            item.icon = '📢';
        } else if (item.changes.some(c => c.toLowerCase().includes('код') || c.toLowerCase().includes('подсветк'))) {
            item.icon = '✨';
        } else if (item.changes.some(c => c.toLowerCase().includes('голос') || c.toLowerCase().includes('аудио'))) {
            item.icon = '🎤';
        } else if (item.changes.some(c => c.toLowerCase().includes('звонк') || c.toLowerCase().includes('webrtc'))) {
            item.icon = '📞';
        } else if (item.changes.some(c => c.toLowerCase().includes('редакт') || c.toLowerCase().includes('перевод'))) {
            item.icon = '✏️';
        } else if (item.changes.some(c => c.toLowerCase().includes('тем') || c.toLowerCase().includes('стиль'))) {
            item.icon = '🎨';
        } else if (item.changes.some(c => c.toLowerCase().includes('файл') || c.toLowerCase().includes('загрузк'))) {
            item.icon = '📎';
        } else if (item.changes.some(c => c.toLowerCase().includes('ответ') || c.toLowerCase().includes('чат'))) {
            item.icon = '💬';
        } else if (item.changes.some(c => c.toLowerCase().includes('дизайн') || c.toLowerCase().includes('интерфейс'))) {
            item.icon = '🔄';
        } else if (item.version === '0.1.0') {
            item.icon = '🎉';
            item.title = 'Первый релиз';
        }
    });
    
    const newsData = {
        news: news,
        lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(newsPath, JSON.stringify(newsData, null, 2));
    console.log('Generated: news.json');
}

generateNewsJson();

console.log('Build complete!');
