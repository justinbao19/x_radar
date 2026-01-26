import { readFileSync, writeFileSync } from 'fs';
import { log, detectLanguage, extractJSON, sleep, getInputPath, getOutputPath, copyToLatest, getOutputDir, logOutputPaths } from './utils.mjs';
import { checkBrandSafety, checkMinFiloFit, MIN_FILO_FIT } from './safety.mjs';
import { generateHTMLReport } from './html-report.mjs';
import 'dotenv/config';

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 2000;

// ============ Safety Check for Comment Generation ============

/**
 * Check if tweet should be skipped for comment generation
 * Returns SKIP with reason or allows comment generation
 * @param {Object} tweet - Tweet object from selection
 * @returns {{ skip: boolean, reason?: string, reasonZh?: string }}
 */
function shouldSkipTweet(tweet) {
  // 1. Brand Safety check (second pass to catch any that slipped through)
  const safetyCheck = checkBrandSafety(tweet.text, tweet.filoFitScore || 0);
  
  if (safetyCheck.action === 'drop') {
    return {
      skip: true,
      reason: `Brand Safety [${safetyCheck.tier}]: ${safetyCheck.reason}`,
      reasonZh: `品牌安全过滤 [${safetyCheck.tier === 'hard' ? '硬过滤' : '软过滤'}]: ${safetyCheck.reason}`
    };
  }
  
  // 2. Minimum FiloFit check
  const filoFitCheck = checkMinFiloFit(tweet.filoFitScore || 0);
  if (!filoFitCheck.pass) {
    return {
      skip: true,
      reason: `Low relevance: ${filoFitCheck.reason}`,
      reasonZh: `相关性过低，回复会显得像广告: ${filoFitCheck.reason}`
    };
  }
  
  // 3. Check for low signal penalty (warn but don't skip)
  if (safetyCheck.action === 'penalize' && safetyCheck.tier === 'low_signal') {
    tweet.lowSignalWarning = safetyCheck.reason;
    log('WARN', `Tweet has low signal content: ${safetyCheck.category}`, { url: tweet.url });
  }
  
  return { skip: false };
}

// ============ System Prompt ============

const SYSTEM_PROMPT = `你是一个帮助产品人员撰写 X (Twitter) 回复的助手。

产品背景：一个帮助用户管理邮箱的工具，核心功能包括：
- 减少收件箱噪音
- 智能摘要邮件内容
- 将邮件转为待办任务
- 更好的搜索和整理

规则：
1. 用推文的原始语言回复（如果是日语推文就用日语，中文推文就用中文，英语推文就用英语）
2. 如果无法判断语言，默认用英语
3. 生成正好 3 个选项：
   A) witty - 短而机智/幽默的回复，轻松共鸣
   B) practical - 务实的、产品建设者视角的回复，展示思考
   C) subtle_product - 微妙的产品角度，暗示在做相关产品但不推销
4. 严格禁止（Non-salesy 原则）：
   - 任何链接或 URL
   - "下载"、"试试"、"查看"、"check out" 等 CTA 用语
   - 直接提及产品名称（除非对话中真的非常自然）
   - 敏感话题、侮辱、编造具体功能
   - 任何听起来像广告或推销的内容
5. 长度控制：每条回复尽量 <= 220 字符
6. 每个选项必须包含中文解释 (zh_explain)，说明这条回复的意图和为什么有效
7. 【重要】评估三个选项，选出最适合当前推文语境的那个，在该选项中标记 "recommended": true
   - 考虑因素：推文的情绪基调、话题敏感度、作者身份、互动潜力
   - 【关键】不要机械地总是选择 practical！要真正根据推文特点判断：
     * 轻松/搞笑/吐槽类推文 → 优先考虑 witty（幽默回应更自然）
     * 严肃/专业/技术类推文 → 优先考虑 practical（务实回应更合适）
     * 产品相关/痛点类推文 → 优先考虑 subtle_product（暗示产品更有效）
   - 只能有一个选项标记为 recommended

8. 【自然关联原则 - 极其重要】即使推文不直接涉及邮件/效率话题，也要找到自然的连接点：
   - 可以从这些角度切入：信息管理、注意力、效率、沟通、时间管理、信息过载、工作流
   - 可以用自然的过渡方式：
     * "这让我想到..." / "This reminds me of..."
     * "作为天天处理邮件的人..." / "As someone who deals with inbox chaos..."
     * "说到信息过载..." / "Speaking of information overload..."
   - 【核心目标】让人感觉到你是一个关注效率、信息管理、AI工具的人，即使不提产品
   - 如果推文实在无法关联（纯娱乐/完全无关），在 zh_explain 中标注"低产品相关"

9. 【回复质量标准】好的回复应该：
   - 让人觉得有意思、有见地，愿意点赞或互动
   - 即使不提产品，也让人感觉到你在效率/AI/信息管理领域有思考
   - 避免空洞的赞美、无意义的附和、或者纯粹的"哈哈好笑"
   - 增加互动潜力：可以提问、分享观点、或引发讨论

10. 【产品相关性评估】评估这条推文与我们产品领域（邮件、效率、AI）的相关程度：
    - high: 直接讨论邮件/收件箱/通知/效率/AI工具
    - medium: 可以自然联系到信息管理/工作流/时间管理
    - low: 需要较牵强的关联或完全无关

11. 【推文翻译】如果原推文不是中文，必须提供中文翻译：
    - 翻译要准确、自然，保持原文语气
    - 如果原推文已经是中文，则 tweet_translation_zh 为空字符串或省略

输出严格的 JSON 格式，不要有任何其他文字：
{
  "language": "en|ja|zh|other",
  "product_relevance": "high|medium|low",
  "tweet_translation_zh": "推文的中文翻译（仅非中文推文需要，中文推文留空）",
  "options": [
    {
      "comment": "回复内容（用原推文语言）",
      "zh_explain": "中文解释这条回复的意图和效果",
      "angle": "witty|practical|subtle_product",
      "risk": "low|medium|high",
      "recommended": true或false
    }
  ]
}`;

// ============ API Functions ============

/**
 * Call Claude API to generate comments
 */
async function callClaudeAPI(tweetText, detectedLang) {
  const apiUrl = process.env.LLM_API_URL || 'https://api.anthropic.com/v1/messages';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
  
  if (!apiKey) {
    throw new Error('LLM_API_KEY not set');
  }
  
  const userPrompt = `推文内容 (检测到的语言: ${detectedLang}):
"""
${tweetText}
"""

请为这条推文生成 3 个回复选项。记住用推文的原始语言回复，并且绝对不要有任何推销或广告味道。`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
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
  
  return content;
}

/**
 * Generate comments for a single tweet with retries
 */
async function generateComments(tweet, retries = MAX_RETRIES) {
  const detectedLang = detectLanguage(tweet.text);
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log('DEBUG', `Generating comments (attempt ${attempt})`, { 
        url: tweet.url, 
        lang: detectedLang 
      });
      
      const rawResponse = await callClaudeAPI(tweet.text, detectedLang);
      const parsed = extractJSON(rawResponse);
      
      if (!parsed || !parsed.options || !Array.isArray(parsed.options)) {
        throw new Error('Invalid response format');
      }
      
      if (parsed.options.length !== 3) {
        log('WARN', `Expected 3 options, got ${parsed.options.length}`);
      }
      
      // Only include translation if language is not Chinese
      const needsTranslation = parsed.language !== 'zh' && detectedLang !== 'zh';
      const translation = needsTranslation ? (parsed.tweet_translation_zh || '') : '';
      
      return {
        language: parsed.language || detectedLang,
        productRelevance: parsed.product_relevance || 'medium',
        tweetTranslationZh: translation,
        generatedAt: new Date().toISOString(),
        options: parsed.options.map(opt => ({
          comment: opt.comment || '',
          zh_explain: opt.zh_explain || '',
          angle: opt.angle || 'unknown',
          charCount: (opt.comment || '').length,
          risk: opt.risk || 'low',
          recommended: opt.recommended === true
        }))
      };
      
    } catch (err) {
      log('WARN', `LLM attempt ${attempt}/${retries} failed`, { 
        tweet: tweet.url, 
        error: err.message 
      });
      
      if (attempt < retries) {
        const delay = RETRY_DELAY_BASE * attempt;
        await sleep(delay);
      }
    }
  }
  
  log('ERROR', 'LLM generation failed after all retries', { tweet: tweet.url });
  return null;
}

// ============ Markdown Generation ============

/**
 * Generate markdown report with comments
 */
function generateMarkdownWithComments(data) {
  const lines = [];
  
  // Header
  lines.push('# X Radar Report with Comments');
  lines.push(`**Generated:** ${data.runAt}`);
  lines.push('');
  
  // Stats
  lines.push('## Comment Generation Stats');
  lines.push('');
  lines.push(`- **Total tweets:** ${data.commentGenerationStats?.total || 0}`);
  lines.push(`- **Succeeded:** ${data.commentGenerationStats?.succeeded || 0}`);
  lines.push(`- **Skipped (safety/relevance):** ${data.commentGenerationStats?.skipped || 0}`);
  lines.push(`- **Failed (API error):** ${data.commentGenerationStats?.failed || 0}`);
  
  if (data.commentGenerationStats?.skipReasons && Object.keys(data.commentGenerationStats.skipReasons).length > 0) {
    const reasons = Object.entries(data.commentGenerationStats.skipReasons)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    lines.push(`- **Skip reasons:** ${reasons}`);
  }
  
  if (data.commentGenerationStats?.byLanguage && Object.keys(data.commentGenerationStats.byLanguage).length > 0) {
    const langs = Object.entries(data.commentGenerationStats.byLanguage)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    lines.push(`- **By language:** ${langs}`);
  }
  
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Tweets with comments
  for (const tweet of data.top || []) {
    const groupLabel = tweet.originalGroup === 'kol' ? 'kol/reach' : tweet.group;
    
    lines.push(`## #${tweet.rank} [${groupLabel}] ${tweet.author || 'Unknown'}`);
    lines.push('');
    const relevanceLabel = tweet.comments?.productRelevance 
      ? `| **产品相关:** ${tweet.comments.productRelevance}` 
      : '';
    lines.push(`**Score:** ${tweet.finalScore} | **FiloFit:** ${tweet.filoFitKeywordCount || 0} keywords | **Lang:** ${tweet.detectedLanguage || 'unknown'} ${relevanceLabel}`);
    lines.push('');
    lines.push('> ' + (tweet.text || '*No text*').split('\n').join('\n> '));
    lines.push('');
    lines.push(`[View Tweet](${tweet.url})`);
    lines.push('');
    
    if (tweet.commentSkipped) {
      // Show SKIP reason
      lines.push('### ⏭️ SKIPPED');
      lines.push('');
      lines.push(`**Reason:** ${tweet.skipReason || 'Unknown'}`);
      lines.push('');
      lines.push(`**中文原因:** ${tweet.skipReasonZh || '未知'}`);
      lines.push('');
    } else if (tweet.comments && tweet.comments.options) {
      lines.push('### Reply Options');
      lines.push('');
      
      // Show warnings if any
      if (tweet.lowSignalWarning) {
        lines.push(`**⚠️ Warning:** ${tweet.lowSignalWarning}`);
        lines.push('');
      }
      
      const angleLabels = { 
        witty: 'A) Witty', 
        practical: 'B) Practical', 
        subtle_product: 'C) Subtle Product' 
      };
      
      for (const opt of tweet.comments.options) {
        const label = angleLabels[opt.angle] || opt.angle;
        lines.push(`**${label}** (${opt.charCount} chars, risk: ${opt.risk})`);
        lines.push('');
        lines.push(`> ${opt.comment}`);
        lines.push('');
        lines.push(`**中文解释:** ${opt.zh_explain}`);
        lines.push('');
      }
    } else if (tweet.commentError) {
      lines.push(`**❌ Comment generation failed:** ${tweet.commentError}`);
      lines.push('');
    } else {
      lines.push('*No comments generated*');
      lines.push('');
    }
    
    lines.push('---');
    lines.push('');
  }
  
  lines.push('*Report generated by X Radar*');
  
  return lines.join('\n');
}

// ============ Main ============

async function main() {
  log('INFO', '=== Starting Comment Generation ===');
  log('INFO', `Config: MIN_FILO_FIT=${MIN_FILO_FIT}`);
  
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
  const outputJsonFile = getOutputPath('top10_with_comments.json', runDate);
  const outputMdFile = getOutputPath('top10_with_comments.md', runDate);
  
  log('INFO', `Loaded data from ${inputFile}`, { 
    tweets: data.top?.length,
    runDate: runDate 
  });
  
  if (!data.top || data.top.length === 0) {
    log('WARN', 'No tweets to process');
    writeFileSync(outputJsonFile, JSON.stringify({ ...data, commentGenerationStats: { total: 0 } }, null, 2));
    writeFileSync(outputMdFile, '# X Radar Report\n\n*No tweets found*\n');
    copyToLatest(getOutputDir(runDate));
    log('INFO', 'Copied to out/latest/');
    return;
  }
  
  // Stats
  const stats = {
    total: data.top.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    skipReasons: {},
    byLanguage: {},
    byProductRelevance: { high: 0, medium: 0, low: 0 }
  };
  
  // Process each tweet
  for (const tweet of data.top) {
    const detectedLang = detectLanguage(tweet.text);
    tweet.detectedLanguage = detectedLang;
    
    // Safety check
    const skipCheck = shouldSkipTweet(tweet);
    if (skipCheck.skip) {
      tweet.comments = null;
      tweet.commentSkipped = true;
      tweet.skipReason = skipCheck.reason;
      tweet.skipReasonZh = skipCheck.reasonZh;
      stats.skipped++;
      
      // Track skip reasons
      const reasonKey = skipCheck.reason.split(':')[0].trim();
      stats.skipReasons[reasonKey] = (stats.skipReasons[reasonKey] || 0) + 1;
      
      log('INFO', `SKIP tweet #${tweet.rank}: ${skipCheck.reason}`, { url: tweet.url });
      continue;
    }
    
    // Generate comments
    const comments = await generateComments(tweet);
    
    if (comments) {
      tweet.comments = comments;
      tweet.commentError = null;
      tweet.commentSkipped = false;
      stats.succeeded++;
      
      const lang = comments.language || detectedLang;
      stats.byLanguage[lang] = (stats.byLanguage[lang] || 0) + 1;
      
      // Track product relevance
      const relevance = comments.productRelevance || 'medium';
      stats.byProductRelevance[relevance] = (stats.byProductRelevance[relevance] || 0) + 1;
      
      log('INFO', `Generated comments for tweet #${tweet.rank}`, { 
        lang, 
        options: comments.options.length,
        productRelevance: relevance
      });
    } else {
      tweet.comments = null;
      tweet.commentError = 'Generation failed after retries';
      tweet.commentSkipped = false;
      stats.failed++;
    }
    
    // Delay between API calls
    await sleep(1000);
  }
  
  // Output
  const output = {
    ...data,
    commentGenerationStats: stats
  };
  
  writeFileSync(outputJsonFile, JSON.stringify(output, null, 2));
  log('INFO', `JSON output written to ${outputJsonFile}`);
  
  const markdown = generateMarkdownWithComments(output);
  writeFileSync(outputMdFile, markdown);
  log('INFO', `Markdown output written to ${outputMdFile}`);
  
  // Generate HTML report
  const outputHtmlFile = getOutputPath('top10_with_comments.html');
  const html = generateHTMLReport(output);
  writeFileSync(outputHtmlFile, html);
  log('INFO', `HTML report written to ${outputHtmlFile}`);
  
  // Copy to latest directory (final step of pipeline)
  copyToLatest(getOutputDir(runDate));
  log('INFO', 'Copied to out/latest/');
  
  // Print clear path summary (final step shows all paths)
  logOutputPaths(runDate);
  
  log('INFO', '=== Comment Generation Complete ===', stats);
}

main().catch(err => {
  log('ERROR', 'Commenter crashed', { error: err.message });
  process.exit(1);
});
