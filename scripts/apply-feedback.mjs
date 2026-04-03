#!/usr/bin/env node

/**
 * Apply user feedback from Supabase to the denylist
 * 
 * This script:
 * 1. Reads downvoted tweets from Supabase
 * 2. Adds their URLs to denylist.json
 * 3. Uses LLM to analyze patterns and extract keywords
 * 4. Adds learned patterns to denylist for future filtering
 * 5. Marks them as applied in Supabase
 * 
 * Usage:
 *   npm run apply-feedback
 *   node scripts/apply-feedback.mjs
 * 
 * Environment variables required:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service role key (with write access)
 *   LLM_API_KEY - LLM API key (for pattern analysis)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import 'dotenv/config';

// ============ Configuration ============

const DENYLIST_FILE = 'denylist.json';
const MIN_SAMPLES_FOR_ANALYSIS = 3;  // Minimum downvotes needed for LLM analysis

// LLM Configuration
const LLM_API_URL = process.env.LLM_API_URL || 'https://llm-proxy.tapsvc.com/v1/chat/completions';
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-6';

// Supabase client with service key for full access
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase credentials not configured');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_KEY (or NEXT_PUBLIC_* variants)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============ Helper Functions ============

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const dataStr = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${timestamp}] [${level}] ${message}${dataStr}`);
}

function loadDenylist() {
  if (!existsSync(DENYLIST_FILE)) {
    log('WARN', 'Denylist file not found, creating new one');
    return {
      hard: {},
      soft: {},
      low_signal: {},
      feedback: {
        urls: [],
        applied: []
      },
      _meta: {
        version: '1.0.0',
        description: 'Three-tier denylist for brand safety filtering'
      }
    };
  }

  const content = readFileSync(DENYLIST_FILE, 'utf-8');
  const denylist = JSON.parse(content);
  
  // Ensure feedback section exists
  if (!denylist.feedback) {
    denylist.feedback = {
      urls: [],
      applied: []
    };
  }
  
  return denylist;
}

function saveDenylist(denylist) {
  writeFileSync(DENYLIST_FILE, JSON.stringify(denylist, null, 2));
  log('INFO', `Denylist saved to ${DENYLIST_FILE}`);
}

// ============ LLM Analysis Functions ============

/**
 * Call LLM API to analyze downvoted tweets and extract patterns
 */
async function analyzeWithLLM(downvotes) {
  if (!LLM_API_KEY) {
    log('WARN', 'LLM_API_KEY not set, skipping pattern analysis');
    return null;
  }

  if (downvotes.length < MIN_SAMPLES_FOR_ANALYSIS) {
    log('INFO', `Only ${downvotes.length} samples, need ${MIN_SAMPLES_FOR_ANALYSIS}+ for pattern analysis`);
    return null;
  }

  log('INFO', `Analyzing ${downvotes.length} downvoted tweets with LLM...`);

  // Prepare tweet samples for analysis (include user feedback reason)
  const samples = downvotes.map((v, i) => {
    const feedbackLine = v.feedback ? `用户反馈原因: ${v.feedback}` : '';
    return `[${i + 1}] 分类: ${v.tweet_group || '未知'}, 来源: ${v.source_query || '未知'}${feedbackLine ? '\n' + feedbackLine : ''}
内容: ${v.tweet_text || '(无内容)'}`;
  }).join('\n\n');

  const systemPrompt = `你是一个推文质量分析专家。用户会给你一组被标记为"收录错误"的推文。
你的任务是分析这些推文的共同特征，提取出精准的过滤规则。

**重要：部分推文包含"用户反馈原因"，请重点参考。常见原因：
- is_ad: 是广告/推广
- customer_service: 售后/客服问题
- too_old: 时效过了
- no_angle: 不好切入
- not_relevant: 不相关
- other: 其他原因（会有自定义描述）**

请输出 JSON 格式的分析结果，包含：

1. rules: 过滤规则数组，每条规则是一个对象：
   {
     "phrases": ["短语1", "短语2"],  // 2-5个词的短语，必须同时或任一出现才触发
     "match": "any" | "all",          // any=任一短语命中即触发, all=所有短语都命中才触发
     "penalty": 0.3,                  // 扣分系数(0-1)，0.3=得分乘以0.3，越小惩罚越重
     "category": "分类名",
     "reason": "为什么这条规则有效"
   }
   
2. categories: 这些错误推文属于哪些类别
3. summary: 一句话总结
4. prompt_suggestions: 优化建议

**规则设计原则（极其重要）：**
- 绝对禁止输出单个常见词如 "email", "help", "问题", "send" 等作为规则，这些词在正常痛点推文中也大量出现
- phrases 必须是 2 个词以上的短语，或者是非常特定的专有名词（如 "gmail" 只在明确是 Gmail 官方账号发帖时才用）
- 优先使用 match:"all" 组合规则（如 phrases:["contact","support"] + match:"all" 表示同时出现 contact 和 support 才触发）
- penalty 不要设为 0，保留被惩罚推文出现的可能性：
  - 0.2-0.3: 非常可能是噪音（如纯广告推广）
  - 0.4-0.5: 大概率噪音但偶尔有价值（如客服问题中可能包含痛点）
  - 0.6-0.7: 轻度降权（如不太相关但也不完全无用）
- 如果某个模式已经被项目的 brand safety 三层过滤覆盖（promotional, politics, customer_service 等），就不要重复提取
- 宁可少出规则也不要出宽泛规则，5条精准规则胜过20条宽泛规则`;

  const userPrompt = `以下是被用户标记为"收录错误"的推文，请分析共同特征并提取精准过滤规则：

${samples}

请以 JSON 格式输出分析结果（rules 数组中每条规则的 phrases 必须是 2 词以上的短语或组合）：`;

  try {
    const isAnthropicAPI = LLM_API_URL.includes('/v1/messages') || LLM_API_URL.includes('anthropic');
    const headers = {
      'Content-Type': 'application/json'
    };
    let requestBody;

    if (isAnthropicAPI) {
      headers['x-api-key'] = LLM_API_KEY;
      headers['anthropic-version'] = '2023-06-01';
      requestBody = {
        model: LLM_MODEL,
        max_tokens: 1024,
        messages: [
          { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }
        ]
      };
    } else {
      headers['Authorization'] = `Bearer ${LLM_API_KEY}`;
      requestBody = {
        model: LLM_MODEL,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      };
    }

    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('ERROR', 'LLM API error', { status: response.status, error: errorText });
      return null;
    }

    const result = await response.json();
    const content = result.content?.[0]?.text || result.choices?.[0]?.message?.content;

    if (!content) {
      log('WARN', 'Empty response from LLM');
      return null;
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const analysis = JSON.parse(jsonStr.trim());
    log('INFO', 'LLM analysis complete', {
      keywords: analysis.keywords?.length || 0,
      patterns: analysis.patterns?.length || 0,
      categories: analysis.categories?.length || 0
    });

    return analysis;
  } catch (err) {
    log('ERROR', 'LLM analysis failed', { error: err.message });
    return null;
  }
}

/**
 * Apply LLM-extracted rules to denylist
 */
function applyLearnedPatterns(denylist, analysis) {
  if (!analysis) return { rulesAdded: 0 };

  if (!denylist.learned) {
    denylist.learned = {
      keywords: [],
      rules: [],
      patterns: [],
      history: []
    };
  }
  if (!denylist.learned.rules) {
    denylist.learned.rules = [];
  }

  let rulesAdded = 0;

  if (analysis.rules?.length > 0) {
    const existingFingerprints = new Set(
      denylist.learned.rules.map(r => JSON.stringify(r.phrases?.sort()))
    );

    for (const rule of analysis.rules) {
      if (!rule.phrases || !Array.isArray(rule.phrases) || rule.phrases.length === 0) continue;

      const normalized = {
        phrases: rule.phrases.map(p => p.toLowerCase().trim()).filter(p => p.length >= 2),
        match: rule.match === 'all' ? 'all' : 'any',
        penalty: Math.max(0.1, Math.min(1, rule.penalty ?? 0.3)),
        category: rule.category || 'unknown',
        reason: rule.reason || '',
        addedAt: new Date().toISOString()
      };

      if (normalized.phrases.length === 0) continue;

      const fp = JSON.stringify(normalized.phrases.sort());
      if (existingFingerprints.has(fp)) continue;

      denylist.learned.rules.push(normalized);
      existingFingerprints.add(fp);
      rulesAdded++;
      log('DEBUG', `Added learned rule: [${normalized.match}] "${normalized.phrases.join('" + "')}" → penalty ${normalized.penalty}`);
    }
  }

  denylist.learned.history.push({
    analyzedAt: new Date().toISOString(),
    sampleCount: analysis.sampleCount || 0,
    summary: analysis.summary || '',
    categories: analysis.categories || [],
    rulesExtracted: analysis.rules?.length || 0,
    promptSuggestions: analysis.prompt_suggestions || []
  });

  if (denylist.learned.history.length > 20) {
    denylist.learned.history = denylist.learned.history.slice(-20);
  }

  log('INFO', `Applied learned rules: ${rulesAdded} new rules (total: ${denylist.learned.rules.length})`);
  return { rulesAdded };
}

// ============ Main Functions ============

async function fetchUnappliedDownvotes() {
  log('INFO', 'Fetching unapplied downvotes from Supabase...');
  
  const { data, error } = await supabase
    .from('votes')
    .select('*')
    .eq('vote_type', 'down')
    .eq('applied', false);

  if (error) {
    log('ERROR', 'Failed to fetch downvotes', { error: error.message });
    throw error;
  }

  log('INFO', `Found ${data?.length || 0} unapplied downvotes`);
  return data || [];
}

async function markAsApplied(urls) {
  if (urls.length === 0) return;
  
  log('INFO', `Marking ${urls.length} votes as applied...`);
  
  const { error } = await supabase
    .from('votes')
    .update({ 
      applied: true, 
      applied_at: new Date().toISOString() 
    })
    .in('tweet_url', urls);

  if (error) {
    log('ERROR', 'Failed to mark votes as applied', { error: error.message });
    throw error;
  }

  log('INFO', 'Votes marked as applied');
}

async function fetchStats() {
  const { data, error } = await supabase
    .from('votes')
    .select('vote_type, applied');

  if (error) {
    log('WARN', 'Failed to fetch stats', { error: error.message });
    return null;
  }

  const stats = {
    total: data?.length || 0,
    upvotes: data?.filter(v => v.vote_type === 'up').length || 0,
    downvotes: data?.filter(v => v.vote_type === 'down').length || 0,
    applied: data?.filter(v => v.applied).length || 0,
    pending: data?.filter(v => !v.applied && v.vote_type === 'down').length || 0
  };

  return stats;
}

// ============ Main ============

async function main() {
  log('INFO', '=== Apply Feedback Script Starting ===');

  // Show current stats
  const stats = await fetchStats();
  if (stats) {
    log('INFO', 'Current feedback stats', stats);
  }

  // Fetch unapplied downvotes
  const downvotes = await fetchUnappliedDownvotes();

  if (downvotes.length === 0) {
    log('INFO', 'No new downvotes to apply');
    log('INFO', '=== Apply Feedback Script Complete ===');
    return;
  }

  // Load denylist
  const denylist = loadDenylist();
  const existingUrls = new Set(denylist.feedback.urls || []);
  
  // Add new URLs
  let addedCount = 0;
  const newUrls = [];

  for (const vote of downvotes) {
    if (!existingUrls.has(vote.tweet_url)) {
      denylist.feedback.urls.push(vote.tweet_url);
      denylist.feedback.applied.push({
        url: vote.tweet_url,
        text: vote.tweet_text?.substring(0, 100),
        group: vote.tweet_group,
        source: vote.source_query,
        addedAt: new Date().toISOString()
      });
      existingUrls.add(vote.tweet_url);
      newUrls.push(vote.tweet_url);
      addedCount++;
      log('DEBUG', `Added URL to denylist: ${vote.tweet_url}`);
    }
  }

  log('INFO', `Added ${addedCount} new URLs to denylist`);

  // ============ LLM Pattern Analysis ============
  // Analyze downvotes with LLM to extract patterns
  const tweetsWithText = downvotes.filter(v => v.tweet_text && v.tweet_text.length > 10);
  
  if (tweetsWithText.length >= MIN_SAMPLES_FOR_ANALYSIS) {
    const analysis = await analyzeWithLLM(tweetsWithText);
    
    if (analysis) {
      analysis.sampleCount = tweetsWithText.length;
      const { rulesAdded } = applyLearnedPatterns(denylist, analysis);
      
      if (rulesAdded > 0 || analysis.prompt_suggestions?.length > 0) {
        log('INFO', 'LLM learning applied', { 
          summary: analysis.summary,
          categories: analysis.categories,
          newRules: rulesAdded,
          promptSuggestions: analysis.prompt_suggestions?.length || 0
        });
        
        if (analysis.prompt_suggestions?.length > 0) {
          log('INFO', 'Prompt optimization suggestions based on user feedback:');
          analysis.prompt_suggestions.forEach((suggestion, i) => {
            log('INFO', `  ${i + 1}. ${suggestion}`);
          });
        }
      }
    }
  }

  // Save denylist (with URLs and learned patterns)
  saveDenylist(denylist);

  // Mark as applied in Supabase
  const urlsToMark = downvotes.map(v => v.tweet_url);
  await markAsApplied(urlsToMark);

  // Final stats
  const finalStats = await fetchStats();
  if (finalStats) {
    log('INFO', 'Final feedback stats', finalStats);
  }

  log('INFO', '=== Apply Feedback Script Complete ===');
}

main().catch(err => {
  log('ERROR', 'Script failed', { error: err.message });
  process.exit(1);
});
