import { writeFileSync } from 'fs';
import { callLLMJson, llmConfigured } from './llm.mjs';
import { FILOMAIL_OPPORTUNITY_BRIEF, TRIAGE_DECISION_GUIDE } from './filomail-context.mjs';
import {
  checkInsightNoise,
  checkInsightRequestSignal,
  countFiloFitKeywords,
  isCustomerServiceNotice,
  isEmailActionOnly,
  isPromotionalContent,
  isViralTemplate,
  checkPainRelevance,
  checkReachRelevance
} from './safety.mjs';
import { copyToLatest, getOutputDir, getOutputPath, log, sleep } from './utils.mjs';

const BATCH_SIZE = parseInt(process.env.TRIAGE_BATCH_SIZE || '8', 10);

function triageFallback(tweet, decision, reasonZh, extra = {}) {
  return {
    id: tweet.url,
    triageDecision: decision,
    triageReasonZh: reasonZh,
    triageConfidence: extra.confidence ?? 0.55,
    discardCategory: extra.discardCategory || null,
    intentType: extra.intentType || tweet.intentType || null
  };
}

function cheapPrefilter(tweet) {
  const text = tweet.text || '';
  const group = tweet.group;

  const promo = isPromotionalContent(text);
  if (promo.isPromo) {
    return triageFallback(tweet, 'discard', '明显营销或推广内容，不是自然用户机会。', {
      confidence: 0.95,
      discardCategory: 'promotion'
    });
  }

  const support = isCustomerServiceNotice(text);
  if (support.isNotice) {
    return triageFallback(tweet, 'discard', '客服/通知类内容，没有自然的公开回复空间。', {
      confidence: 0.95,
      discardCategory: 'customer_support'
    });
  }

  if (isEmailActionOnly(text)) {
    return triageFallback(tweet, 'discard', '只是提到发送或接收邮件动作，不是实际工作流痛点。', {
      confidence: 0.9,
      discardCategory: 'email_action_only'
    });
  }

  const insightNoise = checkInsightNoise(text);
  if (group === 'insight' && insightNoise.isNoise) {
    return triageFallback(tweet, 'discard', '教程、活动或营销类洞察噪音，和 Filo 机会无关。', {
      confidence: 0.9,
      discardCategory: insightNoise.category || 'insight_noise'
    });
  }

  const viral = isViralTemplate(text);
  if (viral.isViral) {
    return triageFallback(tweet, 'discard', '模板化或病毒式内容，虽然命中关键词，但没有真实机会价值。', {
      confidence: 0.88,
      discardCategory: 'viral_template'
    });
  }

  if (group === 'pain') {
    const relevance = checkPainRelevance(text);
    if (!relevance.relevant) {
      return triageFallback(tweet, 'discard', '没有足够明确的邮箱/收件箱工作流痛点。', {
        confidence: 0.86,
        discardCategory: 'low_relevance'
      });
    }
  }

  if (group === 'reach') {
    const relevance = checkReachRelevance(text);
    if (!relevance.relevant) {
      return triageFallback(tweet, 'discard', '只是泛 AI 或生产力讨论，没有邮件工作流切入。', {
        confidence: 0.86,
        discardCategory: 'generic_ai'
      });
    }
  }

  if (group === 'insight') {
    const signal = checkInsightRequestSignal(text);
    if (!signal.hasSignal && countFiloFitKeywords(text) < 3) {
      return triageFallback(tweet, 'discard', '只是弱相关洞察，没有明确未满足需求或替代机会。', {
        confidence: 0.8,
        discardCategory: 'weak_signal'
      });
    }
  }

  return null;
}

function normalizeDecision(value) {
  const lower = String(value || '').trim().toLowerCase();
  if (lower === 'reply_now' || lower === 'reply') return 'reply_now';
  if (lower === 'watch_only' || lower === 'watch') return 'watch_only';
  return 'discard';
}

async function llmTriageBatch(tweets) {
  const systemPrompt = `${FILOMAIL_OPPORTUNITY_BRIEF}\n\n${TRIAGE_DECISION_GUIDE}\n\nReturn strict JSON only.`;
  const userPrompt = `For each tweet candidate below, decide whether it is a real FiloMail opportunity.

Decision rules:
- reply_now: a public FiloMail reply would feel natural and valuable now
- watch_only: useful market signal, but not worth replying to now
- discard: ad, support, tutorial, event notice, generic chatter, weak relevance, or no natural FiloMail angle

Return JSON:
{
  "items": [
    {
      "id": "tweet url",
      "triageDecision": "reply_now|watch_only|discard",
      "triageReasonZh": "short chinese reason",
      "triageConfidence": 0.0,
      "discardCategory": "optional short category",
      "intentType": "reply_opportunity|feature_request|competitor_displacement|brand_sentiment|general"
    }
  ]
}

Tweets:
${JSON.stringify(tweets.map((tweet) => ({
  id: tweet.url,
  group: tweet.group,
  sourceQuery: tweet.sourceQuery,
  author: tweet.author,
  text: tweet.text,
  filoFitKeywordCount: tweet.filoFitKeywordCount,
  finalScore: tweet.finalScore
})), null, 2)}`;

  const json = await callLLMJson(systemPrompt, userPrompt, { maxTokens: 3000 });
  return Array.isArray(json.items) ? json.items : [];
}

export async function triageTweets(tweets) {
  const results = [];
  const toSend = [];

  for (const tweet of tweets) {
    const pref = cheapPrefilter(tweet);
    if (pref) {
      results.push(pref);
    } else {
      toSend.push(tweet);
    }
  }

  if (llmConfigured() && toSend.length) {
    for (let index = 0; index < toSend.length; index += BATCH_SIZE) {
      const batch = toSend.slice(index, index + BATCH_SIZE);
      try {
        const batchResult = await llmTriageBatch(batch);
        const byId = new Map(batchResult.map((item) => [item.id, item]));
        for (const tweet of batch) {
          const row = byId.get(tweet.url);
          results.push({
            id: tweet.url,
            triageDecision: normalizeDecision(row?.triageDecision),
            triageReasonZh: row?.triageReasonZh || 'AI 未返回明确理由，默认按低置信处理。',
            triageConfidence: Number(row?.triageConfidence || 0.6),
            discardCategory: row?.discardCategory || null,
            intentType: row?.intentType || tweet.intentType || 'general'
          });
        }
      } catch (error) {
        log('WARN', 'LLM triage batch failed, using heuristic fallback', {
          error: error.message,
          batchSize: batch.length
        });
        for (const tweet of batch) {
          results.push(triageFallback(tweet, 'watch_only', 'LLM 分流失败，临时保留为观察项。', {
            confidence: 0.35,
            intentType: tweet.intentType || 'general'
          }));
        }
      }
      await sleep(250);
    }
  } else {
    for (const tweet of toSend) {
      results.push(triageFallback(tweet, 'watch_only', '未配置 LLM，先保留为观察项。', {
        confidence: 0.3,
        intentType: tweet.intentType || 'general'
      }));
    }
  }

  return new Map(results.map((row) => [row.id, row]));
}

export function persistTriageArtifact(data, runDate) {
  const outputPath = getOutputPath('candidates_enriched.json', runDate);
  writeFileSync(outputPath, JSON.stringify(data, null, 2));
  copyToLatest(getOutputDir(runDate));
  return outputPath;
}
