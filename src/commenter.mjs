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
  // 0. Skip sentiment and insight tweets (monitoring only, no engagement needed)
  if (tweet.group === 'sentiment') {
    return {
      skip: true,
      reason: 'Sentiment monitoring tweet - no comment needed',
      reasonZh: '舆情监测推文 - 仅用于监测，无需评论'
    };
  }
  if (tweet.group === 'insight') {
    return {
      skip: true,
      reason: 'User insight tweet - for analysis only',
      reasonZh: '用户洞察推文 - 仅用于分析，无需评论'
    };
  }
  
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

【Filo 产品内部上下文 - 仅供关联参考，非营销文案】
- FiloMail 是一个 AI 原生的邮件客户端，专为 Gmail 设计
- 核心定位：减少收件箱噪音、帮用户捕捉重要信息、将邮件转为行动

功能能力（仅在与推文直接相关时使用）：
A) 噪音与整理
   - 智能标签/自动分类（促销、更新、订阅、收据）
   - 专注通知（减少打扰，突出重要发件人/话题）

B) 理解与速度
   - 长邮件/长线程的即时摘要
   - AI 辅助搜索（如未确认上线，用"正在探索/开发中"）

C) 可行动性
   - 邮件 → 待办/任务（Task Agent 概念）
   - 跟进提醒（如未确认上线，用"正在探索"）

D) 写作与回复
   - AI 撰写/回复建议
   - 内联 AI 编辑（改写选中部分：语气、清晰度、长短）
   - AI 翻译

【痛点→功能映射】为 subtle_product 风格选择最相关的 1 个（最多 2 个）功能暗示：
- 推文抱怨促销/订阅/垃圾邮件 → A 噪音整理
- 推文说漏看重要邮件 → A + 专注通知
- 推文说邮件线程太长看不完 → B 摘要
- 推文说"看了但忘了做" → C 邮件→待办
- 推文说回邮件慢/难 → D 撰写/编辑

规则：
1. 用推文的原始语言回复（如果是日语推文就用日语，中文推文就用中文，英语推文就用英语）
2. 如果无法判断语言，默认用英语
3. 生成正好 3 个选项：
   A) witty - 短而机智/幽默的回复，轻松共鸣
   B) practical - 务实的、产品建设者视角的回复，展示思考
   C) subtle_product - 产品植入风格【严格遵守以下植入规则】
      
      植入原则：
      1. 【身份定位】你是 Filo Mail 官方/产品建设者，不是路人。用"我们在做..."、"作为做邮件工具的人..."等第一人称产品视角
      2. 先共情或幽默，产品暗示是"次要的" - 1 个短句或 1 个短从句，最多
      3. 【品牌提及规则】优先使用间接引用（如"我们在做邮件工具"）。如果提及品牌名，最多一次，且绝不能是 CTA 或推销语气
      4. 绝不以标语/口号结尾
      5. 不确定功能是否上线时，说"正在做/探索/试验"
      6. 不要链接
      
      示例（以官方/产品建设者身份）：
      - ❌ "我们的 FiloMail 可以帮你..."（太销售、CTA 味道）
      - ❌ "邮件管理确实是个痛点"（完全没有产品暗示）
      - ❌ "最近在试一些能自动整理邮件的工具"（路人视角，我们是官方不是路人）
      - ✅ "这也是我们在做邮件工具时一直想解决的问题"
      - ✅ "作为天天研究 inbox 问题的人，太懂这个痛了"
      - ✅ "我们做邮件摘要功能的时候也发现，长线程真的是生产力杀手"
      - ✅ "As someone building email tools, this hits different..."
      - ✅ "正在探索怎么让邮件自动变成待办，这个需求太真实了"

4. 严格禁止（Non-salesy 原则）：
   - 任何链接或 URL
   - "下载"、"试试"、"查看"、"check out" 等 CTA 用语
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

12. 【回复翻译】如果回复不是中文，也要提供中文翻译：
    - 帮助中文用户理解回复内容
    - 如果回复已经是中文，则 comment_zh 为空字符串或省略

输出严格的 JSON 格式，不要有任何其他文字：
{
  "language": "en|ja|zh|other",
  "product_relevance": "high|medium|low",
  "tweet_translation_zh": "推文的中文翻译（仅非中文推文需要，中文推文留空）",
  "options": [
    {
      "comment": "回复内容（用原推文语言）",
      "comment_zh": "回复内容的中文翻译（仅非中文回复需要，中文回复留空）",
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
        options: parsed.options.map(opt => {
          // Only include comment_zh if the reply is not in Chinese
          const replyNeedsTranslation = needsTranslation && opt.comment_zh;
          return {
            comment: opt.comment || '',
            comment_zh: replyNeedsTranslation ? opt.comment_zh : '',
            zh_explain: opt.zh_explain || '',
            angle: opt.angle || 'unknown',
            charCount: (opt.comment || '').length,
            risk: opt.risk || 'low',
            recommended: opt.recommended === true
          };
        })
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
  lines.push(`- **AI Picked:** ${data.commentGenerationStats?.aiPicked || 0}`);
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
    const aiPickedMark = tweet.aiPicked ? '⭐' : '';
    
    lines.push(`## #${tweet.rank} ${aiPickedMark}[${groupLabel}] ${tweet.author || 'Unknown'}`);
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
  const aiPickedCount = data.top.filter(t => t.aiPicked).length;
  const stats = {
    total: data.top.length,
    aiPicked: aiPickedCount,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    skipReasons: {},
    byLanguage: {},
    byProductRelevance: { high: 0, medium: 0, low: 0 }
  };
  
  log('INFO', `Processing ${data.top.length} tweets (${aiPickedCount} AI-picked)`);
  
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
