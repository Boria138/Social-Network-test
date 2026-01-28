const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, 'dist');

// Clean dist
if (fs.existsSync(dist)) {
    fs.rmSync(dist, { recursive: true });
}
fs.mkdirSync(dist);

// Files to copy
const files = [
    'index.html',
    'login.html',
    'styles.css',
    'auth.css',
    'script.js',
    'auth.js',
    'config.js',
    'manifest.json',
    'sw.js'
];

// Copy files
files.forEach(file => {
    const src = path.join(__dirname, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(dist, file));
        console.log(`Copied: ${file}`);
    }
});

// Copy icons folder
const iconsDir = path.join(__dirname, 'icons');
if (fs.existsSync(iconsDir)) {
    const distIcons = path.join(dist, 'icons');
    fs.mkdirSync(distIcons, { recursive: true });
    fs.readdirSync(iconsDir).forEach(file => {
        fs.copyFileSync(path.join(iconsDir, file), path.join(distIcons, file));
    });
    console.log('Copied: icons/');
}

console.log('Build complete!');
