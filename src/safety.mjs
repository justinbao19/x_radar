/**
 * Brand Safety Module
 * Three-tier filtering system using denylist.json
 */

import { readFileSync, existsSync } from 'fs';

// ============ Configuration ============

const DENYLIST_FILE = 'denylist.json';
const MIN_FILO_FIT = parseInt(process.env.MIN_FILO_FIT || '3', 10);  // Raised from 2 to 3
const SOFT_THRESHOLD = 3; // FiloFitScore needed to keep soft-flagged content
const LOW_SIGNAL_PENALTY = 0.2; // Score multiplier for low_signal matches

// ============ Pain Emotion Words ============
// Two tiers: STRONG emotions get full bonus, WEAK signals get partial bonus
// This prevents customer service replies (which often use "issue", "problem") from getting high scores

// STRONG: Real emotional expressions of frustration/pain
const STRONG_PAIN_WORDS = [
  // English - clear emotional expression
  'hate', 'annoying', 'terrible', 'awful', 'horrible', 'worst', 'sucks',
  'nightmare', 'hell', 'useless', 'frustrating', 'frustration', 'frustrated',
  'overwhelming', 'drowning', 'chaos', 'mess', 'disaster', 'ridiculous',
  'can\'t stand', 'sick of', 'fed up', 'driving me crazy',
  // Japanese - clear emotional expression
  'うざい', '最悪', '地獄', 'ひどい', 'イライラ', 'ムカつく', '嫌い',
  '耐えられない', '限界', 'ストレス',
  // Chinese - clear emotional expression
  '烦死', '受不了', '崩溃', '噩梦', '糟糕', '垃圾', '太烦', '无语', '吐了'
];

// WEAK: Neutral problem descriptions - might be user OR customer service
// These get lower bonus and are invalidated if CS reply is detected
const WEAK_PAIN_WORDS = [
  // English - neutral problem words
  'issue', 'issues', 'problem', 'problems', 'bug', 'bugs', 'broken',
  // Japanese - neutral problem words
  '困る', '大変', 'バグ', '問題',
  // Chinese - neutral problem words  
  '问题', '找不到', '难用', '太多'
];

// Combined for backward compatibility (checkPainEmotion uses this)
const PAIN_EMOTION_WORDS = [...STRONG_PAIN_WORDS, ...WEAK_PAIN_WORDS];

// ============ Insight Signals & Noise ============

const INSIGHT_REQUEST_PATTERNS = [
  // English - feature request / desire
  /(\bwish\b|\bhope\b|\bwant\b|\bneed\b|\bshould have\b|\bwould be great\b)/i,
  /(feature request|please add|add (a|an|the) feature|why can'?t|if only)/i,
  // Japanese
  /(欲しい|要望|機能|できれば)/,
  // Chinese
  /(希望|想要|要是能|功能|需求|期待|能不能|建议|最好|想要有)/
];

const INSIGHT_NOISE_PATTERNS = [
  // Marketing / recruitment / solicitation
  { pattern: /\b(subscribe|newsletter|sign up|signup|register|join)\b/i, name: 'marketing_signup' },
  { pattern: /\b(email me|dm me|contact us|reach out)\b/i, name: 'marketing_contact' },
  { pattern: /\b(hiring|recruiting|job|apply)\b/i, name: 'recruiting' },
  // News / announcement / pricing
  { pattern: /\b(announced|launch|released|pricing|plan|subscription|expanded to)\b/i, name: 'news_pricing' },
  // Account / verification / grey-market
  { pattern: /\b(telegram|sms fee|verification code)\b/i, name: 'telegram_codes' },
  // Chinese marketing / support / grey-market
  { pattern: /(订阅|报名|投稿|招募|招聘|私信|联系)/i, name: 'cn_marketing' },
  { pattern: /(客服|工单|支持|请发邮件|发送邮件至)/i, name: 'cn_support' },
  { pattern: /(验证码|短信费|接码|电报|纸飞机|老号|封号)/i, name: 'cn_telegram_codes' },
  { pattern: /(发布|上线|价格|套餐|订阅|扩展|升级)/i, name: 'cn_news_pricing' }
];

const INSIGHT_COMPETITOR_WHITELIST = [
  'superhuman', 'spark', 'edison', 'shortwave', 'hey', 'hey.com',
  'front', 'missive', 'airmail', 'mailspring', 'newton', 'polymail',
  'gmail', 'outlook', 'zoho mail', 'zoho', 'fastmail', 'protonmail'
];

// ============ Load Denylist ============

let denylist = { hard: {}, soft: {}, low_signal: {} };

if (existsSync(DENYLIST_FILE)) {
  try {
    denylist = JSON.parse(readFileSync(DENYLIST_FILE, 'utf-8'));
  } catch (e) {
    console.error('Failed to load denylist.json:', e.message);
  }
}

// Flatten all keywords for faster lookup
function flattenKeywords(tier) {
  const keywords = [];
  for (const [category, words] of Object.entries(tier)) {
    if (category === '_meta') continue;
    for (const word of words) {
      keywords.push({ word: word.toLowerCase(), category });
    }
  }
  return keywords;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function shouldUseWordBoundary(keyword) {
  return /^[a-z0-9]+$/.test(keyword) && keyword.length <= 4;
}

function matchesKeyword(lowerText, keyword) {
  if (!keyword) return false;
  const normalized = keyword.toLowerCase();
  if (shouldUseWordBoundary(normalized)) {
    const pattern = new RegExp(`\\b${escapeRegExp(normalized)}\\b`, 'i');
    return pattern.test(lowerText);
  }
  return lowerText.includes(normalized);
}

const HARD_KEYWORDS = flattenKeywords(denylist.hard || {});
const SOFT_KEYWORDS = flattenKeywords(denylist.soft || {});
const LOW_SIGNAL_KEYWORDS = flattenKeywords(denylist.low_signal || {});

// ============ Filo Relevance Keywords ============

// Pain group keywords (email/inbox/information processing)
export const PAIN_KEYWORDS = [
  // English
  'email', 'inbox', 'gmail', 'outlook', 'newsletter', 'spam', 
  'notification', 'unsubscribe', 'labels', 'filters', 'imap',
  'mailbox', 'overload', 'flooding', 'unread', 'mail',
  // Japanese
  'メール', '受信トレイ', '迷惑メール', 'メルマガ', '通知', 
  'スパム', '未読', '整理',
  // Chinese
  '邮箱', '收件箱', '垃圾邮件', '邮件', '通知', '退订',
  '未读', '整理', '信息过载'
];

// Reach group keywords (AI + productivity)
export const REACH_AI_KEYWORDS = [
  'ai', 'agent', 'agents', 'llm', 'gpt', 'claude', 'automation',
  'AIエージェント', 'AI秘書', '自動化',
  'AI助手', '智能', '自动化'
];

export const REACH_PRODUCTIVITY_KEYWORDS = [
  'productivity', 'workflow', 'search', 'knowledge', 'notification',
  'email', 'inbox', 'organize', 'triage', 'summary', 'summarize',
  '生産性', 'ワークフロー', '検索', '整理', '要約',
  '生产力', '效率', '搜索', '整理', '总结', '待办'
];

// Combined FiloFit keywords for scoring
export const ALL_FILO_KEYWORDS = [
  ...PAIN_KEYWORDS,
  ...REACH_AI_KEYWORDS,
  ...REACH_PRODUCTIVITY_KEYWORDS
].map(k => k.toLowerCase());

// ============ Safety Check Functions ============

/**
 * Check for hard denylist matches (immediate discard)
 * @param {string} text - Text to check
 * @returns {{ match: boolean, category?: string, keyword?: string }}
 */
export function checkHardDenylist(text) {
  if (!text) return { match: false };
  const lowerText = text.toLowerCase();
  
  for (const { word, category } of HARD_KEYWORDS) {
    if (matchesKeyword(lowerText, word)) {
      return { match: true, category, keyword: word };
    }
  }
  return { match: false };
}

/**
 * Check for soft denylist matches (discard unless high FiloFit)
 * @param {string} text - Text to check
 * @returns {{ match: boolean, category?: string, keyword?: string }}
 */
export function checkSoftDenylist(text) {
  if (!text) return { match: false };
  const lowerText = text.toLowerCase();
  
  for (const { word, category } of SOFT_KEYWORDS) {
    if (lowerText.includes(word)) {
      return { match: true, category, keyword: word };
    }
  }
  return { match: false };
}

/**
 * Check for low_signal denylist matches (heavy penalty)
 * @param {string} text - Text to check
 * @returns {{ match: boolean, categories: string[], keywords: string[] }}
 */
export function checkLowSignalDenylist(text) {
  if (!text) return { match: false, categories: [], keywords: [] };
  const lowerText = text.toLowerCase();
  
  const matches = [];
  for (const { word, category } of LOW_SIGNAL_KEYWORDS) {
    if (lowerText.includes(word)) {
      matches.push({ category, keyword: word });
    }
  }
  
  return {
    match: matches.length > 0,
    categories: [...new Set(matches.map(m => m.category))],
    keywords: matches.map(m => m.keyword)
  };
}

/**
 * Count FiloFit keyword matches
 * @param {string} text - Text to check
 * @returns {number} - Number of unique keyword matches
 */
export function countFiloFitKeywords(text) {
  if (!text) return 0;
  const lowerText = text.toLowerCase();
  
  let count = 0;
  const matched = new Set();
  
  for (const keyword of ALL_FILO_KEYWORDS) {
    if (!matched.has(keyword) && lowerText.includes(keyword)) {
      count++;
      matched.add(keyword);
    }
  }
  
  return count;
}

/**
 * Check Pain group relevance
 * @param {string} text - Text to check
 * @returns {{ relevant: boolean, matchCount: number, keywords: string[] }}
 */
export function checkPainRelevance(text) {
  if (!text) return { relevant: false, matchCount: 0, keywords: [] };
  const lowerText = text.toLowerCase();
  
  const matched = [];
  for (const kw of PAIN_KEYWORDS) {
    if (lowerText.includes(kw.toLowerCase())) {
      matched.push(kw);
    }
  }
  
  return {
    relevant: matched.length > 0,
    matchCount: matched.length,
    keywords: matched
  };
}

/**
 * Check Reach group relevance (AI + productivity combo)
 * @param {string} text - Text to check
 * @returns {{ relevant: boolean, hasAI: boolean, hasProductivity: boolean, keywords: string[] }}
 */
export function checkReachRelevance(text) {
  if (!text) return { relevant: false, hasAI: false, hasProductivity: false, keywords: [] };
  const lowerText = text.toLowerCase();
  
  const matched = [];
  let hasAI = false;
  let hasProductivity = false;
  
  for (const kw of REACH_AI_KEYWORDS) {
    if (lowerText.includes(kw.toLowerCase())) {
      hasAI = true;
      matched.push(kw);
      break;
    }
  }
  
  for (const kw of REACH_PRODUCTIVITY_KEYWORDS) {
    if (lowerText.includes(kw.toLowerCase())) {
      hasProductivity = true;
      matched.push(kw);
    }
  }
  
  // Reach needs AI + productivity combo, or at least 2 productivity keywords
  const relevant = (hasAI && hasProductivity) || matched.length >= 2;
  
  return { relevant, hasAI, hasProductivity, keywords: matched };
}

// ============ Main Safety Check ============

/**
 * Comprehensive brand safety check with three-tier filtering
 * @param {string} text - Text to check
 * @param {number} filoFitScore - Current FiloFit score (keyword matches * 5)
 * @returns {{ 
 *   safe: boolean, 
 *   action: 'allow' | 'drop' | 'penalize',
 *   tier?: 'hard' | 'soft' | 'low_signal',
 *   category?: string,
 *   keyword?: string,
 *   reason?: string,
 *   penalty?: number
 * }}
 */
export function checkBrandSafety(text, filoFitScore = 0) {
  // 1. Check hard denylist - immediate drop
  const hardCheck = checkHardDenylist(text);
  if (hardCheck.match) {
    return {
      safe: false,
      action: 'drop',
      tier: 'hard',
      category: hardCheck.category,
      keyword: hardCheck.keyword,
      reason: `Hard denylist match [${hardCheck.category}]: "${hardCheck.keyword}"`
    };
  }
  
  // 2. Check soft denylist - drop unless high FiloFit
  const softCheck = checkSoftDenylist(text);
  if (softCheck.match) {
    const keywordCount = filoFitScore / 5;
    if (keywordCount < SOFT_THRESHOLD) {
      return {
        safe: false,
        action: 'drop',
        tier: 'soft',
        category: softCheck.category,
        keyword: softCheck.keyword,
        reason: `Soft denylist match [${softCheck.category}]: "${softCheck.keyword}" (FiloFit ${keywordCount} < ${SOFT_THRESHOLD})`
      };
    }
    // High FiloFit - allow but flag
    return {
      safe: true,
      action: 'allow',
      tier: 'soft',
      category: softCheck.category,
      keyword: softCheck.keyword,
      reason: `Soft denylist match but high FiloFit (${keywordCount} >= ${SOFT_THRESHOLD})`
    };
  }
  
  // 3. Check low_signal denylist - penalize but allow
  const lowSignalCheck = checkLowSignalDenylist(text);
  if (lowSignalCheck.match) {
    return {
      safe: true,
      action: 'penalize',
      tier: 'low_signal',
      category: lowSignalCheck.categories.join(', '),
      keyword: lowSignalCheck.keywords.join(', '),
      reason: `Low signal match [${lowSignalCheck.categories.join(', ')}]`,
      penalty: LOW_SIGNAL_PENALTY
    };
  }
  
  // 4. No denylist matches - safe
  return {
    safe: true,
    action: 'allow'
  };
}

/**
 * Check if tweet meets minimum FiloFit threshold
 * @param {number} filoFitScore - Current FiloFit score
 * @returns {{ pass: boolean, reason?: string }}
 */
export function checkMinFiloFit(filoFitScore) {
  const keywordCount = filoFitScore / 5;
  if (keywordCount < MIN_FILO_FIT) {
    return {
      pass: false,
      reason: `FiloFitScore too low: ${keywordCount} keywords < ${MIN_FILO_FIT} minimum`
    };
  }
  return { pass: true };
}

// ============ Email Action Only Detection ============

/**
 * Detect if text is just about "sending an email" action, not email pain points
 * e.g., "email me at..." or "I emailed them" should be filtered
 * @param {string} text - Text to check
 * @returns {boolean} - True if this is just an email action, not a pain point
 */
export function isEmailActionOnly(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  
  // Action patterns - just talking about sending/receiving email as an action
  const actionPatterns = [
    /email\s+(me|us|them|him|her|both|everyone)\b/i,
    /send\s+(an?\s+)?email\s+(to|for)/i,
    /emailed?\s+(you|me|them|us|him|her)\b/i,
    /reach\s+out\s+(via|by|through)\s+email/i,
    /contact\s+(via|by|through)\s+email/i,
    /\bemail\s+at\b/i,
    /via\s+email\b/i,
    /by\s+email\b/i,
    // Japanese
    /メールして/,
    /メールください/,
    /メールで連絡/,
    /メールにて/,
    // Chinese
    /发邮件给/,
    /请发邮件/,
    /邮件联系/,
    /通过邮件/
  ];
  
  for (const pattern of actionPatterns) {
    if (pattern.test(text)) {
      // Check if there's also a pain word - if so, it might be legitimate
      const hasPainWord = PAIN_EMOTION_WORDS.some(w => lowerText.includes(w.toLowerCase()));
      if (!hasPainWord) {
        return true; // Just an action, no pain context
      }
    }
  }
  return false;
}

/**
 * Check if text contains pain emotion words
 * @param {string} text - Text to check
 * @returns {{ hasPainEmotion: boolean, words: string[] }}
 */
export function checkPainEmotion(text) {
  if (!text) return { hasPainEmotion: false, hasStrongEmotion: false, words: [], strongWords: [], weakWords: [] };
  const lowerText = text.toLowerCase();
  
  const strongMatched = STRONG_PAIN_WORDS.filter(w => lowerText.includes(w.toLowerCase()));
  const weakMatched = WEAK_PAIN_WORDS.filter(w => lowerText.includes(w.toLowerCase()));
  const allMatched = [...strongMatched, ...weakMatched];
  
  return {
    hasPainEmotion: allMatched.length > 0,
    hasStrongEmotion: strongMatched.length > 0,  // True only if STRONG emotion words found
    words: allMatched,
    strongWords: strongMatched,
    weakWords: weakMatched
  };
}

// ============ Customer Service Notice Detection ============

/**
 * Detect if text is a customer service/notification message asking users to check email
 * These are not user pain points - they are service providers telling users to check inbox
 * @param {string} text - Text to check
 * @returns {{ isNotice: boolean, pattern?: string }}
 */
export function isCustomerServiceNotice(text) {
  if (!text) return { isNotice: false };
  
  const customerServicePatterns = [
    // ============ Customer Service REPLY patterns (new) ============
    // These detect when a company/support account is replying to users
    { pattern: /^(hi|hello|hey),?\s+(sorry|apologies|thank you)/i, name: 'cs_reply_greeting' },
    { pattern: /sorry\s+for\s+(the|any)\s+(inconvenience|trouble|delay)/i, name: 'cs_sorry_inconvenience' },
    { pattern: /thank\s+you\s+for\s+(reaching\s+out|contacting|raising|your\s+(patience|feedback|query))/i, name: 'cs_thank_reaching' },
    { pattern: /dear\s+(customer|user|valued|sir|madam)/i, name: 'cs_dear_customer' },
    { pattern: /good\s+(day|morning|afternoon|evening)\s+\w+\.\s+thank/i, name: 'cs_good_day_name' },
    { pattern: /we\s+(would\s+)?(like\s+to|appreciate|apologize|understand)/i, name: 'cs_we_would' },
    { pattern: /in\s+order\s+for\s+us\s+to\s+(assist|help|resolve|investigate)/i, name: 'cs_in_order_to_assist' },
    { pattern: /please\s+(share|provide|send)\s+(your|the|more|additional)\s+(details|information|email)/i, name: 'cs_please_provide' },
    { pattern: /our\s+team\s+(has|have|will|is)/i, name: 'cs_our_team' },
    { pattern: /we\s+have\s+(shared|sent|forwarded)\s+(a\s+)?(response|reply|email)/i, name: 'cs_we_have_sent' },
    { pattern: /kindly\s+(share|provide|check|verify|confirm)/i, name: 'cs_kindly_share' },
    { pattern: /for\s+(further|more)\s+(assistance|help|support)/i, name: 'cs_further_assistance' },
    { pattern: /(dm|message)\s+(us|me)\s+(the|your|with)/i, name: 'cs_dm_us' },
    { pattern: /we('re|\s+are)\s+(here\s+to|happy\s+to)\s+(help|assist)/i, name: 'cs_here_to_help' },
    { pattern: /looking\s+forward\s+to\s+(hearing|assisting|helping)/i, name: 'cs_looking_forward' },
    
    // ============ Service notification patterns (existing) ============
    // English patterns - service provider asking user to check email
    { pattern: /please\s+(check|see|verify)\s+(your\s+)?(inbox|spam|email|junk)/i, name: 'please_check_inbox' },
    { pattern: /sent\s+to\s+(your\s+)?(registered\s+)?(email|inbox)/i, name: 'sent_to_email' },
    { pattern: /if\s+you\s+haven'?t\s+received/i, name: 'havent_received' },
    { pattern: /check\s+(your\s+)?(junk|spam)\s+(folder|mail)/i, name: 'check_junk' },
    { pattern: /feel\s+free\s+to\s+(dm|contact|email)\s+(me|us)/i, name: 'feel_free_contact' },
    { pattern: /e-?tickets?\s+(have\s+been|has\s+been|were)\s+sent/i, name: 'tickets_sent' },
    { pattern: /details\s+(have\s+been|has\s+been)\s+sent\s+to\s+(your|the)/i, name: 'details_sent' },
    { pattern: /we\s+(kindly\s+)?request\s+you\s+to/i, name: 'kindly_request' },
    { pattern: /if\s+(there\s+are\s+)?any\s+issues.*contact/i, name: 'any_issues_contact' },
    { pattern: /if\s+you.*can'?t\s+find.*please\s+email/i, name: 'cant_find_please_email' },
    { pattern: /(inbox|spam)\s+(folder|folders).*please\s+email/i, name: 'folder_please_email' },
    { pattern: /can'?t\s+find\s+(the\s+)?(message|email|file).*email\s+\S+@/i, name: 'cant_find_email_support' },
    
    // Japanese patterns - service notification style
    { pattern: /ご確認(ください|を|いただけ)/i, name: 'jp_please_check' },
    { pattern: /届いていない(方|人)は/i, name: 'jp_not_received' },
    { pattern: /見つからない(方|人)は.*確認/i, name: 'jp_not_found_check' },
    { pattern: /お知らせ(くださ|いただ)/i, name: 'jp_notification' },
    
    // Chinese patterns - service notification style
    { pattern: /请(查收|检查).*(邮件|邮箱|收件箱)/i, name: 'cn_please_check' },
    { pattern: /如.*没.*收到/i, name: 'cn_not_received' },
    { pattern: /已发送至.*邮/i, name: 'cn_sent_to' }
  ];
  
  for (const { pattern, name } of customerServicePatterns) {
    if (pattern.test(text)) {
      // Double check: if the user is ALSO expressing frustration, it might be legitimate
      // e.g., "I checked my spam folder and still can't find it!"
      const hasFirstPersonFrustration = /\b(i|my|me)\b.*(can'?t|couldn'?t|unable|still|nowhere|frustrat)/i.test(text);
      
      if (!hasFirstPersonFrustration) {
        return { isNotice: true, pattern: name };
      }
    }
  }
  
  return { isNotice: false };
}

// ============ Competitor Product Promotion Detection ============

// Load competitor products from denylist
const COMPETITOR_PRODUCTS = (denylist.low_signal?.competitor_products || []).map(p => p.toLowerCase());

/**
 * Detect if text is promoting a competitor email/productivity product
 * @param {string} text - Text to check
 * @returns {{ isPromotion: boolean, product?: string, pattern?: string }}
 */
export function isCompetitorPromotion(text) {
  if (!text) return { isPromotion: false };
  const lowerText = text.toLowerCase();
  
  // Check for direct competitor product mentions
  for (const product of COMPETITOR_PRODUCTS) {
    if (lowerText.includes(product)) {
      return { isPromotion: true, product, pattern: 'product_name' };
    }
  }
  
  // Check for promotional language patterns for generic products
  const promotionalPatterns = [
    { pattern: /meet\s+\w+\s*[-–—:]\s*(voice|ai|email|your|the)/i, name: 'meet_product' },
    { pattern: /using\s+@?\w+\s+to\s+(manage|organize|handle|triage|clean)/i, name: 'using_to_manage' },
    { pattern: /\w+\s+turns\s+.*into\s+(structured|organized|actionable|clean)/i, name: 'turns_into' },
    { pattern: /try\s+@?\w+\s+for\s+(email|inbox|productivity)/i, name: 'try_for_email' },
    { pattern: /\w+\s+is\s+(my|the)\s+(favorite|best|go-to)\s+(email|inbox|mail)/i, name: 'favorite_email' },
    { pattern: /switched\s+to\s+@?\w+\s+(for|and)\s+(email|inbox|my)/i, name: 'switched_to' },
    { pattern: /\w+\s+has\s+(transformed|revolutionized|changed)\s+(my|the)\s+(inbox|email)/i, name: 'transformed_inbox' },
    { pattern: /(finally|just)\s+(found|discovered)\s+@?\w+\s+(for|to)/i, name: 'discovered_product' },
    // Japanese
    { pattern: /\w+で(メール|受信箱)を(管理|整理)/i, name: 'jp_manage_with' },
    // Chinese
    { pattern: /用\w+来(管理|整理)(邮件|邮箱)/i, name: 'cn_manage_with' }
  ];
  
  for (const { pattern, name } of promotionalPatterns) {
    if (pattern.test(text)) {
      // Extract potential product name
      const match = text.match(pattern);
      return { isPromotion: true, product: match?.[0], pattern: name };
    }
  }
  
  return { isPromotion: false };
}

// ============ Viral Template Detection ============

/**
 * Known viral copypasta templates that contain email keywords but are not about email
 * These are copy-pasted text that goes viral, not genuine email pain points
 */
const VIRAL_TEMPLATE_PATTERNS = [
  // "I have a girlfriend/boyfriend, don't DM or email me" template
  // Note: Handle both regular apostrophe (') and Unicode curly apostrophe (')
  {
    pattern: /i\s+hate\s+that\s+this\s+has\s+to\s+be\s+said.*i\s+have\s+a\s+(girl|boy)friend.*don['\u2019]?t\s+(dm|email)/i,
    name: 'relationship_boundary_copypasta'
  },
  // Generic "email me to get X" spam
  {
    pattern: /email\s+me\s+(at|to)\s+\S+@\S+\s+(for|to\s+get)/i,
    name: 'email_for_offer'
  },
  // Thread/list posts just mentioning email as one item
  {
    pattern: /^\d+[\.\)]\s*.*(email|mail)/im,
    name: 'numbered_list_mention'
  }
];

/**
 * Detect if text is a known viral template/copypasta
 * @param {string} text - Text to check
 * @returns {{ isViral: boolean, template?: string }}
 */
export function isViralTemplate(text) {
  if (!text) return { isViral: false };
  
  for (const { pattern, name } of VIRAL_TEMPLATE_PATTERNS) {
    if (pattern.test(text)) {
      return { isViral: true, template: name };
    }
  }
  
  return { isViral: false };
}

/**
 * Check if insight text has explicit request signal
 * @param {string} text - Text to check
 * @returns {{ hasSignal: boolean, pattern?: string }}
 */
export function checkInsightRequestSignal(text) {
  if (!text) return { hasSignal: false };
  for (const pattern of INSIGHT_REQUEST_PATTERNS) {
    if (pattern.test(text)) {
      return { hasSignal: true, pattern: pattern.toString() };
    }
  }
  return { hasSignal: false };
}

/**
 * Detect insight noise (marketing, support, news, grey-market)
 * @param {string} text - Text to check
 * @returns {{ isNoise: boolean, category?: string }}
 */
export function checkInsightNoise(text) {
  if (!text) return { isNoise: false };
  for (const { pattern, name } of INSIGHT_NOISE_PATTERNS) {
    if (pattern.test(text)) {
      return { isNoise: true, category: name };
    }
  }
  return { isNoise: false };
}

/**
 * Check if competitor mention is within allowed email-related list
 * @param {string} text - Text to check
 * @returns {boolean}
 */
export function isAllowedInsightCompetitor(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return INSIGHT_COMPETITOR_WHITELIST.some(name => lowerText.includes(name));
}

// ============ Promotional Content / Soft Article Detection ============
// Detect tweets that are actually advertisements or promotional content disguised as user posts

const PROMO_PATTERNS = [
  // Direct product/service promotion
  { pattern: /Less chaos.*More clarity.*Better performance/i, name: 'ad_tagline', severity: 'hard' },
  { pattern: /That'?s \w+\.\s*(Get in|Contact|Call|Email)/i, name: 'ad_cta', severity: 'hard' },
  { pattern: /\b(Get in Touch|Contact Us|Call Us|Email Us)\b.*(\+\d|@)/i, name: 'contact_cta', severity: 'hard' },
  
  // Crypto/Web3 promotional content (撸毛, airdrop, mint)
  { pattern: /可撸项目|撸.*项目|airdrop|空投|领取.*币|mint.*nft/i, name: 'crypto_promo', severity: 'hard' },
  { pattern: /测试币|测试网|领取.*奖励|claim.*reward/i, name: 'crypto_reward', severity: 'medium' },
  { pattern: /web3.*project|crypto.*opportunity/i, name: 'web3_promo', severity: 'medium' },
  
  // Marketing CTA patterns
  { pattern: /\b(try|check out|download|get)\s+(our|the|this)\s+(app|tool|product|service)\b/i, name: 'product_cta', severity: 'medium' },
  { pattern: /\b(introducing|announcing|launching|just launched)\b.*\b(new|our)\b/i, name: 'launch_announce', severity: 'medium' },
  { pattern: /\bsign up\s+(now|today|free)\b/i, name: 'signup_cta', severity: 'medium' },
  
  // Self-promotion / company speak
  { pattern: /\b(we|our)\s+(offer|provide|help|make|build|deliver)\b.*\b(solution|service|product|tool)\b/i, name: 'company_speak', severity: 'medium' },
  { pattern: /\b(boost|improve|enhance|transform)\s+your\s+(productivity|workflow|inbox|email)\b/i, name: 'benefit_claim', severity: 'soft' },
  
  // Affiliate / referral
  { pattern: /\b(affiliate|referral|promo code|discount code|use code)\b/i, name: 'affiliate', severity: 'medium' },
  
  // News site headlines (not user pain)
  { pattern: /\bThis (little-known|secret|hidden)\s+\w+\s+trick\b/i, name: 'clickbait_headline', severity: 'soft' }
];

/**
 * Detect promotional content / soft articles
 * @param {string} text - Text to check
 * @returns {{ isPromo: boolean, pattern?: string, severity?: 'hard' | 'medium' | 'soft' }}
 */
export function isPromotionalContent(text) {
  if (!text) return { isPromo: false };
  
  for (const { pattern, name, severity } of PROMO_PATTERNS) {
    if (pattern.test(text)) {
      return { isPromo: true, pattern: name, severity };
    }
  }
  
  return { isPromo: false };
}

// ============ Exports ============

export { MIN_FILO_FIT, SOFT_THRESHOLD, LOW_SIGNAL_PENALTY, PAIN_EMOTION_WORDS };
