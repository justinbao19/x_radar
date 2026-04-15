import { describe, it } from 'node:test';
import assert from 'node:assert';
import { triageTweets } from '../src/triage.mjs';

describe('AI Triage', () => {
  it('should discard obvious promotional or support tweets before LLM triage', async () => {
    const previousKey = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;

    const tweets = [
      {
        url: 'https://x.com/a/status/1',
        text: 'Subscribe to our newsletter for the best AI email workflow webinar today.',
        group: 'insight',
        sourceQuery: 'promo',
        intentType: 'feature_request'
      },
      {
        url: 'https://x.com/a/status/2',
        text: 'Please check your spam folder and contact support if you have not received our email.',
        group: 'pain',
        sourceQuery: 'support',
        intentType: 'reply_opportunity'
      },
      {
        url: 'https://x.com/a/status/3',
        text: 'My inbox is a mess and I keep missing follow-up emails from customers.',
        group: 'pain',
        sourceQuery: 'pain',
        intentType: 'reply_opportunity'
      }
    ];

    const result = await triageTweets(tweets);
    assert.strictEqual(result.get('https://x.com/a/status/1').triageDecision, 'discard');
    assert.strictEqual(result.get('https://x.com/a/status/2').triageDecision, 'discard');
    assert.ok(['watch_only', 'reply_now'].includes(result.get('https://x.com/a/status/3').triageDecision));

    if (previousKey) {
      process.env.LLM_API_KEY = previousKey;
    }
  });
});
