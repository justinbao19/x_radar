#!/usr/bin/env node
/**
 * Update manifest.json with new data files
 * Also handles cleanup of files older than retention period
 */

import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../web/public/data');
const MANIFEST_PATH = join(DATA_DIR, 'manifest.json');
const RETENTION_DAYS = 7;

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

function loadDataFile(filepath) {
  try {
    const content = readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

function getFileInfo(filename) {
  const filepath = join(DATA_DIR, filename);
  const data = loadDataFile(filepath);
  
  if (!data) return null;

  // Parse timestamp from filename (format: YYYY-MM-DDTHH-MM.json)
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})\.json$/);
  if (!match) return null;

  const [, date, hour, minute] = match;
  const timestamp = `${date}T${hour}:${minute}:00.000Z`;

  return {
    filename,
    timestamp,
    date,
    tweetCount: data.top?.length || 0,
    succeeded: data.commentGenerationStats?.succeeded || 0
  };
}

function cleanOldFiles(manifest) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  const cleaned = [];
  const remaining = [];

  for (const file of manifest.files) {
    const fileDate = new Date(file.timestamp);
    if (fileDate < cutoff) {
      const filepath = join(DATA_DIR, file.filename);
      try {
        if (existsSync(filepath)) {
          unlinkSync(filepath);
          cleaned.push(file.filename);
          log('INFO', 'Cleaned old file', { filename: file.filename });
        }
      } catch (e) {
        log('WARN', 'Failed to delete file', { filename: file.filename, error: e.message });
        remaining.push(file);
      }
    } else {
      remaining.push(file);
    }
  }

  return { cleaned, remaining };
}

function updateManifest() {
  log('INFO', 'Starting manifest update');

  // Load existing manifest
  const manifest = loadManifest();

  // Get all JSON files in data directory (excluding manifest.json)
  const allFiles = readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json') && f !== 'manifest.json');

  // Build file info for new files
  const existingFilenames = new Set(manifest.files.map(f => f.filename));
  const newFiles = [];

  for (const filename of allFiles) {
    if (!existingFilenames.has(filename)) {
      const info = getFileInfo(filename);
      if (info) {
        newFiles.push(info);
        log('INFO', 'Found new data file', { filename });
      }
    }
  }

  // Add new files to manifest
  manifest.files = [...manifest.files, ...newFiles];

  // Sort by timestamp (newest first)
  manifest.files.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // Clean old files
  const { cleaned, remaining } = cleanOldFiles(manifest);
  manifest.files = remaining;

  // Update lastUpdated
  manifest.lastUpdated = new Date().toISOString();

  // Write manifest
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  log('INFO', 'Manifest updated', {
    totalFiles: manifest.files.length,
    newFiles: newFiles.length,
    cleanedFiles: cleaned.length
  });

  return manifest;
}

// Run
try {
  updateManifest();
} catch (e) {
  log('ERROR', 'Manifest update failed', { error: e.message });
  process.exit(1);
}
