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
 *   LLM_API_KEY - Claude API key (for pattern analysis)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import 'dotenv/config';

// ============ Configuration ============

const DENYLIST_FILE = 'denylist.json';
const MIN_SAMPLES_FOR_ANALYSIS = 3;  // Minimum downvotes needed for LLM analysis

// LLM Configuration
const LLM_API_URL = process.env.LLM_API_URL || 'https://api.anthropic.com/v1/messages';
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';

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
 * Call Claude API to analyze downvoted tweets and extract patterns
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
你的任务是分析这些推文的共同特征，找出它们为什么不应该被收录的规律。

**重要：部分推文包含"用户反馈原因"，这是用户明确告诉我们为什么这条推文不应该被收录。
请重点参考这些反馈原因来理解误收录的模式。常见的反馈原因包括：
- irrelevant: 与业务无关
- spam: 垃圾/广告内容  
- duplicate: 重复内容
- low_quality: 质量太低
- wrong_category: 分类错误
- other: 其他原因（会有自定义描述）**

请输出 JSON 格式的分析结果，包含：
1. keywords: 应该加入黑名单的关键词（数组，小写，每个词2-4个字）
2. patterns: 应该过滤的模式描述（数组，用自然语言描述）
3. categories: 这些错误推文属于哪些类别（如：营销、招聘、客服、无关话题等）
4. summary: 一句话总结这些推文被误收录的原因
5. prompt_suggestions: 基于用户反馈，给出优化推文筛选提示词的建议（数组，具体可操作的建议）

注意：
- 只提取有明确共同特征的模式，不要过度泛化
- 关键词应该是具体的、可操作的
- 如果样本太少或没有明显规律，可以返回空数组
- prompt_suggestions 应该基于用户反馈原因，给出具体的提示词优化建议`;

  const userPrompt = `以下是被用户标记为"收录错误"的推文，请分析它们的共同特征：

${samples}

请以 JSON 格式输出分析结果：`;

  try {
    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': LLM_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: 1024,
        messages: [
          { role: 'user', content: `${systemPrompt}\n\n${userPrompt}` }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('ERROR', 'LLM API error', { status: response.status, error: errorText });
      return null;
    }

    const result = await response.json();
    const content = result.content?.[0]?.text;

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
 * Apply LLM-extracted patterns to denylist
 */
function applyLearnedPatterns(denylist, analysis) {
  if (!analysis) return { keywordsAdded: 0, patternsAdded: 0 };

  // Ensure learned section exists
  if (!denylist.learned) {
    denylist.learned = {
      keywords: [],
      patterns: [],
      history: []
    };
  }

  const existingKeywords = new Set(denylist.learned.keywords.map(k => k.toLowerCase()));
  let keywordsAdded = 0;
  let patternsAdded = 0;

  // Add new keywords
  if (analysis.keywords?.length > 0) {
    for (const keyword of analysis.keywords) {
      const normalized = keyword.toLowerCase().trim();
      if (normalized && normalized.length >= 2 && !existingKeywords.has(normalized)) {
        denylist.learned.keywords.push(normalized);
        existingKeywords.add(normalized);
        keywordsAdded++;
        log('DEBUG', `Added learned keyword: "${normalized}"`);
      }
    }
  }

  // Record analysis history (include prompt suggestions from user feedback)
  denylist.learned.history.push({
    analyzedAt: new Date().toISOString(),
    sampleCount: analysis.sampleCount || 0,
    summary: analysis.summary || '',
    categories: analysis.categories || [],
    keywordsExtracted: analysis.keywords || [],
    patternsExtracted: analysis.patterns || [],
    promptSuggestions: analysis.prompt_suggestions || []
  });

  // Keep only last 20 history entries
  if (denylist.learned.history.length > 20) {
    denylist.learned.history = denylist.learned.history.slice(-20);
  }

  log('INFO', `Applied learned patterns: ${keywordsAdded} keywords, ${patternsAdded} patterns`);
  return { keywordsAdded, patternsAdded };
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
      const { keywordsAdded, patternsAdded } = applyLearnedPatterns(denylist, analysis);
      
      if (keywordsAdded > 0 || patternsAdded > 0 || analysis.prompt_suggestions?.length > 0) {
        log('INFO', 'LLM learning applied', { 
          summary: analysis.summary,
          categories: analysis.categories,
          newKeywords: keywordsAdded,
          promptSuggestions: analysis.prompt_suggestions?.length || 0
        });
        
        // Log prompt suggestions for review
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
