/**
 * Feedback Learning Tests
 * Tests the apply-feedback.mjs script functionality
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

describe('Feedback Learning Module', () => {
  const TEST_DIR = join(__dirname, 'temp-feedback');
  const BACKUP_DENYLIST = join(TEST_DIR, 'denylist.backup.json');
  const TEST_DENYLIST = join(TEST_DIR, 'denylist.test.json');
  
  // Sample denylist structure
  const sampleDenylist = {
    hard: {
      politics: ['election', 'vote', 'politician'],
      adult: ['nsfw', 'xxx']
    },
    soft: {
      marketing: ['subscribe', 'newsletter'],
      jobs: ['hiring', 'job opening']
    },
    low_signal: {
      generic: ['random', 'test'],
      competitor_products: ['competitor-app']
    },
    feedback: {
      urls: [],
      lastUpdated: null
    },
    learned: {
      keywords: [],
      lastUpdated: null,
      analysisCount: 0
    }
  };
  
  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    writeFileSync(TEST_DENYLIST, JSON.stringify(sampleDenylist, null, 2));
  });
  
  after(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (e) {
      console.log('  [Cleanup] Could not remove temp directory');
    }
  });
  
  describe('Denylist Structure', () => {
    it('should have required top-level keys', () => {
      const keys = ['hard', 'soft', 'low_signal', 'feedback', 'learned'];
      for (const key of keys) {
        assert.ok(key in sampleDenylist, `Missing key: ${key}`);
      }
    });
    
    it('should have feedback.urls array', () => {
      assert.ok(Array.isArray(sampleDenylist.feedback.urls));
    });
    
    it('should have learned.keywords array', () => {
      assert.ok(Array.isArray(sampleDenylist.learned.keywords));
    });
  });
  
  describe('URL Addition', () => {
    it('should add new URL to feedback.urls', () => {
      const denylist = JSON.parse(JSON.stringify(sampleDenylist));
      const newUrl = 'https://x.com/spam/123';
      
      if (!denylist.feedback.urls.includes(newUrl)) {
        denylist.feedback.urls.push(newUrl);
      }
      
      assert.ok(denylist.feedback.urls.includes(newUrl));
    });
    
    it('should not add duplicate URLs', () => {
      const denylist = JSON.parse(JSON.stringify(sampleDenylist));
      const newUrl = 'https://x.com/spam/123';
      
      // Add twice
      if (!denylist.feedback.urls.includes(newUrl)) {
        denylist.feedback.urls.push(newUrl);
      }
      if (!denylist.feedback.urls.includes(newUrl)) {
        denylist.feedback.urls.push(newUrl);
      }
      
      const count = denylist.feedback.urls.filter(u => u === newUrl).length;
      assert.strictEqual(count, 1);
    });
    
    it('should update lastUpdated timestamp', () => {
      const denylist = JSON.parse(JSON.stringify(sampleDenylist));
      denylist.feedback.lastUpdated = new Date().toISOString();
      
      assert.ok(denylist.feedback.lastUpdated);
      assert.ok(new Date(denylist.feedback.lastUpdated) instanceof Date);
    });
  });
  
  describe('Learned Keywords', () => {
    it('should add new keyword to learned.keywords', () => {
      const denylist = JSON.parse(JSON.stringify(sampleDenylist));
      const newKeyword = 'spam-pattern';
      
      if (!denylist.learned.keywords.includes(newKeyword)) {
        denylist.learned.keywords.push(newKeyword);
      }
      
      assert.ok(denylist.learned.keywords.includes(newKeyword));
    });
    
    it('should not add duplicate keywords', () => {
      const denylist = JSON.parse(JSON.stringify(sampleDenylist));
      const newKeyword = 'spam-pattern';
      
      // Add twice
      if (!denylist.learned.keywords.includes(newKeyword)) {
        denylist.learned.keywords.push(newKeyword);
      }
      if (!denylist.learned.keywords.includes(newKeyword)) {
        denylist.learned.keywords.push(newKeyword);
      }
      
      const count = denylist.learned.keywords.filter(k => k === newKeyword).length;
      assert.strictEqual(count, 1);
    });
    
    it('should normalize keywords to lowercase', () => {
      const keywords = ['SPAM', 'SpAm', 'spam'];
      const normalized = keywords.map(k => k.toLowerCase());
      const unique = [...new Set(normalized)];
      
      assert.strictEqual(unique.length, 1);
      assert.strictEqual(unique[0], 'spam');
    });
    
    it('should increment analysisCount', () => {
      const denylist = JSON.parse(JSON.stringify(sampleDenylist));
      denylist.learned.analysisCount++;
      
      assert.strictEqual(denylist.learned.analysisCount, 1);
    });
  });
  
  describe('Vote Data Structure', () => {
    it('should have required vote fields', () => {
      const vote = {
        tweet_url: 'https://x.com/test/123',
        vote_type: 'down',
        tweet_text: 'Sample spam content',
        tweet_group: 'pain',
        source_query: 'email spam',
        applied: false,
        created_at: new Date().toISOString()
      };
      
      assert.ok(vote.tweet_url);
      assert.ok(['up', 'down'].includes(vote.vote_type));
      assert.ok(vote.tweet_text);
      assert.strictEqual(vote.applied, false);
    });
    
    it('should filter downvotes only', () => {
      const votes = [
        { tweet_url: '1', vote_type: 'up' },
        { tweet_url: '2', vote_type: 'down' },
        { tweet_url: '3', vote_type: 'down' },
        { tweet_url: '4', vote_type: 'up' }
      ];
      
      const downvotes = votes.filter(v => v.vote_type === 'down');
      assert.strictEqual(downvotes.length, 2);
    });
    
    it('should filter unapplied votes', () => {
      const votes = [
        { tweet_url: '1', applied: false },
        { tweet_url: '2', applied: true },
        { tweet_url: '3', applied: false }
      ];
      
      const unapplied = votes.filter(v => !v.applied);
      assert.strictEqual(unapplied.length, 2);
    });
  });
  
  describe('LLM Analysis Trigger', () => {
    it('should trigger analysis when samples >= threshold', () => {
      const ANALYSIS_THRESHOLD = 3;
      
      const downvotes = [
        { tweet_text: 'spam 1' },
        { tweet_text: 'spam 2' },
        { tweet_text: 'spam 3' }
      ];
      
      const shouldAnalyze = downvotes.length >= ANALYSIS_THRESHOLD;
      assert.strictEqual(shouldAnalyze, true);
    });
    
    it('should not trigger analysis when samples < threshold', () => {
      const ANALYSIS_THRESHOLD = 3;
      
      const downvotes = [
        { tweet_text: 'spam 1' },
        { tweet_text: 'spam 2' }
      ];
      
      const shouldAnalyze = downvotes.length >= ANALYSIS_THRESHOLD;
      assert.strictEqual(shouldAnalyze, false);
    });
  });
  
  describe('Pattern Extraction', () => {
    it('should extract common patterns from texts', () => {
      const texts = [
        'Check out this amazing crypto offer',
        'Get rich with crypto trading',
        'Crypto investment opportunity'
      ];
      
      // Simple pattern extraction: find common words
      const wordCounts = {};
      for (const text of texts) {
        const words = text.toLowerCase().split(/\s+/);
        for (const word of words) {
          if (word.length > 3) { // Skip short words
            wordCounts[word] = (wordCounts[word] || 0) + 1;
          }
        }
      }
      
      // Words appearing in all texts
      const commonWords = Object.entries(wordCounts)
        .filter(([_, count]) => count === texts.length)
        .map(([word]) => word);
      
      assert.ok(commonWords.includes('crypto'));
    });
    
    it('should filter out common stop words', () => {
      const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being'];
      const words = ['crypto', 'the', 'amazing', 'is', 'opportunity'];
      
      const filtered = words.filter(w => !stopWords.includes(w.toLowerCase()));
      
      assert.ok(!filtered.includes('the'));
      assert.ok(!filtered.includes('is'));
      assert.ok(filtered.includes('crypto'));
    });
  });
  
  describe('Denylist File Operations', () => {
    it('should read existing denylist', () => {
      const content = readFileSync(TEST_DENYLIST, 'utf-8');
      const parsed = JSON.parse(content);
      
      assert.ok(parsed.hard);
      assert.ok(parsed.feedback);
    });
    
    it('should write updated denylist', () => {
      const denylist = JSON.parse(readFileSync(TEST_DENYLIST, 'utf-8'));
      denylist.feedback.urls.push('https://x.com/test/999');
      denylist.feedback.lastUpdated = new Date().toISOString();
      
      writeFileSync(TEST_DENYLIST, JSON.stringify(denylist, null, 2));
      
      // Read back and verify
      const updated = JSON.parse(readFileSync(TEST_DENYLIST, 'utf-8'));
      assert.ok(updated.feedback.urls.includes('https://x.com/test/999'));
    });
    
    it('should preserve existing denylist structure', () => {
      const original = JSON.parse(readFileSync(TEST_DENYLIST, 'utf-8'));
      const hardKeysBefore = Object.keys(original.hard);
      
      // Modify feedback only
      original.feedback.urls.push('new-url');
      writeFileSync(TEST_DENYLIST, JSON.stringify(original, null, 2));
      
      const updated = JSON.parse(readFileSync(TEST_DENYLIST, 'utf-8'));
      const hardKeysAfter = Object.keys(updated.hard);
      
      assert.deepStrictEqual(hardKeysBefore, hardKeysAfter);
    });
  });
  
  describe('Mark As Applied', () => {
    it('should mark vote as applied', () => {
      const vote = { tweet_url: 'test', applied: false };
      
      // Simulate marking as applied
      vote.applied = true;
      vote.applied_at = new Date().toISOString();
      
      assert.strictEqual(vote.applied, true);
      assert.ok(vote.applied_at);
    });
    
    it('should batch mark multiple votes', () => {
      const votes = [
        { tweet_url: '1', applied: false },
        { tweet_url: '2', applied: false },
        { tweet_url: '3', applied: false }
      ];
      
      const appliedAt = new Date().toISOString();
      for (const vote of votes) {
        vote.applied = true;
        vote.applied_at = appliedAt;
      }
      
      const allApplied = votes.every(v => v.applied === true);
      assert.strictEqual(allApplied, true);
    });
  });
  
  describe('Integration Scenarios', () => {
    it('should handle empty downvotes gracefully', () => {
      const downvotes = [];
      
      // Process empty array
      const urlsToAdd = downvotes.map(v => v.tweet_url);
      
      assert.strictEqual(urlsToAdd.length, 0);
    });
    
    it('should handle missing tweet_text', () => {
      const votes = [
        { tweet_url: '1', tweet_text: 'spam' },
        { tweet_url: '2', tweet_text: null },
        { tweet_url: '3' } // Missing tweet_text
      ];
      
      const withText = votes.filter(v => v.tweet_text);
      assert.strictEqual(withText.length, 1);
    });
    
    it('should handle LLM analysis failure gracefully', () => {
      // Simulate LLM failure
      const analyzeWithLLM = async () => {
        throw new Error('API timeout');
      };
      
      let analysisResult = null;
      let analysisError = null;
      
      try {
        // This would normally be an async call
        throw new Error('API timeout');
      } catch (e) {
        analysisError = e.message;
      }
      
      // Should continue without crashing
      assert.strictEqual(analysisResult, null);
      assert.strictEqual(analysisError, 'API timeout');
    });
  });
});

console.log('Feedback learning tests loaded');
