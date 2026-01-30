import { NextRequest, NextResponse } from 'next/server';
import { getCachedComments, saveCachedComments } from '@/lib/supabase';
import { TweetComments, ReplyOption } from '@/lib/types';

// ============ System Prompt (from commenter.mjs) ============

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

11. 【回复翻译】如果回复不是中文，也要提供中文翻译：
    - 帮助中文用户理解回复内容
    - 如果回复已经是中文，则 comment_zh 为空字符串或省略

输出严格的 JSON 格式，不要有任何其他文字：
{
  "language": "en|ja|zh|other",
  "product_relevance": "high|medium|low",
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

// ============ API Request Types ============

interface GenerateCommentRequest {
  tweetUrl: string;
  tweetText: string;
  language: string;
}

// ============ Helper Functions ============

function extractJSON(text: string): Record<string, unknown> | null {
  if (!text) return null;
  
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Try to fix common issues
    const fixed = jsonMatch[0]
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/'/g, '"');
    
    try {
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

async function callClaudeAPI(tweetText: string, language: string): Promise<TweetComments> {
  const apiKey = process.env.LLM_API_KEY;
  const apiUrl = process.env.LLM_API_URL || 'https://api.anthropic.com/v1/messages';
  const model = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
  
  if (!apiKey) {
    throw new Error('LLM_API_KEY not configured');
  }
  
  const userPrompt = `推文内容 (检测到的语言: ${language}):
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
    throw new Error(`Claude API error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  const content = data.content?.[0]?.text;
  
  if (!content) {
    throw new Error('No content in Claude API response');
  }
  
  const parsed = extractJSON(content);
  
  if (!parsed || !parsed.options || !Array.isArray(parsed.options)) {
    throw new Error('Invalid response format from Claude API');
  }
  
  // Transform to TweetComments format
  const options: ReplyOption[] = (parsed.options as Array<Record<string, unknown>>).map((opt) => ({
    comment: String(opt.comment || ''),
    comment_zh: opt.comment_zh ? String(opt.comment_zh) : undefined,
    zh_explain: String(opt.zh_explain || ''),
    angle: (opt.angle as 'witty' | 'practical' | 'subtle_product') || 'practical',
    charCount: String(opt.comment || '').length,
    risk: (opt.risk as 'low' | 'medium' | 'high') || 'low',
    recommended: opt.recommended === true
  }));
  
  return {
    language: String(parsed.language || 'other'),
    generatedAt: new Date().toISOString(),
    productRelevance: (parsed.product_relevance as 'high' | 'medium' | 'low') || 'medium',
    options
  };
}

// ============ API Route Handler ============

export async function POST(request: NextRequest) {
  try {
    const body: GenerateCommentRequest = await request.json();
    
    // Validate request
    if (!body.tweetUrl || !body.tweetText) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: tweetUrl, tweetText' },
        { status: 400 }
      );
    }
    
    // Check cache first
    const cached = await getCachedComments(body.tweetUrl);
    if (cached) {
      return NextResponse.json({
        success: true,
        cached: true,
        comments: cached
      });
    }
    
    // Generate new comments
    const comments = await callClaudeAPI(body.tweetText, body.language || 'other');
    
    // Save to cache (don't await, fire and forget)
    saveCachedComments(body.tweetUrl, body.tweetText, body.language || 'other', comments)
      .catch(err => console.error('Failed to cache comments:', err));
    
    return NextResponse.json({
      success: true,
      cached: false,
      comments
    });
    
  } catch (error) {
    console.error('Generate comment error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for specific error types
    if (errorMessage.includes('LLM_API_KEY')) {
      return NextResponse.json(
        { success: false, error: 'API not configured' },
        { status: 503 }
      );
    }
    
    if (errorMessage.includes('Claude API error')) {
      return NextResponse.json(
        { success: false, error: 'AI service temporarily unavailable' },
        { status: 502 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
