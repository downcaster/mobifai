#!/usr/bin/env node

/**
 * Test script to verify fs.watch() functionality
 * 
 * Usage: node test-watcher.js <file-path>
 * 
 * This will watch the specified file and log any changes.
 * Make edits to the file to test if the watcher is triggered.
 */

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
  console.error('❌ Please provide a file path to watch');
  console.error('Usage: node test-watcher.js <file-path>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`);
  process.exit(1);
}

console.log(`👀 Watching file: ${filePath}`);
console.log(`   Make changes to the file to test the watcher...\n`);

let lastContent = fs.readFileSync(filePath, 'utf-8');
let debounceTimer = null;
let changeCount = 0;

const watcher = fs.watch(filePath, (eventType, filename) => {
  console.log(`📡 Event received: ${eventType} (filename: ${filename || 'N/A'})`);
  
  if (eventType === 'change') {
    // Debounce rapid changes
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      try {
        const newContent = fs.readFileSync(filePath, 'utf-8');
        
        if (newContent !== lastContent) {
          changeCount++;
          const timestamp = new Date().toLocaleTimeString();
          console.log(`\n✅ Change #${changeCount} detected at ${timestamp}`);
          console.log(`   Content length: ${lastContent.length} → ${newContent.length} bytes`);
          
          // Show a preview of the change
          const oldLines = lastContent.split('\n').length;
          const newLines = newContent.split('\n').length;
          console.log(`   Lines: ${oldLines} → ${newLines}`);
          
          lastContent = newContent;
        } else {
          console.log(`   ⚠️ Event fired but content unchanged`);
        }
      } catch (error) {
        console.error(`❌ Failed to read file:`, error.message);
      }
    }, 100); // 100ms debounce
  } else if (eventType === 'rename') {
    console.log('⚠️  File was renamed or deleted');
    watcher.close();
    process.exit(0);
  }
});

watcher.on('error', (error) => {
  console.error('❌ Watcher error:', error);
  process.exit(1);
});

console.log('Press Ctrl+C to stop watching\n');

process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping watcher...');
  watcher.close();
  console.log(`📊 Total changes detected: ${changeCount}`);
  process.exit(0);
});

