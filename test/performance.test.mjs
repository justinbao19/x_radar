/**
 * Performance Tests
 * Tests processing speed, memory usage, and scalability
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Performance thresholds (in milliseconds)
const THRESHOLDS = {
  selectProcessing: 10000,    // 10 seconds for 1000 tweets
  jsonParsing: 1000,          // 1 second for large JSON
  keywordMatching: 100,       // 100ms for keyword search
  scoringCalculation: 500,    // 500ms for 1000 score calculations
  deduplication: 200,         // 200ms for 1000 URLs
  filtering: 500              // 500ms for multi-stage filtering
};

describe('Performance Tests', () => {
  
  describe('JSON Processing', () => {
    it('should parse large JSON quickly', () => {
      // Generate large JSON
      const tweets = Array.from({ length: 1000 }, (_, i) => ({
        url: `https://x.com/user${i}/status/${i}`,
        author: `@user${i}`,
        text: `Sample tweet text about email inbox productivity ${i}`,
        likes: Math.floor(Math.random() * 1000),
        retweets: Math.floor(Math.random() * 500),
        replies: Math.floor(Math.random() * 200),
        datetime: new Date().toISOString()
      }));
      
      const json = JSON.stringify({ tweets });
      
      const start = performance.now();
      const parsed = JSON.parse(json);
      const duration = performance.now() - start;
      
      console.log(`    JSON parsing: ${duration.toFixed(2)}ms for ${tweets.length} tweets`);
      
      assert.ok(duration < THRESHOLDS.jsonParsing, 
        `JSON parsing took ${duration}ms, threshold is ${THRESHOLDS.jsonParsing}ms`);
      assert.strictEqual(parsed.tweets.length, 1000);
    });
    
    it('should stringify large objects quickly', () => {
      const data = {
        runDate: new Date().toISOString(),
        tweets: Array.from({ length: 500 }, (_, i) => ({
          url: `https://x.com/${i}`,
          text: 'A'.repeat(500),
          scores: { viral: 100, filoFit: 50 }
        }))
      };
      
      const start = performance.now();
      const json = JSON.stringify(data, null, 2);
      const duration = performance.now() - start;
      
      console.log(`    JSON stringify: ${duration.toFixed(2)}ms for ${data.tweets.length} tweets`);
      
      assert.ok(duration < THRESHOLDS.jsonParsing);
      assert.ok(json.length > 0);
    });
  });
  
  describe('Scoring Calculations', () => {
    it('should calculate scores for 1000 tweets quickly', () => {
      const tweets = Array.from({ length: 1000 }, (_, i) => ({
        likes: Math.floor(Math.random() * 10000),
        retweets: Math.floor(Math.random() * 5000),
        replies: Math.floor(Math.random() * 2000),
        text: `email inbox spam newsletter notification productivity ai agent ${i}`
      }));
      
      const calculateScore = (tweet) => {
        const rawEngagement = tweet.likes * 2 + tweet.retweets * 2 + tweet.replies * 1.5;
        const viralityScore = Math.log10(1 + rawEngagement) * 100;
        const keywords = ['email', 'inbox', 'spam', 'newsletter', 'notification', 'productivity', 'ai', 'agent'];
        const keywordCount = keywords.filter(k => tweet.text.toLowerCase().includes(k)).length;
        const filoFitScore = keywordCount * 5;
        return viralityScore + filoFitScore;
      };
      
      const start = performance.now();
      const scores = tweets.map(calculateScore);
      const duration = performance.now() - start;
      
      console.log(`    Scoring: ${duration.toFixed(2)}ms for ${tweets.length} tweets`);
      
      assert.ok(duration < THRESHOLDS.scoringCalculation,
        `Scoring took ${duration}ms, threshold is ${THRESHOLDS.scoringCalculation}ms`);
      assert.strictEqual(scores.length, 1000);
    });
    
    it('should apply multiple filters efficiently', () => {
      const tweets = Array.from({ length: 1000 }, (_, i) => ({
        url: `https://x.com/${i}`,
        text: `email inbox spam ${i % 10 === 0 ? 'politics' : 'productivity'}`,
        score: Math.random() * 200,
        datetime: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
      }));
      
      const start = performance.now();
      
      // Multiple filter stages
      let filtered = tweets;
      
      // Stage 1: Freshness
      const maxAge = 3 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter(t => Date.now() - new Date(t.datetime) <= maxAge);
      
      // Stage 2: Hard denylist
      filtered = filtered.filter(t => !t.text.includes('politics'));
      
      // Stage 3: Score threshold
      filtered = filtered.filter(t => t.score >= 50);
      
      const duration = performance.now() - start;
      
      console.log(`    Multi-stage filtering: ${duration.toFixed(2)}ms (${tweets.length} -> ${filtered.length})`);
      
      assert.ok(duration < THRESHOLDS.filtering,
        `Filtering took ${duration}ms, threshold is ${THRESHOLDS.filtering}ms`);
    });
  });
  
  describe('Deduplication', () => {
    it('should deduplicate 1000 URLs efficiently using Set', () => {
      // Create 1000 URLs with ~20% duplicates
      const urls = Array.from({ length: 1000 }, (_, i) => 
        `https://x.com/user${i % 800}/status/${i % 800}`
      );
      
      const start = performance.now();
      
      const seen = new Set();
      const unique = urls.filter(url => {
        if (seen.has(url)) return false;
        seen.add(url);
        return true;
      });
      
      const duration = performance.now() - start;
      
      console.log(`    Deduplication: ${duration.toFixed(2)}ms (${urls.length} -> ${unique.length})`);
      
      assert.ok(duration < THRESHOLDS.deduplication,
        `Deduplication took ${duration}ms, threshold is ${THRESHOLDS.deduplication}ms`);
      assert.ok(unique.length < urls.length); // Should have removed duplicates
    });
    
    it('should handle Map-based deduplication efficiently', () => {
      const tweets = Array.from({ length: 1000 }, (_, i) => ({
        url: `https://x.com/user${i % 800}/status/${i % 800}`,
        text: `Tweet ${i}`,
        fetchedAt: new Date(Date.now() - Math.random() * 86400000).toISOString()
      }));
      
      const start = performance.now();
      
      const tweetMap = new Map();
      for (const tweet of tweets) {
        const existing = tweetMap.get(tweet.url);
        if (!existing || existing.fetchedAt > tweet.fetchedAt) {
          tweetMap.set(tweet.url, tweet);
        }
      }
      
      const unique = Array.from(tweetMap.values());
      const duration = performance.now() - start;
      
      console.log(`    Map deduplication: ${duration.toFixed(2)}ms (${tweets.length} -> ${unique.length})`);
      
      assert.ok(duration < THRESHOLDS.deduplication * 2);
    });
  });
  
  describe('Keyword Matching', () => {
    it('should match keywords efficiently', () => {
      const keywords = [
        'email', 'inbox', 'gmail', 'newsletter', 'spam', 'notification',
        'productivity', 'workflow', 'ai', 'agent', 'automation', 'triage',
        'organize', 'search', 'summary', 'overload', 'unsubscribe'
      ];
      
      const texts = Array.from({ length: 1000 }, (_, i) =>
        `My email inbox is overwhelming with spam and newsletters. Need AI agent for productivity workflow automation ${i}`
      );
      
      const start = performance.now();
      
      const results = texts.map(text => {
        const lower = text.toLowerCase();
        return keywords.filter(k => lower.includes(k.toLowerCase())).length;
      });
      
      const duration = performance.now() - start;
      
      console.log(`    Keyword matching: ${duration.toFixed(2)}ms for ${texts.length} texts`);
      
      assert.ok(duration < THRESHOLDS.keywordMatching * 10,
        `Keyword matching took ${duration}ms`);
      assert.ok(results.every(count => count > 0));
    });
    
    it('should handle regex patterns efficiently', () => {
      const patterns = [
        /\b(email|mail|inbox)\b/i,
        /\b(spam|junk|unwanted)\b/i,
        /\b(ai|agent|automation)\b/i,
        /\b(productivity|workflow|efficiency)\b/i
      ];
      
      const texts = Array.from({ length: 500 }, (_, i) =>
        `Testing email inbox with AI agent for productivity ${i}`
      );
      
      const start = performance.now();
      
      const results = texts.map(text => 
        patterns.filter(p => p.test(text)).length
      );
      
      const duration = performance.now() - start;
      
      console.log(`    Regex matching: ${duration.toFixed(2)}ms for ${texts.length} texts`);
      
      assert.ok(duration < THRESHOLDS.keywordMatching * 5);
    });
  });
  
  describe('Sorting', () => {
    it('should sort 1000 items efficiently', () => {
      const items = Array.from({ length: 1000 }, (_, i) => ({
        score: Math.random() * 500,
        datetime: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString()
      }));
      
      const start = performance.now();
      
      // Sort by score descending
      items.sort((a, b) => b.score - a.score);
      
      const duration = performance.now() - start;
      
      console.log(`    Sorting by score: ${duration.toFixed(2)}ms for ${items.length} items`);
      
      assert.ok(duration < 50, `Sorting took ${duration}ms`);
      assert.ok(items[0].score >= items[items.length - 1].score);
    });
    
    it('should sort by date efficiently', () => {
      const items = Array.from({ length: 1000 }, (_, i) => ({
        datetime: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString()
      }));
      
      const start = performance.now();
      
      items.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
      
      const duration = performance.now() - start;
      
      console.log(`    Sorting by date: ${duration.toFixed(2)}ms for ${items.length} items`);
      
      assert.ok(duration < 100);
    });
  });
  
  describe('Memory Usage', () => {
    it('should handle large datasets without excessive memory', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create large dataset
      const tweets = Array.from({ length: 5000 }, (_, i) => ({
        url: `https://x.com/user${i}/status/${i}`,
        author: `@user${i}`,
        text: 'A'.repeat(500), // ~500 bytes per tweet
        likes: Math.floor(Math.random() * 10000),
        scores: { viral: 100, filoFit: 50, final: 150 }
      }));
      
      const afterCreation = process.memoryUsage().heapUsed;
      const memoryUsed = (afterCreation - initialMemory) / 1024 / 1024;
      
      console.log(`    Memory for 5000 tweets: ${memoryUsed.toFixed(2)}MB`);
      
      // Should use less than 100MB for 5000 tweets
      assert.ok(memoryUsed < 100, `Memory usage ${memoryUsed.toFixed(2)}MB exceeds threshold`);
      
      // Cleanup
      tweets.length = 0;
    });
  });
  
  describe('Concurrent Operations', () => {
    it('should handle parallel array operations', async () => {
      const arrays = Array.from({ length: 10 }, () => 
        Array.from({ length: 100 }, (_, i) => ({ score: Math.random() * 100 }))
      );
      
      const start = performance.now();
      
      // Process arrays in parallel
      const results = await Promise.all(
        arrays.map(async (arr) => {
          return arr
            .filter(item => item.score > 30)
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
        })
      );
      
      const duration = performance.now() - start;
      
      console.log(`    Parallel processing: ${duration.toFixed(2)}ms for ${arrays.length} arrays`);
      
      assert.ok(duration < 50);
      assert.strictEqual(results.length, 10);
    });
  });
  
  describe('File Size Estimation', () => {
    it('should estimate output file sizes', () => {
      // Estimate JSON size for typical output
      const tweet = {
        rank: 1,
        url: 'https://x.com/user/status/1234567890123456789',
        author: '@username',
        text: 'A'.repeat(280), // Max tweet length
        likes: 10000,
        retweets: 5000,
        replies: 2000,
        finalScore: 250,
        comments: {
          status: 'generated',
          replies: {
            A: { text: 'A'.repeat(280), explanation: 'A'.repeat(100) },
            B: { text: 'A'.repeat(280), explanation: 'A'.repeat(100) },
            C: { text: 'A'.repeat(280), explanation: 'A'.repeat(100) }
          }
        }
      };
      
      const singleTweetSize = JSON.stringify(tweet).length;
      const estimatedFor100 = singleTweetSize * 100;
      
      console.log(`    Single tweet JSON size: ${(singleTweetSize / 1024).toFixed(2)}KB`);
      console.log(`    Estimated for 100 tweets: ${(estimatedFor100 / 1024).toFixed(2)}KB`);
      
      // Should be reasonable for web delivery
      assert.ok(estimatedFor100 < 500 * 1024, 'File size should be under 500KB for 100 tweets');
    });
  });
});

console.log('Performance tests loaded');
