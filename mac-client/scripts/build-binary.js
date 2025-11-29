import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Cleanup
if (fs.existsSync('bin_release')) fs.rmSync('bin_release', { recursive: true });
fs.mkdirSync('bin_release');

console.log('📦 Bundling with esbuild...');

const externals = ['node-pty', '@roamhq/wrtc'];

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/bundle.js',
  format: 'cjs',
  external: externals, 
});

console.log('🔨 Packaging with pkg...');

try {
    // Try node20 target
    execSync('npx pkg dist/bundle.js --target node20-macos-x64,node20-macos-arm64 --out-path bin_release', { stdio: 'inherit' });
} catch (e) {
    console.error('PKG failed - maybe node20 is not supported?');
    process.exit(1);
}

console.log('📂 Copying native bindings...');

// Find and copy node-pty binary
const ptyPath = 'node_modules/node-pty/build/Release/pty.node';
if (fs.existsSync(ptyPath)) {
    fs.copyFileSync(ptyPath, 'bin_release/pty.node');
} else {
    console.warn('⚠️ Could not find pty.node');
}

// Find and copy wrtc binary
const wrtcPath = 'node_modules/@roamhq/wrtc-darwin-arm64/wrtc.node'; // Adjusted path found earlier
if (fs.existsSync(wrtcPath)) {
    fs.copyFileSync(wrtcPath, 'bin_release/wrtc.node');
} else {
    // Fallback check
    if (fs.existsSync('node_modules/@roamhq/wrtc/build/Release/wrtc.node')) {
        fs.copyFileSync('node_modules/@roamhq/wrtc/build/Release/wrtc.node', 'bin_release/wrtc.node');
    } else {
        console.warn('⚠️ Could not find wrtc.node');
    }
}

console.log('✅ Done! Check bin_release/');
