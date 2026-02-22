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
    'reply-system.js'
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

// ✅ Copy assets folder (Voxii logo lives here)
copyDir(
    path.join(__dirname, 'assets'),
    path.join(dist, 'assets'),
    'assets/'
);

console.log('Build complete!');
