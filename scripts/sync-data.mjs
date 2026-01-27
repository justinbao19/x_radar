#!/usr/bin/env node
/**
 * Sync latest data from out/ to web/public/data/
 * Called by GitHub Actions after pipeline completes
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../out/latest');
const DATA_DIR = join(__dirname, '../web/public/data');
const MANIFEST_PATH = join(DATA_DIR, 'manifest.json');

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ timestamp, level, message, ...data }));
}

function loadManifest() {
  try {
    if (existsSync(MANIFEST_PATH)) {
      return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    }
  } catch (e) {
    log('WARN', 'Failed to load existing manifest', { error: e.message });
  }
  return { lastUpdated: null, files: [], authStatus: null };
}

function syncData() {
  log('INFO', 'Starting data sync');

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
    log('INFO', 'Created data directory');
  }

  // Check for source file
  const sourceFile = join(OUT_DIR, 'top10_with_comments.json');
  if (!existsSync(sourceFile)) {
    log('ERROR', 'Source file not found', { path: sourceFile });
    process.exit(1);
  }

  // Read source data to get runAt
  const sourceData = JSON.parse(readFileSync(sourceFile, 'utf-8'));
  const runAt = sourceData.runAt || new Date().toISOString();
  
  // Generate timestamp-based filename
  const date = runAt.split('T')[0];
  const time = runAt.split('T')[1].substring(0, 5).replace(':', '-');
  const filename = `${date}T${time}.json`;
  const destPath = join(DATA_DIR, filename);

  // Copy file
  copyFileSync(sourceFile, destPath);
  log('INFO', 'Copied data file', { filename });

  // Load and update manifest
  const manifest = loadManifest();

  // Check if file already exists in manifest
  const existingIndex = manifest.files.findIndex(f => f.filename === filename);
  
  const fileInfo = {
    filename,
    timestamp: runAt,
    date,
    tweetCount: sourceData.top?.length || 0,
    succeeded: sourceData.commentGenerationStats?.succeeded || 0
  };

  if (existingIndex >= 0) {
    manifest.files[existingIndex] = fileInfo;
  } else {
    manifest.files.unshift(fileInfo);
  }

  // Clean files older than 7 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  
  const filesToKeep = [];
  const filesToDelete = [];
  
  for (const f of manifest.files) {
    const fileDate = new Date(f.timestamp);
    if (fileDate >= cutoff) {
      filesToKeep.push(f);
    } else {
      filesToDelete.push(f);
    }
  }
  
  // Actually delete old files from disk
  for (const f of filesToDelete) {
    const filePath = join(DATA_DIR, f.filename);
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        log('INFO', 'Deleted old file', { filename: f.filename });
      }
    } catch (e) {
      log('WARN', 'Failed to delete old file', { filename: f.filename, error: e.message });
    }
  }
  
  manifest.files = filesToKeep;

  // Sort by timestamp (newest first)
  manifest.files.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Update auth status (will be updated by scraper if there's an issue)
  if (!manifest.authStatus || manifest.authStatus.valid) {
    manifest.authStatus = {
      valid: true,
      lastCheck: new Date().toISOString()
    };
  }

  manifest.lastUpdated = new Date().toISOString();

  // Write manifest
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  log('INFO', 'Updated manifest', { totalFiles: manifest.files.length });

  log('INFO', 'Data sync complete');
}

// Run
try {
  syncData();
} catch (e) {
  log('ERROR', 'Data sync failed', { error: e.message });
  process.exit(1);
}
