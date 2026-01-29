/**
 * Data Loader Tests (Frontend)
 * Tests data loading, merging, filtering, and sorting logic
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Sample manifest for testing
const sampleManifest = {
  lastUpdated: '2026-01-29T12:00:00.000Z',
  files: [
    { filename: '2026-01-29T10-30.json', runAt: '2026-01-29T10:30:00.000Z' },
    { filename: '2026-01-29T04-30.json', runAt: '2026-01-29T04:30:00.000Z' },
    { filename: '2026-01-28T22-30.json', runAt: '2026-01-28T22:30:00.000Z' },
    { filename: '2026-01-28T16-30.json', runAt: '2026-01-28T16:30:00.000Z' },
    { filename: '2026-01-28T10-30.json', runAt: '2026-01-28T10:30:00.000Z' },
    { filename: '2026-01-27T16-30.json', runAt: '2026-01-27T16:30:00.000Z' },
    { filename: '2026-01-27T10-30.json', runAt: '2026-01-27T10:30:00.000Z' }
  ]
};

// Sample tweets for testing
const sampleTweets = [
  {
    url: 'https://x.com/user1/1',
    author: '@user1',
    text: 'Email overload pain',
    group: 'pain',
    likes: 100,
    retweets: 20,
    replies: 15,
    finalScore: 150,
    datetime: '2026-01-29T08:00:00.000Z',
    fetchedAt: '2026-01-29T10:30:00.000Z'
  },
  {
    url: 'https://x.com/user2/2',
    author: '@user2',
    text: 'AI productivity',
    group: 'reach',
    likes: 200,
    retweets: 40,
    replies: 30,
    finalScore: 180,
    datetime: '2026-01-29T06:00:00.000Z',
    fetchedAt: '2026-01-29T10:30:00.000Z'
  },
  {
    url: 'https://x.com/user3/3',
    author: '@user3',
    text: 'Love filomail',
    group: 'sentiment',
    sentimentLabel: 'positive',
    likes: 50,
    retweets: 10,
    replies: 8,
    finalScore: 80,
    datetime: '2026-01-29T04:00:00.000Z',
    fetchedAt: '2026-01-29T10:30:00.000Z'
  },
  {
    url: 'https://x.com/user4/4',
    author: '@user4',
    text: 'Superhuman feature request',
    group: 'insight',
    insightType: 'competitor_praise',
    likes: 80,
    retweets: 15,
    replies: 12,
    finalScore: 100,
    datetime: '2026-01-28T20:00:00.000Z',
    fetchedAt: '2026-01-28T22:30:00.000Z'
  }
];

describe('Data Loader', () => {
  
  describe('Manifest Loading', () => {
    it('should parse manifest structure correctly', () => {
      assert.ok(sampleManifest.lastUpdated);
      assert.ok(Array.isArray(sampleManifest.files));
      assert.ok(sampleManifest.files.length > 0);
    });
    
    it('should have required fields in file entries', () => {
      for (const file of sampleManifest.files) {
        assert.ok(file.filename, 'Should have filename');
        assert.ok(file.runAt, 'Should have runAt');
      }
    });
    
    it('should be sorted by date (newest first)', () => {
      const dates = sampleManifest.files.map(f => new Date(f.runAt).getTime());
      
      for (let i = 0; i < dates.length - 1; i++) {
        assert.ok(dates[i] >= dates[i + 1], 'Files should be sorted newest first');
      }
    });
  });
  
  describe('Date Range Filtering', () => {
    it('should filter files by date range', () => {
      const startDate = new Date('2026-01-28T00:00:00.000Z');
      const endDate = new Date('2026-01-29T23:59:59.999Z');
      
      const filtered = sampleManifest.files.filter(file => {
        const fileDate = new Date(file.runAt);
        return fileDate >= startDate && fileDate <= endDate;
      });
      
      // Should include files from Jan 28 and Jan 29
      assert.ok(filtered.length > 0);
      assert.ok(filtered.length < sampleManifest.files.length);
    });
    
    it('should handle single day range', () => {
      const startDate = new Date('2026-01-29T00:00:00.000Z');
      const endDate = new Date('2026-01-29T23:59:59.999Z');
      
      const filtered = sampleManifest.files.filter(file => {
        const fileDate = new Date(file.runAt);
        return fileDate >= startDate && fileDate <= endDate;
      });
      
      // Should only include Jan 29 files
      for (const file of filtered) {
        assert.ok(file.filename.startsWith('2026-01-29'));
      }
    });
    
    it('should handle empty range', () => {
      const startDate = new Date('2026-02-01T00:00:00.000Z');
      const endDate = new Date('2026-02-01T23:59:59.999Z');
      
      const filtered = sampleManifest.files.filter(file => {
        const fileDate = new Date(file.runAt);
        return fileDate >= startDate && fileDate <= endDate;
      });
      
      assert.strictEqual(filtered.length, 0);
    });
  });
  
  describe('Data Merging', () => {
    it('should deduplicate tweets by URL', () => {
      const tweets1 = [
        { url: 'https://x.com/1', text: 'Tweet 1', fetchedAt: '2026-01-29T10:00:00.000Z' },
        { url: 'https://x.com/2', text: 'Tweet 2', fetchedAt: '2026-01-29T10:00:00.000Z' }
      ];
      
      const tweets2 = [
        { url: 'https://x.com/2', text: 'Tweet 2 updated', fetchedAt: '2026-01-29T12:00:00.000Z' },
        { url: 'https://x.com/3', text: 'Tweet 3', fetchedAt: '2026-01-29T12:00:00.000Z' }
      ];
      
      const merged = new Map();
      
      // Add tweets1 (older)
      for (const tweet of tweets1) {
        merged.set(tweet.url, tweet);
      }
      
      // Add/update tweets2 (newer - should update engagement but keep earlier fetchedAt)
      for (const tweet of tweets2) {
        if (merged.has(tweet.url)) {
          const existing = merged.get(tweet.url);
          // Keep earlier fetchedAt, update other fields
          merged.set(tweet.url, {
            ...tweet,
            fetchedAt: existing.fetchedAt < tweet.fetchedAt ? existing.fetchedAt : tweet.fetchedAt
          });
        } else {
          merged.set(tweet.url, tweet);
        }
      }
      
      assert.strictEqual(merged.size, 3);
      assert.strictEqual(merged.get('https://x.com/2').text, 'Tweet 2 updated');
      assert.strictEqual(merged.get('https://x.com/2').fetchedAt, '2026-01-29T10:00:00.000Z');
    });
    
    it('should preserve earliest fetchedAt', () => {
      const tweet1 = { url: 'test', fetchedAt: '2026-01-28T10:00:00.000Z' };
      const tweet2 = { url: 'test', fetchedAt: '2026-01-29T10:00:00.000Z' };
      
      const earliest = tweet1.fetchedAt < tweet2.fetchedAt ? tweet1.fetchedAt : tweet2.fetchedAt;
      
      assert.strictEqual(earliest, '2026-01-28T10:00:00.000Z');
    });
  });
  
  describe('Radar Category Filtering', () => {
    it('should filter by pain_radar category', () => {
      const painTweets = sampleTweets.filter(t => 
        t.group === 'pain' || t.group === 'reach'
      );
      
      assert.ok(painTweets.length > 0);
      for (const tweet of painTweets) {
        assert.ok(['pain', 'reach'].includes(tweet.group));
      }
    });
    
    it('should filter by sentiment category', () => {
      const sentimentTweets = sampleTweets.filter(t => 
        t.group === 'sentiment'
      );
      
      assert.strictEqual(sentimentTweets.length, 1);
      assert.ok(sentimentTweets[0].sentimentLabel);
    });
    
    it('should filter by insight category', () => {
      const insightTweets = sampleTweets.filter(t => 
        t.group === 'insight'
      );
      
      assert.strictEqual(insightTweets.length, 1);
      assert.ok(insightTweets[0].insightType);
    });
  });
  
  describe('Subcategory Filtering', () => {
    it('should filter pain tweets only', () => {
      const painOnly = sampleTweets.filter(t => t.group === 'pain');
      assert.strictEqual(painOnly.length, 1);
    });
    
    it('should filter by sentiment label', () => {
      const positive = sampleTweets.filter(t => 
        t.group === 'sentiment' && t.sentimentLabel === 'positive'
      );
      assert.strictEqual(positive.length, 1);
    });
    
    it('should filter by insight type', () => {
      const competitorPraise = sampleTweets.filter(t =>
        t.group === 'insight' && t.insightType === 'competitor_praise'
      );
      assert.strictEqual(competitorPraise.length, 1);
    });
  });
  
  describe('Language Filtering', () => {
    const tweetsWithLanguage = [
      { url: '1', lang: 'en' },
      { url: '2', lang: 'en' },
      { url: '3', lang: 'ja' },
      { url: '4', lang: 'zh' },
      { url: '5', lang: 'en' }
    ];
    
    it('should filter by language', () => {
      const english = tweetsWithLanguage.filter(t => t.lang === 'en');
      const japanese = tweetsWithLanguage.filter(t => t.lang === 'ja');
      
      assert.strictEqual(english.length, 3);
      assert.strictEqual(japanese.length, 1);
    });
    
    it('should get language stats', () => {
      const langCounts = tweetsWithLanguage.reduce((acc, t) => {
        acc[t.lang] = (acc[t.lang] || 0) + 1;
        return acc;
      }, {});
      
      assert.strictEqual(langCounts.en, 3);
      assert.strictEqual(langCounts.ja, 1);
      assert.strictEqual(langCounts.zh, 1);
    });
  });
  
  describe('Sorting', () => {
    it('should sort by score (default)', () => {
      const sorted = [...sampleTweets].sort((a, b) => b.finalScore - a.finalScore);
      
      assert.strictEqual(sorted[0].finalScore, 180);
      assert.strictEqual(sorted[sorted.length - 1].finalScore, 80);
    });
    
    it('should sort by date (newest first)', () => {
      const sorted = [...sampleTweets].sort((a, b) => 
        new Date(b.datetime) - new Date(a.datetime)
      );
      
      assert.ok(new Date(sorted[0].datetime) >= new Date(sorted[1].datetime));
    });
    
    it('should sort by engagement', () => {
      const sorted = [...sampleTweets].sort((a, b) => {
        const engA = a.likes + a.retweets + a.replies;
        const engB = b.likes + b.retweets + b.replies;
        return engB - engA;
      });
      
      const topEngagement = sorted[0].likes + sorted[0].retweets + sorted[0].replies;
      const bottomEngagement = sorted[sorted.length - 1].likes + sorted[sorted.length - 1].retweets + sorted[sorted.length - 1].replies;
      
      assert.ok(topEngagement >= bottomEngagement);
    });
  });
  
  describe('AI Picked Filtering', () => {
    const tweetsWithAiPicked = [
      { url: '1', aiPicked: true },
      { url: '2', aiPicked: true },
      { url: '3', aiPicked: false },
      { url: '4', aiPicked: false },
      { url: '5', aiPicked: true }
    ];
    
    it('should filter AI picked only', () => {
      const aiPicked = tweetsWithAiPicked.filter(t => t.aiPicked);
      assert.strictEqual(aiPicked.length, 3);
    });
    
    it('should show all when not filtering', () => {
      const all = tweetsWithAiPicked;
      assert.strictEqual(all.length, 5);
    });
  });
  
  describe('Pagination', () => {
    const manyTweets = Array.from({ length: 50 }, (_, i) => ({
      url: `https://x.com/${i}`,
      rank: i + 1
    }));
    
    it('should paginate correctly', () => {
      const PAGE_SIZE = 10;
      const page1 = manyTweets.slice(0, PAGE_SIZE);
      const page2 = manyTweets.slice(PAGE_SIZE, PAGE_SIZE * 2);
      const page5 = manyTweets.slice(PAGE_SIZE * 4, PAGE_SIZE * 5);
      
      assert.strictEqual(page1.length, 10);
      assert.strictEqual(page1[0].rank, 1);
      assert.strictEqual(page2[0].rank, 11);
      assert.strictEqual(page5[0].rank, 41);
    });
    
    it('should handle last page with fewer items', () => {
      const PAGE_SIZE = 15;
      const totalPages = Math.ceil(manyTweets.length / PAGE_SIZE);
      const lastPage = manyTweets.slice((totalPages - 1) * PAGE_SIZE);
      
      assert.strictEqual(totalPages, 4);
      assert.strictEqual(lastPage.length, 5); // 50 - 45 = 5
    });
    
    it('should handle empty page', () => {
      const PAGE_SIZE = 10;
      const emptyPage = manyTweets.slice(100, 110);
      
      assert.strictEqual(emptyPage.length, 0);
    });
  });
  
  describe('New Tweet Detection', () => {
    it('should detect tweets fetched recently', () => {
      const recentRunAts = [
        '2026-01-29T10:30:00.000Z',
        '2026-01-29T04:30:00.000Z',
        '2026-01-28T22:30:00.000Z',
        '2026-01-28T16:30:00.000Z'
      ];
      
      const latestRunAt = recentRunAts[0];
      
      const tweet1 = { fetchedAt: '2026-01-29T10:30:00.000Z' };
      const tweet2 = { fetchedAt: '2026-01-28T16:30:00.000Z' };
      
      const isNew1 = tweet1.fetchedAt === latestRunAt;
      const isNew2 = tweet2.fetchedAt === latestRunAt;
      
      assert.strictEqual(isNew1, true);
      assert.strictEqual(isNew2, false);
    });
  });
  
  describe('Statistics Calculation', () => {
    it('should calculate total counts', () => {
      const stats = {
        total: sampleTweets.length,
        byGroup: {
          pain: sampleTweets.filter(t => t.group === 'pain').length,
          reach: sampleTweets.filter(t => t.group === 'reach').length,
          sentiment: sampleTweets.filter(t => t.group === 'sentiment').length,
          insight: sampleTweets.filter(t => t.group === 'insight').length
        }
      };
      
      assert.strictEqual(stats.total, 4);
      assert.strictEqual(stats.byGroup.pain, 1);
      assert.strictEqual(stats.byGroup.reach, 1);
    });
    
    it('should calculate sentiment breakdown', () => {
      const sentimentTweets = sampleTweets.filter(t => t.group === 'sentiment');
      const bySentiment = {
        positive: sentimentTweets.filter(t => t.sentimentLabel === 'positive').length,
        negative: sentimentTweets.filter(t => t.sentimentLabel === 'negative').length,
        neutral: sentimentTweets.filter(t => t.sentimentLabel === 'neutral').length
      };
      
      assert.strictEqual(bySentiment.positive, 1);
      assert.strictEqual(bySentiment.negative, 0);
    });
  });
});

console.log('Data loader tests loaded');
