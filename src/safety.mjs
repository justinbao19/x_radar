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
// Words that indicate actual pain/frustration with email, not just mentioning email
const PAIN_EMOTION_WORDS = [
  // English
  'hate', 'annoying', 'terrible', 'broken', 'bug', 'issue', 'problem',
  'overwhelming', 'drowning', 'chaos', 'mess', 'frustrating', 'worst',
  'nightmare', 'hell', 'awful', 'useless', 'sucks', 'horrible', 'disaster',
  // Japanese
  'うざい', '最悪', '困る', '大変', 'ひどい', '地獄', 'バグ', '問題',
  // Chinese
  '烦死', '太多', '找不到', '难用', '崩溃', '问题', '噩梦', '糟糕', '垃圾'
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
    if (lowerText.includes(word)) {
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
  if (!text) return { hasPainEmotion: false, words: [] };
  const lowerText = text.toLowerCase();
  
  const matched = PAIN_EMOTION_WORDS.filter(w => lowerText.includes(w.toLowerCase()));
  return {
    hasPainEmotion: matched.length > 0,
    words: matched
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

// ============ Exports ============

export { MIN_FILO_FIT, SOFT_THRESHOLD, LOW_SIGNAL_PENALTY, PAIN_EMOTION_WORDS };
