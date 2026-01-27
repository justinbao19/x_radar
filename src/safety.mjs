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

// ============ Exports ============

export { MIN_FILO_FIT, SOFT_THRESHOLD, LOW_SIGNAL_PENALTY, PAIN_EMOTION_WORDS };
