import { readFileSync, writeFileSync } from 'fs';
import { log, detectLanguage, extractJSON, sleep } from './utils.mjs';
import 'dotenv/config';

const INPUT_FILE = 'out/top10.json';
const OUTPUT_JSON = 'out/top10_with_comments.json';
const OUTPUT_MD = 'out/top10_with_comments.md';

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 2000;

// System prompt for comment generation
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
4. 严格禁止：
   - 任何链接或 URL
   - "下载"、"试试"、"查看" 等 CTA 用语
   - 直接提及产品名称（除非对话中真的非常自然）
   - 敏感话题、侮辱、编造具体功能
5. 长度控制：每条回复尽量 <= 220 字符
6. 每个选项必须包含中文解释 (zh_explain)，说明这条回复的意图和为什么有效

输出严格的 JSON 格式，不要有任何其他文字：
{
  "language": "en|ja|zh|other",
  "options": [
    {
      "comment": "回复内容（用原推文语言）",
      "zh_explain": "中文解释这条回复的意图和效果",
      "angle": "witty|practical|subtle_product",
      "risk": "low|medium|high"
    }
  ]
}`;

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

请为这条推文生成 3 个回复选项。记住用推文的原始语言回复。`;

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
  
  // Extract text from Claude response
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
      log('DEBUG', `Generating comments for tweet (attempt ${attempt})`, { 
        url: tweet.url, 
        lang: detectedLang 
      });
      
      const rawResponse = await callClaudeAPI(tweet.text, detectedLang);
      const parsed = extractJSON(rawResponse);
      
      if (!parsed || !parsed.options || !Array.isArray(parsed.options)) {
        throw new Error('Invalid response format');
      }
      
      // Validate options
      if (parsed.options.length !== 3) {
        log('WARN', `Expected 3 options, got ${parsed.options.length}`);
      }
      
      return {
        language: parsed.language || detectedLang,
        generatedAt: new Date().toISOString(),
        options: parsed.options.map(opt => ({
          comment: opt.comment || '',
          zh_explain: opt.zh_explain || '',
          angle: opt.angle || 'unknown',
          charCount: (opt.comment || '').length,
          risk: opt.risk || 'low'
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

/**
 * Generate markdown with comments
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
  lines.push(`- **Failed:** ${data.commentGenerationStats?.failed || 0}`);
  if (data.commentGenerationStats?.byLanguage) {
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
    lines.push(`**Score:** ${tweet.finalScore} | **Lang:** ${tweet.detectedLanguage || 'unknown'}`);
    lines.push('');
    lines.push('> ' + (tweet.text || '*No text*').split('\n').join('\n> '));
    lines.push('');
    lines.push(`[View Tweet](${tweet.url})`);
    lines.push('');
    
    if (tweet.comments && tweet.comments.options) {
      lines.push('### Reply Options');
      lines.push('');
      
      const angleLabels = { witty: 'A) Witty', practical: 'B) Practical', subtle_product: 'C) Subtle Product' };
      
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
      lines.push(`**Comment generation failed:** ${tweet.commentError}`);
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

async function main() {
  log('INFO', 'Starting comment generation');
  
  // Check API key
  if (!process.env.LLM_API_KEY) {
    log('ERROR', 'LLM_API_KEY environment variable not set');
    process.exit(1);
  }
  
  // Read input data
  const data = JSON.parse(readFileSync(INPUT_FILE, 'utf-8'));
  log('INFO', `Loaded data from ${INPUT_FILE}`, { tweets: data.top?.length });
  
  if (!data.top || data.top.length === 0) {
    log('WARN', 'No tweets to process');
    writeFileSync(OUTPUT_JSON, JSON.stringify({ ...data, commentGenerationStats: { total: 0 } }, null, 2));
    writeFileSync(OUTPUT_MD, '# X Radar Report\n\n*No tweets found*\n');
    return;
  }
  
  // Generate comments for each tweet
  const stats = {
    total: data.top.length,
    succeeded: 0,
    failed: 0,
    byLanguage: {}
  };
  
  for (const tweet of data.top) {
    const detectedLang = detectLanguage(tweet.text);
    tweet.detectedLanguage = detectedLang;
    
    const comments = await generateComments(tweet);
    
    if (comments) {
      tweet.comments = comments;
      tweet.commentError = null;
      stats.succeeded++;
      
      const lang = comments.language || detectedLang;
      stats.byLanguage[lang] = (stats.byLanguage[lang] || 0) + 1;
      
      log('INFO', `Comments generated for tweet #${tweet.rank}`, { 
        lang, 
        options: comments.options.length 
      });
    } else {
      tweet.comments = null;
      tweet.commentError = 'Generation failed after retries';
      stats.failed++;
    }
    
    // Delay between API calls
    await sleep(1000);
  }
  
  // Prepare output
  const output = {
    ...data,
    commentGenerationStats: stats
  };
  
  // Write JSON output
  writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));
  log('INFO', `JSON output written to ${OUTPUT_JSON}`);
  
  // Write markdown output
  const markdown = generateMarkdownWithComments(output);
  writeFileSync(OUTPUT_MD, markdown);
  log('INFO', `Markdown output written to ${OUTPUT_MD}`);
  
  log('INFO', 'Comment generation complete', stats);
}

main().catch(err => {
  log('ERROR', 'Commenter crashed', { error: err.message });
  process.exit(1);
});
