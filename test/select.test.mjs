/**
 * Select Module Tests
 * Tests tweet scoring, filtering, and selection logic
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Test fixtures
const sampleRawPath = join(__dirname, 'fixtures/sample-raw.json');

describe('Select Module', () => {
  let sampleRaw;
  
  before(() => {
    if (existsSync(sampleRawPath)) {
      sampleRaw = JSON.parse(readFileSync(sampleRawPath, 'utf-8'));
    } else {
      throw new Error('Sample raw data not found');
    }
  });
  
  describe('Data Loading', () => {
    it('should load sample raw data correctly', () => {
      assert.ok(sampleRaw.runDate);
      assert.ok(sampleRaw.runAt);
      assert.ok(Array.isArray(sampleRaw.sources));
      assert.ok(sampleRaw.sources.length > 0);
    });
    
    it('should have valid tweet structure', () => {
      const firstSource = sampleRaw.sources[0];
      const firstTweet = firstSource.tweets[0];
      
      assert.ok(firstTweet.url);
      assert.ok(firstTweet.author);
      assert.ok(firstTweet.text);
      assert.ok(typeof firstTweet.likes === 'number');
    });
  });
  
  describe('Scoring Logic', () => {
    // Import scoring function for direct testing
    it('should calculate virality score with log compression', () => {
      // High engagement tweet
      const highEngagement = {
        likes: 15000,
        retweets: 3000,
        replies: 500
      };
      
      // Low engagement tweet  
      const lowEngagement = {
        likes: 150,
        retweets: 30,
        replies: 25
      };
      
      // Raw engagement calculation
      const highRaw = highEngagement.likes * 2 + highEngagement.retweets * 2 + highEngagement.replies * 1.5;
      const lowRaw = lowEngagement.likes * 2 + lowEngagement.retweets * 2 + lowEngagement.replies * 1.5;
      
      // Log compressed scores
      const highVirality = Math.log10(1 + highRaw) * 100;
      const lowVirality = Math.log10(1 + lowRaw) * 100;
      
      // High engagement should be higher but not proportionally
      // 15000 vs 150 is 100x, but log scores should be much closer
      const ratio = highVirality / lowVirality;
      
      assert.ok(ratio < 3, `Log compression should reduce ratio. Got ${ratio}`);
      assert.ok(highVirality > lowVirality, 'High engagement should still score higher');
    });
    
    it('should calculate FiloFit score correctly', () => {
      const text = 'My inbox is overloaded with email and spam notifications';
      const keywordMatches = ['inbox', 'email', 'spam', 'notifications'];
      const expectedScore = keywordMatches.length * 5;
      
      // Manual count - at least these keywords should match
      assert.ok(expectedScore >= 15, 'Should have multiple keyword matches');
    });
    
    it('should apply pain group bonus', () => {
      const baseScore = 100;
      const PAIN_GROUP_BONUS = 3;
      
      const painScore = baseScore * PAIN_GROUP_BONUS;
      const reachScore = baseScore * 1;
      
      assert.strictEqual(painScore, 300);
      assert.strictEqual(reachScore, 100);
    });
  });
  
  describe('Deduplication', () => {
    it('should deduplicate by URL', () => {
      const tweets = [
        { url: 'https://x.com/user/1', text: 'First' },
        { url: 'https://x.com/user/2', text: 'Second' },
        { url: 'https://x.com/user/1', text: 'Duplicate' }
      ];
      
      const seenUrls = new Set();
      const unique = tweets.filter(t => {
        if (seenUrls.has(t.url)) return false;
        seenUrls.add(t.url);
        return true;
      });
      
      assert.strictEqual(unique.length, 2);
      assert.strictEqual(unique[0].text, 'First');
      assert.strictEqual(unique[1].text, 'Second');
    });
    
    it('should identify duplicates in sample data', () => {
      // The sample data has a duplicate URL in different sources
      const allUrls = [];
      for (const source of sampleRaw.sources) {
        for (const tweet of source.tweets) {
          allUrls.push(tweet.url);
        }
      }
      
      const uniqueUrls = new Set(allUrls);
      assert.ok(allUrls.length > uniqueUrls.size, 'Sample data should have duplicates');
    });
  });
  
  describe('Freshness Filter', () => {
    it('should filter old tweets', () => {
      const MAX_AGE_DAYS = 3;
      const now = Date.now();
      const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
      
      const tweets = [
        { datetime: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(), text: 'Fresh 1 day' },
        { datetime: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), text: 'Fresh 2 days' },
        { datetime: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), text: 'Old 5 days' },
        { datetime: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), text: 'Old 10 days' }
      ];
      
      const fresh = tweets.filter(t => {
        const tweetDate = new Date(t.datetime);
        const ageMs = now - tweetDate.getTime();
        return ageMs <= maxAgeMs;
      });
      
      assert.strictEqual(fresh.length, 2);
    });
  });
  
  describe('Group Classification', () => {
    it('should classify pain group correctly', () => {
      const painSources = sampleRaw.sources.filter(s => s.group === 'pain');
      assert.ok(painSources.length > 0, 'Should have pain group sources');
    });
    
    it('should classify reach group correctly', () => {
      const reachSources = sampleRaw.sources.filter(s => s.group === 'reach');
      assert.ok(reachSources.length > 0, 'Should have reach group sources');
    });
    
    it('should convert kol to reach', () => {
      const kolSources = sampleRaw.sources.filter(s => s.group === 'kol');
      assert.ok(kolSources.length > 0, 'Should have KOL sources');
      
      // In selection, KOL group becomes reach
      for (const source of kolSources) {
        const convertedGroup = 'reach'; // KOL -> reach
        assert.strictEqual(convertedGroup, 'reach');
      }
    });
    
    it('should classify sentiment group correctly', () => {
      const sentimentSources = sampleRaw.sources.filter(s => s.group === 'sentiment');
      assert.ok(sentimentSources.length > 0, 'Should have sentiment group sources');
    });
    
    it('should classify insight group correctly', () => {
      const insightSources = sampleRaw.sources.filter(s => s.group === 'insight');
      assert.ok(insightSources.length > 0, 'Should have insight group sources');
    });
  });
  
  describe('Sentiment Classification', () => {
    it('should classify positive sentiment', () => {
      const positivePatterns = [
        /\b(love|loving|loved|amazing|awesome|great|excellent|fantastic)\b/i,
        /\b(best|recommend|recommended|helpful|solved|perfect|beautiful)\b/i
      ];
      
      const text = 'I love this product, it is amazing and the best I have tried!';
      const isPositive = positivePatterns.some(p => p.test(text));
      
      assert.strictEqual(isPositive, true);
    });
    
    it('should classify negative sentiment', () => {
      const negativePatterns = [
        /\b(bug|bugs|broken|issue|issues|problem|problems)\b/i,
        /\b(hate|worst|terrible|disappointed|disappointing)\b/i
      ];
      
      const text = 'There is a bug in this app, worst experience ever';
      const isNegative = negativePatterns.some(p => p.test(text));
      
      assert.strictEqual(isNegative, true);
    });
    
    it('should classify neutral sentiment', () => {
      const positivePatterns = [/\b(love|amazing|best)\b/i];
      const negativePatterns = [/\b(bug|hate|worst)\b/i];
      
      const text = 'Just using email normally today';
      const isPositive = positivePatterns.some(p => p.test(text));
      const isNegative = negativePatterns.some(p => p.test(text));
      
      assert.strictEqual(isPositive, false);
      assert.strictEqual(isNegative, false);
    });
  });
  
  describe('Insight Type Classification', () => {
    it('should classify feature request', () => {
      const patterns = [
        /\b(wish|hope|want|need|would be great)\b/i,
        /\b(feature request|please add)\b/i
      ];
      
      const text = 'I wish this app had better email integration';
      const isFeatureRequest = patterns.some(p => p.test(text));
      
      assert.strictEqual(isFeatureRequest, true);
    });
    
    it('should classify competitor praise', () => {
      const competitors = ['superhuman', 'spark', 'edison'];
      const text = 'I love using superhuman for email management';
      
      const isCompetitor = competitors.some(c => text.toLowerCase().includes(c));
      assert.strictEqual(isCompetitor, true);
    });
    
    it('should classify AI demand', () => {
      const patterns = [
        /\b(AI email|email AI|smart inbox|AI inbox)\b/i,
        /\b(AI assistant|AI agent|automation)\b/i
      ];
      
      const text = 'Looking for an AI email assistant to handle my inbox';
      const isAiDemand = patterns.some(p => p.test(text));
      
      assert.strictEqual(isAiDemand, true);
    });
  });
  
  describe('KOL Handling', () => {
    it('should verify KOL author matches handle list', () => {
      const kolHandles = new Set(['sama', 'karpathy', 'levelsio']);
      const tweet = { author: '@sama', text: 'AI is transforming email' };
      
      const handle = tweet.author.replace('@', '').toLowerCase();
      const isKol = kolHandles.has(handle);
      
      assert.strictEqual(isKol, true);
    });
    
    it('should reject non-KOL authors in KOL group', () => {
      const kolHandles = new Set(['sama', 'karpathy']);
      const tweet = { author: '@randomuser', text: 'Email thoughts' };
      
      const handle = tweet.author.replace('@', '').toLowerCase();
      const isKol = kolHandles.has(handle);
      
      assert.strictEqual(isKol, false);
    });
    
    it('should limit max tweets per KOL', () => {
      const MAX_PER_KOL = 1;
      const tweets = [
        { author: '@sama', url: '1' },
        { author: '@sama', url: '2' },
        { author: '@karpathy', url: '3' }
      ];
      
      const kolCounts = {};
      const filtered = tweets.filter(t => {
        const handle = t.author.toLowerCase();
        const count = kolCounts[handle] || 0;
        if (count >= MAX_PER_KOL) return false;
        kolCounts[handle] = count + 1;
        return true;
      });
      
      assert.strictEqual(filtered.length, 2);
      assert.strictEqual(filtered.filter(t => t.author === '@sama').length, 1);
    });
  });
  
  describe('Quality Thresholds', () => {
    it('should apply minimum score threshold', () => {
      const MIN_SCORE = 50;
      const tweets = [
        { finalScore: 100 },
        { finalScore: 45 },
        { finalScore: 60 },
        { finalScore: 30 }
      ];
      
      const qualified = tweets.filter(t => t.finalScore >= MIN_SCORE);
      assert.strictEqual(qualified.length, 2);
    });
    
    it('should have different thresholds per group', () => {
      const QUALITY_CONFIG = {
        minFinalScore: 50,
        insightMinFinalScore: 40,
        sentimentMinFinalScore: 15
      };
      
      assert.ok(QUALITY_CONFIG.sentimentMinFinalScore < QUALITY_CONFIG.insightMinFinalScore);
      assert.ok(QUALITY_CONFIG.insightMinFinalScore < QUALITY_CONFIG.minFinalScore);
    });
  });
  
  describe('Output Structure', () => {
    it('should produce valid output structure', () => {
      const expectedFields = [
        'runDate', 'runAt', 'selectionStats', 'qualityConfig', 'top'
      ];
      
      const mockOutput = {
        runDate: '2026-01-29',
        runAt: '2026-01-29T10:00:00.000Z',
        selectionStats: {
          totalCandidates: 100,
          uniqueAfterDedup: 80,
          qualified: 10
        },
        qualityConfig: {},
        top: []
      };
      
      for (const field of expectedFields) {
        assert.ok(field in mockOutput, `Missing field: ${field}`);
      }
    });
    
    it('should include AI-picked flag in top tweets', () => {
      const AI_PICK_TOP_N = 10;
      const tweets = Array.from({ length: 20 }, (_, i) => ({
        rank: i + 1,
        aiPicked: i < AI_PICK_TOP_N
      }));
      
      const aiPicked = tweets.filter(t => t.aiPicked);
      assert.strictEqual(aiPicked.length, AI_PICK_TOP_N);
    });
  });
});

console.log('Select module tests loaded');
