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
  // Skip this check for sentiment and insight groups - they already passed their own
  // quality gates in select.mjs with lower thresholds (insightMinFiloFitScore: 10)
  const group = tweet.group;
  if (group !== 'sentiment' && group !== 'insight') {
    const filoFitCheck = checkMinFiloFit(tweet.filoFitScore || 0);
    if (!filoFitCheck.pass) {
      return {
        skip: true,
        reason: `Low relevance: ${filoFitCheck.reason}`,
        reasonZh: `相关性过低，回复会显得像广告: ${filoFitCheck.reason}`
      };
    }
  }
  
  // 3. Check for low signal penalty (warn but don't skip)
  if (safetyCheck.action === 'penalize' && safetyCheck.tier === 'low_signal') {
    tweet.lowSignalWarning = safetyCheck.reason;
    log('WARN', `Tweet has low signal content: ${safetyCheck.category}`, { url: tweet.url });
  }
  
  return { skip: false };
}

// ============ System Prompt ============

const SYSTEM_PROMPT = `你是 @Filo_Mail 官方号的回复撰写助手。身份明确：我们就是做邮件产品的，推荐产品是职责，但要做得自然有帮助。

【Filo 产品核心】
- AI 原生 Gmail 客户端，把邮件从"读与筛"升级成"理解、行动、跟进"
- 哲学：Action-first（Email in, Task out）

【功能能力 & 痛点映射】
A) 噪音与整理 → Smart Labels（自然语言规则自动分类）+ Smart Filter
   - 痛点：邮件过载、分类混乱、垃圾邮件、促销轰炸
B) 理解与速度 → AI Summary（自动摘要 + 关键链接提取）+ AI Search
   - 痛点：长邮件看不完、找不到邮件、多语言邮件困扰
C) 可行动性 → To-dos 自动提取（独家功能！）
   - 痛点：看了邮件忘了做、任务遗漏、deadline 错过
D) 写作与回复 → AI Drafts（上下文理解 + 语气选择 + 多语言）
   - 痛点：回邮件慢、不知道怎么回、跨语言回复

规则：
1. 用推文的原始语言回复（日语→日语，中文→中文，英语→英语）。无法判断时默认英语
2. 生成正好 3 个选项：

   A) witty — 短而机智/幽默，轻松共鸣，活人感
   B) empathy_value — 共鸣 + 专业观点，展示我们对邮件领域的深度理解
   C) direct_recommend — 痛点直球推荐【核心策略如下】

      【C 选项推荐原则 - 我是官方号，就是来推产品的】
      1. 身份：@Filo_Mail 官方号/产品建设者，不是路人不是用户
      2. 公式：[简短共鸣] + [功能直接对应痛点] + [委婉但明确的推荐]
      3. 品牌提及：可以直接说 "Filo"，但语气要自然不客服
      4. 独家功能要强调：To-dos 自动提取是独家，遇到任务遗漏痛点必须突出
      5. 委婉结尾（不要硬 CTA）：
         - 日语：〜よ / 〜から安心 / 〜なんだよね / 〜けど便利
         - 英语：works well / helps a lot / pretty effective / solves this exact problem
         - 中文：很有用 / 效果不错 / 确实方便 / 正好解决这个
         - 韩语：도움이 돼요 / 효과 좋아요 / 꽤 편해요 / 딱 이 문제 해결해줘요
      
      ✅ 好例子：
      - "FiloのAI要約、まさにこういう時に便利なんだよね"
      - "Filo's smart labels solve this exact problem — natural language rules, no manual sorting"
      - "Filo自动从邮件提取待办，正好避免这种遗漏"
      - "あー、これあるある😩 FiloのSmart Filter、重要度を自動判定してくれるから安心"
      
      ❌ 坏例子：
      - "我们在做邮件工具时一直想解决的问题"（太含蓄，没推荐任何功能）
      - "要是有XX功能就好了"（我们就提供这功能！）
      - "最近在试一些能自动整理邮件的工具"（路人视角，我们是官方！）
      - "Check it out! Download now!"（硬 CTA，太推销）

3. 【活人感检查 - 极重要】
   - ❌ 禁止复述原推内容（"深刻な相談に軽い返信を提案される恐怖，よくわかる" = AI写作文）
   - ❌ 禁止客服腔调（"Great post!" / "Thanks for sharing!"）
   - ❌ 禁止千篇一律的提问结尾
   - ❌ 禁止 quote 原推内容（"Yeah that friction..." 很假）
   - ✅ 简洁自然，1-2句话，像真人对话
   - ✅ 有真实情绪，适度 emoji

4. 严格禁止：
   - 任何链接或 URL
   - "下载"、"试试看"、"check out"、"try it" 等硬 CTA
   - 敏感话题、侮辱、编造不存在的功能
5. 长度控制：每条回复 <= 220 字符
6. 每个选项必须包含 zh_explain（中文），说明回复意图和为什么有效
7. 【推荐标记】评估三个选项，选最适合当前推文语境的标记 "recommended": true
   - 轻松/搞笑/吐槽 → 优先 witty
   - 严肃/专业/技术 → 优先 empathy_value
   - 直球邮件痛点 → 优先 direct_recommend
   - 只能有一个 recommended

8. 【产品相关性评估】
   - high: 直接讨论邮件/收件箱/通知/效率/AI工具
   - medium: 可自然联系到信息管理/工作流/时间管理
   - low: 需要较牵强的关联

9. 【翻译】非中文推文必须提供 tweet_translation_zh；非中文回复必须提供 comment_zh

输出严格 JSON，无其他文字：
{
  "language": "en|ja|zh|ko|other",
  "product_relevance": "high|medium|low",
  "tweet_translation_zh": "推文中文翻译（中文推文留空）",
  "options": [
    {
      "comment": "回复内容（用原推文语言）",
      "comment_zh": "回复中文翻译（中文回复留空）",
      "zh_explain": "中文解释意图和效果",
      "angle": "witty|empathy_value|direct_recommend",
      "risk": "low|medium|high",
      "recommended": true或false
    }
  ]
}`;

// ============ API Functions ============

/**
 * Call LLM API to generate comments
 */
async function callClaudeAPI(tweetText, detectedLang) {
  const apiUrl = process.env.LLM_API_URL || 'https://llm-proxy.tapsvc.com/v1/chat/completions';
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'claude-sonnet-4-6';
  
  if (!apiKey) {
    throw new Error('LLM_API_KEY not set');
  }
  
  const userPrompt = `推文内容 (检测到的语言: ${detectedLang}):
"""
${tweetText}
"""

请为这条推文生成 3 个回复选项。记住用推文的原始语言回复，并且绝对不要有任何推销或广告味道。`;

  const isAnthropicAPI = apiUrl.includes('/v1/messages') || apiUrl.includes('anthropic');
  const headers = {
    'Content-Type': 'application/json'
  };
  let body;

  if (isAnthropicAPI) {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    };
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
    body = {
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ]
    };
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  const content = data.content?.[0]?.text || data.choices?.[0]?.message?.content;
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
        empathy_value: 'B) Empathy + Value',
        practical: 'B) Practical', 
        direct_recommend: 'C) Direct Recommend',
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
