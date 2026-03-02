const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const buildDir = path.join(rootDir, 'build');
const staticDir = path.join(rootDir, 'static');
const distDir = path.join(rootDir, 'dist');

// Clean previous build
if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true });
}
fs.mkdirSync(buildDir);

// Compile TypeScript
console.log('Compiling TypeScript...');
try {
    execSync('npx tsc', { cwd: rootDir, stdio: 'inherit' });
} catch {
    console.error('TypeScript compilation failed.');
    process.exit(1);
}

// Copy compiled JS from dist/ to build/
for (const file of fs.readdirSync(distDir)) {
    fs.copyFileSync(path.join(distDir, file), path.join(buildDir, file));
}
fs.rmSync(distDir, { recursive: true, force: true });

// Copy all static files to build/
for (const file of fs.readdirSync(staticDir)) {
    fs.copyFileSync(path.join(staticDir, file), path.join(buildDir, file));
}

console.log('Build complete. Load "build/" as unpacked extension.');
