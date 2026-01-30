import { readFileSync, writeFileSync } from 'fs';
import { log, detectLanguage, extractJSON, sleep, getInputPath, getOutputPath, copyToLatest, getOutputDir, logOutputPaths } from './utils.mjs';
import 'dotenv/config';

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 2000;

// ============ Translation Prompt ============

const TRANSLATION_SYSTEM_PROMPT = `你是一个专业的社交媒体内容翻译专家，擅长将推文翻译成自然流畅的中文。

翻译原则：

1. **本地化优先**
   - 不要逐字翻译，要让中文读者感觉像是原生内容
   - 理解原文的真实含义后用地道的中文表达
   - 语序和表达习惯要符合中文

2. **保留语气和情感**
   - 幽默的保持幽默，吐槽的保持吐槽感
   - 愤怒/沮丧的保持那种情绪张力
   - 轻松调侃的不要翻译成严肃说教

3. **处理文化差异**
   - 网络用语、缩写、俚语要翻译成对应的中文网络表达
   - 如果有特定文化梗无法直译，可以用括号简要解释
   - 常见缩写如 FOMO、TLDR 等可以保留原文并解释

4. **避免翻译腔**
   - 不要出现"这让我想起..."、"作为...的人"等生硬表达
   - 不要过度使用"的"字
   - 避免欧化长句，该断句就断句

5. **长度控制**
   - 翻译长度应与原文大致相当
   - 不要过度展开解释
   - 简洁有力优于冗长准确

6. **处理特殊内容**
   - @用户名 保持原样
   - #话题标签 保持原样
   - 链接 保持原样
   - emoji 保持原样

输出格式：直接输出翻译后的中文，不需要任何其他说明或引号。`;

// ============ API Functions ============

/**
 * Call Claude API to translate tweet
 */
async function callTranslationAPI(tweetText, detectedLang) {
  const apiUrl = process.env.LLM_API_URL || 'https://api.anthropic.com/v1/messages';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
  
  if (!apiKey) {
    throw new Error('LLM_API_KEY not set');
  }
  
  const langNames = {
    en: '英语',
    ja: '日语',
    ko: '韩语',
    es: '西班牙语',
    fr: '法语',
    de: '德语',
    pt: '葡萄牙语',
    other: '外语'
  };
  
  const langName = langNames[detectedLang] || '外语';
  
  const userPrompt = `请将以下${langName}推文翻译成中文：

${tweetText}`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: TRANSLATION_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) {
    throw new Error('No content in API response');
  }
  
  return content.trim();
}

/**
 * Translate a single tweet with retries
 */
async function translateTweet(tweet, retries = MAX_RETRIES) {
  const detectedLang = detectLanguage(tweet.text);
  
  // Skip if already Chinese
  if (detectedLang === 'zh') {
    return { translation: null, language: 'zh', skipped: true };
  }
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log('DEBUG', `Translating tweet (attempt ${attempt})`, { 
        url: tweet.url, 
        lang: detectedLang 
      });
      
      const translation = await callTranslationAPI(tweet.text, detectedLang);
      
      return {
        translation,
        language: detectedLang,
        skipped: false
      };
      
    } catch (err) {
      log('WARN', `Translation attempt ${attempt}/${retries} failed`, { 
        tweet: tweet.url, 
        error: err.message 
      });
      
      if (attempt < retries) {
        const delay = RETRY_DELAY_BASE * attempt;
        await sleep(delay);
      }
    }
  }
  
  log('ERROR', 'Translation failed after all retries', { tweet: tweet.url });
  return { translation: null, language: detectedLang, skipped: false, error: true };
}

// ============ Main ============

async function main() {
  log('INFO', '=== Starting Translation Process ===');
  
  // Check API key
  if (!process.env.LLM_API_KEY) {
    log('ERROR', 'LLM_API_KEY environment variable not set');
    process.exit(1);
  }
  
  // Read input data from latest (or date-specific directory)
  const inputFile = getInputPath('top10.json');
  const data = JSON.parse(readFileSync(inputFile, 'utf-8'));
  
  // Use runDate from data to ensure consistent directory
  const runDate = data.runDate;
  const outputJsonFile = getOutputPath('top10.json', runDate);
  
  log('INFO', `Loaded data from ${inputFile}`, { 
    tweets: data.top?.length,
    runDate: runDate 
  });
  
  if (!data.top || data.top.length === 0) {
    log('WARN', 'No tweets to process');
    writeFileSync(outputJsonFile, JSON.stringify(data, null, 2));
    copyToLatest(getOutputDir(runDate));
    return;
  }
  
  // Stats
  const stats = {
    total: data.top.length,
    translated: 0,
    skipped: 0,
    failed: 0,
    byLanguage: {}
  };
  
  log('INFO', `Processing ${data.top.length} tweets for translation`);
  
  // Process each tweet
  for (const tweet of data.top) {
    const result = await translateTweet(tweet);
    
    // Update language stats
    const lang = result.language || 'other';
    stats.byLanguage[lang] = (stats.byLanguage[lang] || 0) + 1;
    
    if (result.skipped) {
      // Chinese tweets don't need translation
      tweet.translationZh = null;
      tweet.detectedLanguage = 'zh';
      stats.skipped++;
      log('DEBUG', `Skipped Chinese tweet #${tweet.rank}`, { url: tweet.url });
    } else if (result.error) {
      // Translation failed
      tweet.translationZh = null;
      tweet.detectedLanguage = result.language;
      stats.failed++;
    } else {
      // Translation successful
      tweet.translationZh = result.translation;
      tweet.detectedLanguage = result.language;
      stats.translated++;
      log('INFO', `Translated tweet #${tweet.rank}`, { 
        lang: result.language,
        chars: result.translation?.length || 0
      });
    }
    
    // Delay between API calls (shorter than comment generation)
    if (!result.skipped) {
      await sleep(500);
    }
  }
  
  // Add translation stats to data
  data.translationStats = stats;
  
  // Remove old comment-related fields if present
  // The comments field will be populated on-demand by the frontend
  for (const tweet of data.top) {
    // Keep comments as null - will be generated on-demand
    tweet.comments = null;
    tweet.commentError = null;
    tweet.commentSkipped = false;
  }
  
  // Write output
  writeFileSync(outputJsonFile, JSON.stringify(data, null, 2));
  log('INFO', `Output written to ${outputJsonFile}`);
  
  // Copy to latest directory
  copyToLatest(getOutputDir(runDate));
  log('INFO', 'Copied to out/latest/');
  
  // Print clear path summary
  logOutputPaths(runDate);
  
  log('INFO', '=== Translation Complete ===', stats);
}

main().catch(err => {
  log('ERROR', 'Translator crashed', { error: err.message });
  process.exit(1);
});
