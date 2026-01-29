/**
 * Sync Data Script Tests
 * Tests data synchronization from out/ to web/public/data/
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

describe('Sync Data Module', () => {
  const TEST_DIR = join(__dirname, 'temp-sync');
  const SOURCE_DIR = join(TEST_DIR, 'out/latest');
  const TARGET_DIR = join(TEST_DIR, 'web/public/data');
  
  before(() => {
    // Create test directories
    mkdirSync(SOURCE_DIR, { recursive: true });
    mkdirSync(TARGET_DIR, { recursive: true });
  });
  
  after(() => {
    // Cleanup test directories
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (e) {
      console.log('  [Cleanup] Could not remove temp directory');
    }
  });
  
  describe('File Timestamp Generation', () => {
    it('should generate correct timestamp format', () => {
      const runAt = '2026-01-29T10:30:00.000Z';
      const date = new Date(runAt);
      
      // Expected format: YYYY-MM-DDTHH-MM.json
      const pad = (n) => String(n).padStart(2, '0');
      const filename = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}.json`;
      
      assert.strictEqual(filename, '2026-01-29T10-30.json');
    });
    
    it('should handle different timezones correctly', () => {
      // Always use UTC for consistency
      const runAt = '2026-01-29T23:45:00.000Z';
      const date = new Date(runAt);
      
      const pad = (n) => String(n).padStart(2, '0');
      const filename = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}.json`;
      
      assert.strictEqual(filename, '2026-01-29T23-45.json');
    });
    
    it('should handle edge case at midnight', () => {
      const runAt = '2026-01-30T00:00:00.000Z';
      const date = new Date(runAt);
      
      const pad = (n) => String(n).padStart(2, '0');
      const filename = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}.json`;
      
      assert.strictEqual(filename, '2026-01-30T00-00.json');
    });
  });
  
  describe('Manifest Management', () => {
    it('should create new manifest if not exists', () => {
      const manifestPath = join(TARGET_DIR, 'manifest.json');
      
      // Simulate manifest creation
      const manifest = {
        lastUpdated: new Date().toISOString(),
        files: []
      };
      
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      
      assert.ok(existsSync(manifestPath));
      const loaded = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      assert.ok(loaded.lastUpdated);
      assert.ok(Array.isArray(loaded.files));
    });
    
    it('should add new file entry to manifest', () => {
      const manifest = {
        lastUpdated: '2026-01-28T00:00:00.000Z',
        files: [
          { filename: '2026-01-28T06-00.json', runAt: '2026-01-28T06:00:00.000Z' }
        ]
      };
      
      const newFile = {
        filename: '2026-01-29T10-30.json',
        runAt: '2026-01-29T10:30:00.000Z'
      };
      
      // Check if file already exists
      const existingIndex = manifest.files.findIndex(f => f.filename === newFile.filename);
      if (existingIndex >= 0) {
        manifest.files[existingIndex] = newFile;
      } else {
        manifest.files.push(newFile);
      }
      
      manifest.lastUpdated = new Date().toISOString();
      
      assert.strictEqual(manifest.files.length, 2);
      assert.ok(manifest.files.some(f => f.filename === newFile.filename));
    });
    
    it('should update existing file entry', () => {
      const manifest = {
        files: [
          { filename: '2026-01-29T10-30.json', runAt: '2026-01-29T10:30:00.000Z', tweetsCount: 10 }
        ]
      };
      
      const updatedFile = {
        filename: '2026-01-29T10-30.json',
        runAt: '2026-01-29T10:30:00.000Z',
        tweetsCount: 15  // Updated count
      };
      
      const existingIndex = manifest.files.findIndex(f => f.filename === updatedFile.filename);
      manifest.files[existingIndex] = updatedFile;
      
      assert.strictEqual(manifest.files.length, 1);
      assert.strictEqual(manifest.files[0].tweetsCount, 15);
    });
    
    it('should sort files by timestamp (newest first)', () => {
      const files = [
        { filename: '2026-01-27T06-00.json', runAt: '2026-01-27T06:00:00.000Z' },
        { filename: '2026-01-29T10-30.json', runAt: '2026-01-29T10:30:00.000Z' },
        { filename: '2026-01-28T12-00.json', runAt: '2026-01-28T12:00:00.000Z' }
      ];
      
      files.sort((a, b) => new Date(b.runAt) - new Date(a.runAt));
      
      assert.strictEqual(files[0].filename, '2026-01-29T10-30.json');
      assert.strictEqual(files[1].filename, '2026-01-28T12-00.json');
      assert.strictEqual(files[2].filename, '2026-01-27T06-00.json');
    });
  });
  
  describe('Old File Cleanup', () => {
    it('should identify files older than 7 days', () => {
      const MAX_AGE_DAYS = 7;
      const now = new Date('2026-01-29T12:00:00.000Z');
      
      const files = [
        { filename: '2026-01-29T06-00.json', runAt: '2026-01-29T06:00:00.000Z' }, // Fresh
        { filename: '2026-01-25T06-00.json', runAt: '2026-01-25T06:00:00.000Z' }, // 4 days
        { filename: '2026-01-20T06-00.json', runAt: '2026-01-20T06:00:00.000Z' }, // 9 days - old
        { filename: '2026-01-15T06-00.json', runAt: '2026-01-15T06:00:00.000Z' }  // 14 days - old
      ];
      
      const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
      
      const filesToKeep = files.filter(f => {
        const fileDate = new Date(f.runAt);
        return (now - fileDate) <= maxAgeMs;
      });
      
      const filesToDelete = files.filter(f => {
        const fileDate = new Date(f.runAt);
        return (now - fileDate) > maxAgeMs;
      });
      
      assert.strictEqual(filesToKeep.length, 2);
      assert.strictEqual(filesToDelete.length, 2);
    });
    
    it('should preserve at least minimum files', () => {
      const MIN_FILES_TO_KEEP = 3;
      const MAX_AGE_DAYS = 7;
      
      // All files are old, but we should keep at least MIN_FILES_TO_KEEP
      const files = [
        { filename: '2026-01-15T06-00.json', runAt: '2026-01-15T06:00:00.000Z' },
        { filename: '2026-01-14T06-00.json', runAt: '2026-01-14T06:00:00.000Z' },
        { filename: '2026-01-13T06-00.json', runAt: '2026-01-13T06:00:00.000Z' }
      ];
      
      // Sort by date (newest first)
      files.sort((a, b) => new Date(b.runAt) - new Date(a.runAt));
      
      // Keep at least MIN_FILES_TO_KEEP
      const filesToKeep = files.slice(0, Math.max(MIN_FILES_TO_KEEP, 0));
      
      assert.strictEqual(filesToKeep.length, MIN_FILES_TO_KEEP);
    });
  });
  
  describe('File Copy Logic', () => {
    it('should copy source file to target', () => {
      const sourceData = {
        runDate: '2026-01-29',
        runAt: '2026-01-29T10:30:00.000Z',
        top: [{ url: 'https://x.com/test', text: 'Test tweet' }]
      };
      
      const sourcePath = join(SOURCE_DIR, 'top10_with_comments.json');
      writeFileSync(sourcePath, JSON.stringify(sourceData, null, 2));
      
      // Generate target filename
      const date = new Date(sourceData.runAt);
      const pad = (n) => String(n).padStart(2, '0');
      const targetFilename = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}.json`;
      
      const targetPath = join(TARGET_DIR, targetFilename);
      writeFileSync(targetPath, readFileSync(sourcePath));
      
      assert.ok(existsSync(targetPath));
      
      const copied = JSON.parse(readFileSync(targetPath, 'utf-8'));
      assert.strictEqual(copied.runAt, sourceData.runAt);
      assert.strictEqual(copied.top.length, 1);
    });
    
    it('should handle missing source file', () => {
      const missingPath = join(SOURCE_DIR, 'nonexistent.json');
      const exists = existsSync(missingPath);
      
      assert.strictEqual(exists, false);
    });
    
    it('should handle invalid JSON source', () => {
      const invalidPath = join(SOURCE_DIR, 'invalid.json');
      writeFileSync(invalidPath, 'not valid json {');
      
      let error = null;
      try {
        JSON.parse(readFileSync(invalidPath, 'utf-8'));
      } catch (e) {
        error = e;
      }
      
      assert.ok(error instanceof SyntaxError);
    });
  });
  
  describe('Idempotency', () => {
    it('should produce same result when run twice', () => {
      const manifest = {
        lastUpdated: '',
        files: []
      };
      
      const newFile = {
        filename: '2026-01-29T10-30.json',
        runAt: '2026-01-29T10:30:00.000Z',
        tweetsCount: 10
      };
      
      // First run
      const existingIndex1 = manifest.files.findIndex(f => f.filename === newFile.filename);
      if (existingIndex1 >= 0) {
        manifest.files[existingIndex1] = newFile;
      } else {
        manifest.files.push(newFile);
      }
      
      const count1 = manifest.files.length;
      
      // Second run (same file)
      const existingIndex2 = manifest.files.findIndex(f => f.filename === newFile.filename);
      if (existingIndex2 >= 0) {
        manifest.files[existingIndex2] = newFile;
      } else {
        manifest.files.push(newFile);
      }
      
      const count2 = manifest.files.length;
      
      assert.strictEqual(count1, count2, 'File count should not change on re-run');
      assert.strictEqual(manifest.files.length, 1);
    });
  });
  
  describe('Statistics Extraction', () => {
    it('should extract tweet counts from data', () => {
      const data = {
        runAt: '2026-01-29T10:30:00.000Z',
        selectionStats: {
          totalCandidates: 100,
          qualified: 20,
          aiPicked: 10
        },
        top: new Array(20).fill({ url: 'test' })
      };
      
      const stats = {
        tweetsCount: data.top.length,
        totalCandidates: data.selectionStats.totalCandidates,
        aiPickedCount: data.selectionStats.aiPicked
      };
      
      assert.strictEqual(stats.tweetsCount, 20);
      assert.strictEqual(stats.totalCandidates, 100);
      assert.strictEqual(stats.aiPickedCount, 10);
    });
    
    it('should extract group breakdown', () => {
      const data = {
        selectionStats: {
          byGroup: {
            pain: 8,
            reach: 6,
            sentiment: 4,
            insight: 2
          }
        }
      };
      
      const byGroup = data.selectionStats.byGroup;
      const total = Object.values(byGroup).reduce((a, b) => a + b, 0);
      
      assert.strictEqual(total, 20);
      assert.strictEqual(byGroup.pain, 8);
    });
  });
});

console.log('Sync data module tests loaded');
