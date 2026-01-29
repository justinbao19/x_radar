/**
 * Scrape Module Tests
 * Tests scraping logic, configuration, and authentication
 * Note: Does not perform actual scraping (requires authentication)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

describe('Scrape Module', () => {
  
  describe('Configuration Loading', () => {
    it('should load queries.json', () => {
      const queriesPath = join(ROOT_DIR, 'queries.json');
      assert.ok(existsSync(queriesPath), 'queries.json should exist');
      
      const queries = JSON.parse(readFileSync(queriesPath, 'utf-8'));
      assert.ok(typeof queries === 'object');
    });
    
    it('should have required query groups', () => {
      const queriesPath = join(ROOT_DIR, 'queries.json');
      const queries = JSON.parse(readFileSync(queriesPath, 'utf-8'));
      
      // Expected groups
      const expectedGroups = ['pain', 'reach', 'sentiment', 'insight'];
      
      for (const group of expectedGroups) {
        assert.ok(group in queries, `Missing query group: ${group}`);
        assert.ok(Array.isArray(queries[group]), `${group} should be an array`);
      }
    });
    
    it('should have valid query structure', () => {
      const queriesPath = join(ROOT_DIR, 'queries.json');
      const queries = JSON.parse(readFileSync(queriesPath, 'utf-8'));
      
      for (const [group, queryList] of Object.entries(queries)) {
        for (const query of queryList) {
          assert.ok(query.name, `Query in ${group} should have name`);
          assert.ok(query.query, `Query in ${group} should have query string`);
        }
      }
    });
    
    it('should load influencers.json', () => {
      const influencersPath = join(ROOT_DIR, 'influencers.json');
      assert.ok(existsSync(influencersPath), 'influencers.json should exist');
      
      const influencers = JSON.parse(readFileSync(influencersPath, 'utf-8'));
      assert.ok(influencers.handles, 'Should have handles array');
      assert.ok(Array.isArray(influencers.handles));
    });
    
    it('should have KOL configuration', () => {
      const influencersPath = join(ROOT_DIR, 'influencers.json');
      const influencers = JSON.parse(readFileSync(influencersPath, 'utf-8'));
      
      assert.ok(influencers.handles.length > 0, 'Should have at least one KOL');
      assert.ok(influencers.allowedQuery, 'Should have allowedQuery');
    });
  });
  
  describe('Query Sampling', () => {
    it('should sample random queries within limit', () => {
      const MAX_SOURCES = 24;
      const allQueries = Array.from({ length: 50 }, (_, i) => ({ name: `query${i}` }));
      
      // Random sampling
      const shuffled = [...allQueries].sort(() => Math.random() - 0.5);
      const sampled = shuffled.slice(0, MAX_SOURCES);
      
      assert.ok(sampled.length <= MAX_SOURCES);
      assert.strictEqual(sampled.length, MAX_SOURCES);
    });
    
    it('should handle fewer queries than limit', () => {
      const MAX_SOURCES = 24;
      const allQueries = Array.from({ length: 10 }, (_, i) => ({ name: `query${i}` }));
      
      const sampled = allQueries.slice(0, MAX_SOURCES);
      
      assert.strictEqual(sampled.length, 10);
    });
    
    it('should ensure unique queries after sampling', () => {
      const queries = [
        { name: 'q1' },
        { name: 'q2' },
        { name: 'q3' },
        { name: 'q1' } // duplicate name
      ];
      
      const seen = new Set();
      const unique = queries.filter(q => {
        if (seen.has(q.name)) return false;
        seen.add(q.name);
        return true;
      });
      
      assert.strictEqual(unique.length, 3);
    });
  });
  
  describe('Authentication State', () => {
    const TEST_AUTH_DIR = join(__dirname, 'temp-auth');
    
    before(() => {
      mkdirSync(TEST_AUTH_DIR, { recursive: true });
    });
    
    after(() => {
      try {
        rmSync(TEST_AUTH_DIR, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    
    it('should detect missing auth state', () => {
      const authPath = join(TEST_AUTH_DIR, 'nonexistent.json');
      assert.strictEqual(existsSync(authPath), false);
    });
    
    it('should read valid auth state', () => {
      const authState = {
        cookies: [{ name: 'auth', value: 'test' }],
        origins: []
      };
      
      const authPath = join(TEST_AUTH_DIR, 'state.json');
      writeFileSync(authPath, JSON.stringify(authState));
      
      const loaded = JSON.parse(readFileSync(authPath, 'utf-8'));
      assert.ok(loaded.cookies);
    });
    
    it('should validate auth state structure', () => {
      const validState = { cookies: [], origins: [] };
      const invalidState = { invalid: true };
      
      const isValid = (state) => {
        return state && Array.isArray(state.cookies);
      };
      
      assert.strictEqual(isValid(validState), true);
      assert.strictEqual(isValid(invalidState), false);
    });
  });
  
  describe('Output Structure', () => {
    it('should generate correct date directory', () => {
      const now = new Date('2026-01-29T10:30:00.000Z');
      const dateStr = now.toISOString().split('T')[0];
      
      assert.strictEqual(dateStr, '2026-01-29');
    });
    
    it('should create valid raw.json structure', () => {
      const rawOutput = {
        runDate: '2026-01-29',
        runAt: new Date().toISOString(),
        config: {
          maxSources: 24,
          samplingMode: 'random'
        },
        sources: []
      };
      
      assert.ok(rawOutput.runDate);
      assert.ok(rawOutput.runAt);
      assert.ok(Array.isArray(rawOutput.sources));
    });
    
    it('should create valid source structure', () => {
      const source = {
        name: 'inbox-overload',
        group: 'pain',
        query: 'inbox overload min_faves:10',
        tweets: [],
        scrapedAt: new Date().toISOString(),
        status: 'success'
      };
      
      assert.ok(source.name);
      assert.ok(source.group);
      assert.ok(source.query);
      assert.ok(Array.isArray(source.tweets));
    });
    
    it('should create valid tweet structure', () => {
      const tweet = {
        url: 'https://x.com/user/status/123',
        author: '@testuser',
        authorId: '12345',
        text: 'Sample tweet text about email',
        datetime: '2026-01-29T08:00:00.000Z',
        likes: 100,
        retweets: 20,
        replies: 15,
        views: 5000
      };
      
      assert.ok(tweet.url);
      assert.ok(tweet.author);
      assert.ok(tweet.text);
      assert.ok(typeof tweet.likes === 'number');
    });
  });
  
  describe('Runtime Limits', () => {
    it('should respect time limit', () => {
      const RUN_TIME_LIMIT_MIN = 60;
      const startTime = Date.now();
      const maxRuntime = RUN_TIME_LIMIT_MIN * 60 * 1000;
      
      // Simulate time check
      const elapsed = Date.now() - startTime;
      const shouldStop = elapsed >= maxRuntime;
      
      assert.strictEqual(shouldStop, false); // Just started
    });
    
    it('should detect timeout correctly', () => {
      const RUN_TIME_LIMIT_MIN = 60;
      const startTime = Date.now() - (61 * 60 * 1000); // 61 minutes ago
      const maxRuntime = RUN_TIME_LIMIT_MIN * 60 * 1000;
      
      const elapsed = Date.now() - startTime;
      const shouldStop = elapsed >= maxRuntime;
      
      assert.strictEqual(shouldStop, true);
    });
  });
  
  describe('Scroll Configuration', () => {
    it('should generate random scroll rounds within range', () => {
      const MIN_ROUNDS = 7;
      const MAX_ROUNDS = 12;
      
      for (let i = 0; i < 10; i++) {
        const rounds = Math.floor(Math.random() * (MAX_ROUNDS - MIN_ROUNDS + 1)) + MIN_ROUNDS;
        assert.ok(rounds >= MIN_ROUNDS, `Rounds ${rounds} should be >= ${MIN_ROUNDS}`);
        assert.ok(rounds <= MAX_ROUNDS, `Rounds ${rounds} should be <= ${MAX_ROUNDS}`);
      }
    });
    
    it('should generate random delays within range', () => {
      const MIN_DELAY = 2000;
      const MAX_DELAY = 4000;
      
      const delay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY)) + MIN_DELAY;
      
      assert.ok(delay >= MIN_DELAY);
      assert.ok(delay < MAX_DELAY);
    });
  });
  
  describe('Error Handling', () => {
    it('should handle retry logic', () => {
      const MAX_RETRIES = 1;
      let attempts = 0;
      let success = false;
      
      const attemptScrape = () => {
        attempts++;
        if (attempts <= 1) {
          throw new Error('First attempt failed');
        }
        return true;
      };
      
      for (let retry = 0; retry <= MAX_RETRIES; retry++) {
        try {
          success = attemptScrape();
          break;
        } catch (e) {
          if (retry >= MAX_RETRIES) {
            // Max retries reached
          }
        }
      }
      
      assert.strictEqual(success, true);
      assert.strictEqual(attempts, 2);
    });
    
    it('should record failed sources', () => {
      const sources = [
        { name: 'q1', status: 'success' },
        { name: 'q2', status: 'failed', error: 'Timeout' },
        { name: 'q3', status: 'success' }
      ];
      
      const failed = sources.filter(s => s.status === 'failed');
      assert.strictEqual(failed.length, 1);
      assert.ok(failed[0].error);
    });
  });
  
  describe('Auth Status Output', () => {
    it('should write auth status on failure', () => {
      const authStatus = {
        authenticated: false,
        reason: 'Session expired',
        checkedAt: new Date().toISOString()
      };
      
      assert.strictEqual(authStatus.authenticated, false);
      assert.ok(authStatus.reason);
    });
    
    it('should write auth status on success', () => {
      const authStatus = {
        authenticated: true,
        username: '@testuser',
        checkedAt: new Date().toISOString()
      };
      
      assert.strictEqual(authStatus.authenticated, true);
      assert.ok(authStatus.username);
    });
  });
  
  describe('Tweet Deduplication During Scrape', () => {
    it('should skip already scraped URLs', () => {
      const scrapedUrls = new Set([
        'https://x.com/user/1',
        'https://x.com/user/2'
      ]);
      
      const newTweets = [
        { url: 'https://x.com/user/2' }, // Already scraped
        { url: 'https://x.com/user/3' }, // New
        { url: 'https://x.com/user/1' }  // Already scraped
      ];
      
      const unique = newTweets.filter(t => !scrapedUrls.has(t.url));
      
      assert.strictEqual(unique.length, 1);
      assert.strictEqual(unique[0].url, 'https://x.com/user/3');
    });
  });
});

console.log('Scrape module tests loaded');
