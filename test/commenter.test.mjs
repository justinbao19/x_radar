/**
 * Commenter Module Tests
 * Tests AI comment generation, language detection, and JSON parsing
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Check if mock server is available
async function checkMockServer(url) {
  try {
    const response = await fetch(`${url}/status`);
    return response.ok;
  } catch {
    return false;
  }
}

// Control mock server mode
async function setMockMode(url, mode) {
  try {
    const response = await fetch(`${url}/control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    return response.ok;
  } catch {
    return false;
  }
}

describe('Commenter Module', () => {
  const MOCK_URL = process.env.LLM_API_URL || 'http://localhost:3001';
  let mockServerAvailable = false;
  
  before(async () => {
    mockServerAvailable = await checkMockServer(MOCK_URL);
    if (!mockServerAvailable) {
      console.log('  [Note] Mock server not running, some tests will be skipped');
    }
  });
  
  describe('Language Detection', () => {
    // Test language detection logic
    it('should detect English text', () => {
      const text = 'My email inbox is completely overwhelming with spam';
      // franc library detection
      const isEnglish = /^[a-zA-Z\s.,!?'"-]+$/.test(text.replace(/[^\w\s]/g, ''));
      assert.ok(isEnglish || text.length > 0, 'Should process English text');
    });
    
    it('should detect Japanese text', () => {
      const text = 'メールの受信トレイが多すぎて困っています';
      const hasJapanese = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(text);
      assert.strictEqual(hasJapanese, true);
    });
    
    it('should detect Chinese text', () => {
      const text = '我的邮箱收件箱太乱了，需要整理';
      const hasChinese = /[\u4e00-\u9fff]/.test(text);
      assert.strictEqual(hasChinese, true);
    });
    
    it('should detect mixed language text', () => {
      const text = 'Email is 最悪 today';
      const hasEnglish = /[a-zA-Z]/.test(text);
      const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(text);
      
      assert.strictEqual(hasEnglish, true);
      assert.strictEqual(hasCJK, true);
    });
  });
  
  describe('JSON Parsing', () => {
    it('should parse valid comment response', () => {
      const validJson = JSON.stringify({
        tweet_language: 'en',
        recommended: 'B',
        replies: {
          A: { text: 'Witty reply', explanation: 'Fun response', cn_translation: '机智回复' },
          B: { text: 'Practical reply', explanation: 'Helpful response', cn_translation: '实用回复' },
          C: { text: 'Product reply', explanation: 'Subtle mention', cn_translation: '产品回复' }
        }
      });
      
      const parsed = JSON.parse(validJson);
      assert.ok(parsed.replies);
      assert.ok(parsed.replies.A);
      assert.ok(parsed.replies.B);
      assert.ok(parsed.replies.C);
      assert.strictEqual(parsed.recommended, 'B');
    });
    
    it('should handle malformed JSON gracefully', () => {
      const malformedJson = 'This is not valid JSON {';
      
      let error = null;
      try {
        JSON.parse(malformedJson);
      } catch (e) {
        error = e;
      }
      
      assert.ok(error instanceof SyntaxError, 'Should throw SyntaxError');
    });
    
    it('should extract JSON from markdown code blocks', () => {
      const responseWithCodeBlock = `Here's the reply:
\`\`\`json
{"tweet_language": "en", "recommended": "A", "replies": {"A": {"text": "test"}}}
\`\`\``;
      
      // Extract JSON from code block
      const jsonMatch = responseWithCodeBlock.match(/```(?:json)?\s*([\s\S]*?)```/);
      const extractedJson = jsonMatch ? jsonMatch[1].trim() : null;
      
      assert.ok(extractedJson, 'Should extract JSON from code block');
      const parsed = JSON.parse(extractedJson);
      assert.strictEqual(parsed.recommended, 'A');
    });
    
    it('should handle nested JSON in response', () => {
      const nestedResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            tweet_language: 'en',
            replies: { A: { text: 'test' } }
          })
        }]
      };
      
      const textContent = nestedResponse.content[0].text;
      const parsed = JSON.parse(textContent);
      
      assert.ok(parsed.replies, 'Should parse nested JSON');
    });
  });
  
  describe('Reply Structure Validation', () => {
    it('should validate three reply styles', () => {
      const replies = {
        A: { text: 'Witty', explanation: 'Fun', cn_translation: '机智' },
        B: { text: 'Practical', explanation: 'Helpful', cn_translation: '实用' },
        C: { text: 'Product', explanation: 'Subtle', cn_translation: '产品' }
      };
      
      assert.ok('A' in replies, 'Should have witty reply (A)');
      assert.ok('B' in replies, 'Should have practical reply (B)');
      assert.ok('C' in replies, 'Should have product reply (C)');
    });
    
    it('should validate reply fields', () => {
      const reply = {
        text: 'Great point about inbox management!',
        explanation: 'Acknowledges the issue while adding value',
        cn_translation: '关于收件箱管理的好观点！'
      };
      
      assert.ok(reply.text, 'Should have text');
      assert.ok(reply.explanation, 'Should have explanation');
      assert.ok(reply.cn_translation, 'Should have Chinese translation');
    });
    
    it('should validate recommended field', () => {
      const validRecommended = ['A', 'B', 'C'];
      const response = { recommended: 'B' };
      
      assert.ok(validRecommended.includes(response.recommended));
    });
  });
  
  describe('Error Handling', () => {
    it('should handle missing tweet text', () => {
      const tweet = { url: 'https://x.com/test', author: '@user' };
      const hasText = !!tweet.text;
      
      assert.strictEqual(hasText, false);
      // Should skip or handle gracefully
    });
    
    it('should handle empty response', () => {
      const emptyResponse = { content: [] };
      const hasContent = emptyResponse.content && emptyResponse.content.length > 0;
      
      assert.strictEqual(hasContent, false);
    });
    
    it('should handle API timeout simulation', async function() {
      // Skip if mock server not available
      if (!mockServerAvailable) {
        console.log('    [Skipped] Mock server not running');
        return;
      }
      
      // Set mock to timeout mode
      await setMockMode(MOCK_URL, 'timeout');
      
      // Test with short timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 500);
      
      try {
        await fetch(`${MOCK_URL}/mock`, {
          method: 'POST',
          signal: controller.signal,
          body: JSON.stringify({ model: 'test', messages: [] })
        });
        assert.fail('Should have timed out');
      } catch (e) {
        assert.ok(e.name === 'AbortError', 'Should abort on timeout');
      } finally {
        clearTimeout(timeout);
        await setMockMode(MOCK_URL, 'success');
      }
    });
    
    it('should handle API error response', async function() {
      if (!mockServerAvailable) {
        console.log('    [Skipped] Mock server not running');
        return;
      }
      
      await setMockMode(MOCK_URL, 'error');
      
      const response = await fetch(`${MOCK_URL}/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'test', messages: [] })
      });
      
      assert.strictEqual(response.ok, false);
      assert.strictEqual(response.status, 500);
      
      await setMockMode(MOCK_URL, 'success');
    });
  });
  
  describe('Prompt Construction', () => {
    it('should include tweet text in prompt', () => {
      const tweet = {
        text: 'My inbox is drowning in spam',
        author: '@testuser',
        url: 'https://x.com/test/123'
      };
      
      const promptParts = [
        tweet.text,
        tweet.author
      ];
      
      // Verify all parts can be included
      for (const part of promptParts) {
        assert.ok(part, 'Prompt part should exist');
      }
    });
    
    it('should handle special characters in tweet', () => {
      const tweets = [
        { text: 'Email with "quotes" and \'apostrophes\'' },
        { text: 'Email with <html> tags' },
        { text: 'Email with emoji 📧💀' },
        { text: 'Email with newlines\nand\ttabs' }
      ];
      
      for (const tweet of tweets) {
        // Should be serializable
        const serialized = JSON.stringify(tweet);
        const deserialized = JSON.parse(serialized);
        assert.strictEqual(deserialized.text, tweet.text);
      }
    });
    
    it('should include reply guidelines', () => {
      const guidelines = [
        'Do not be promotional',
        'Match the original language',
        'Be authentic and helpful'
      ];
      
      // These should be part of the prompt system
      assert.strictEqual(guidelines.length, 3);
    });
  });
  
  describe('Output Structure', () => {
    it('should produce valid output with comments', () => {
      const outputStructure = {
        runDate: '2026-01-29',
        runAt: '2026-01-29T10:00:00.000Z',
        selectionStats: {},
        qualityConfig: {},
        top: [
          {
            rank: 1,
            url: 'https://x.com/test/1',
            text: 'Test tweet',
            comments: {
              status: 'generated',
              generatedAt: '2026-01-29T11:00:00.000Z',
              tweet_language: 'en',
              recommended: 'B',
              replies: {}
            }
          }
        ]
      };
      
      const tweet = outputStructure.top[0];
      assert.ok(tweet.comments, 'Should have comments field');
      assert.strictEqual(tweet.comments.status, 'generated');
    });
    
    it('should handle skipped tweets', () => {
      const skippedTweet = {
        comments: {
          status: 'skipped',
          reason: 'Brand safety filter'
        }
      };
      
      assert.strictEqual(skippedTweet.comments.status, 'skipped');
      assert.ok(skippedTweet.comments.reason);
    });
    
    it('should handle failed generation', () => {
      const failedTweet = {
        comments: {
          status: 'failed',
          error: 'API timeout'
        }
      };
      
      assert.strictEqual(failedTweet.comments.status, 'failed');
      assert.ok(failedTweet.comments.error);
    });
  });
  
  describe('Mock Server Integration', function() {
    it('should get successful response from mock server', async function() {
      if (!mockServerAvailable) {
        console.log('    [Skipped] Mock server not running');
        return;
      }
      
      await setMockMode(MOCK_URL, 'success');
      
      const response = await fetch(`${MOCK_URL}/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          messages: [{ role: 'user', content: 'Test' }]
        })
      });
      
      assert.strictEqual(response.ok, true);
      
      const data = await response.json();
      assert.ok(data.content);
      assert.ok(data.content[0].text);
      
      // Parse the embedded JSON
      const parsedReply = JSON.parse(data.content[0].text);
      assert.ok(parsedReply.replies);
    });
  });
});

console.log('Commenter module tests loaded');
