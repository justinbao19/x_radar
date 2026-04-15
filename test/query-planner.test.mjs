import { describe, it } from 'node:test';
import assert from 'node:assert';
import { planQueries } from '../src/query-planner.mjs';

describe('Query Planner', () => {
  it('should select a high-precision subset from the catalog', async () => {
    const previousKey = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;

    const catalog = {
      pain: [
        {
          name: 'pain-a',
          query: '(email) (follow-up)',
          max: 15,
          intent_type: 'reply_opportunity',
          strictness: 'high',
          priority: 90,
          enabled: true
        }
      ],
      insight: [
        {
          name: 'insight-a',
          query: '(gmail) (wish)',
          max: 15,
          intent_type: 'feature_request',
          strictness: 'high',
          priority: 80,
          enabled: true
        }
      ],
      reach: [],
      sentiment: [],
      kol: []
    };

    const plan = await planQueries(catalog);
    assert.ok(Array.isArray(plan.selectedQueries));
    assert.ok(plan.selectedQueries.length >= 2);
    assert.ok(plan.selectedQueries.some((q) => q.name === 'pain-a'));
    assert.ok(plan.selectedQueries.some((q) => q.name === 'insight-a'));

    if (previousKey) {
      process.env.LLM_API_KEY = previousKey;
    }
  });
});
