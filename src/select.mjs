import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { log, getInputPath, getOutputPath, copyToLatest, getOutputDir, getTodayDate } from './utils.mjs';

// ============ Monday Aggregation Config ============
// On Monday, aggregate data from Sat + Sun + Mon (3 days)
const MONDAY_LOOKBACK_DAYS = 3;

// ============ Load KOL Handles for Verification ============
const INFLUENCERS_FILE = 'influencers.json';
let KOL_HANDLES = new Set();

if (existsSync(INFLUENCERS_FILE)) {
  try {
    const influencers = JSON.parse(readFileSync(INFLUENCERS_FILE, 'utf-8'));
    KOL_HANDLES = new Set((influencers.handles || []).map(h => h.toLowerCase()));
    log('INFO', `Loaded ${KOL_HANDLES.size} KOL handles for verification`);
  } catch (e) {
    log('WARN', 'Failed to load influencers.json for KOL verification', { error: e.message });
  }
}

// ============ Load URL Denylist from User Feedback ============
const DENYLIST_FILE = 'denylist.json';
let FEEDBACK_URL_DENYLIST = new Set();
let LEARNED_KEYWORDS = [];

if (existsSync(DENYLIST_FILE)) {
  try {
    const denylist = JSON.parse(readFileSync(DENYLIST_FILE, 'utf-8'));
    // Load URL denylist
    if (denylist.feedback?.urls?.length > 0) {
      FEEDBACK_URL_DENYLIST = new Set(denylist.feedback.urls);
      log('INFO', `Loaded ${FEEDBACK_URL_DENYLIST.size} URLs from feedback denylist`);
    }
    // Load learned keywords from LLM analysis
    if (denylist.learned?.keywords?.length > 0) {
      LEARNED_KEYWORDS = denylist.learned.keywords;
      log('INFO', `Loaded ${LEARNED_KEYWORDS.length} learned keywords from LLM analysis`);
    }
  } catch (e) {
    log('WARN', 'Failed to load feedback denylist', { error: e.message });
  }
}

/**
 * Check if text contains any learned keywords
 */
function containsLearnedKeyword(text) {
  if (!text || LEARNED_KEYWORDS.length === 0) return { match: false };
  const lowerText = text.toLowerCase();
  for (const keyword of LEARNED_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return { match: true, keyword };
    }
  }
  return { match: false };
}
import { 
  checkBrandSafety,
  checkMinFiloFit,
  checkPainRelevance,
  checkReachRelevance,
  checkInsightNoise,
  checkInsightRequestSignal,
  isAllowedInsightCompetitor,
  countFiloFitKeywords,
  isEmailActionOnly,
  checkPainEmotion,
  isCustomerServiceNotice,
  isCompetitorPromotion,
  isViralTemplate,
  isPromotionalContent,
  MIN_FILO_FIT,
  LOW_SIGNAL_PENALTY,
  PAIN_KEYWORDS
} from './safety.mjs';

// ============ Request Signal Detection ============
// Words that indicate feature requests or unmet needs
const REQUEST_SIGNAL_PATTERNS = [
  // English - feature request / desire / unmet need
  /\b(wish|hope|want|need|should have|would be great|would love|please add)\b/i,
  /\b(why doesn'?t|why can'?t|why isn'?t|if only|looking for)\b/i,
  /\b(feature request|needs to have|any app|any tool|recommend|suggestion)\b/i,
  // Japanese
  /(欲しい|したい|あったらいい|要望|機能|できれば|探している)/,
  // Chinese
  /(希望|想要|要是能|功能|需求|期待|能不能|建议|最好|求推荐|有没有)/
];

/**
 * Check if text contains request/desire signals
 */
function hasRequestSignal(text) {
  if (!text) return { hasSignal: false, patterns: [] };
  const matchedPatterns = [];
  
  for (const pattern of REQUEST_SIGNAL_PATTERNS) {
    if (pattern.test(text)) {
      matchedPatterns.push(pattern.source);
    }
  }
  
  return { 
    hasSignal: matchedPatterns.length > 0, 
    patterns: matchedPatterns 
  };
}

// Penalty multipliers for new filters
const CUSTOMER_SERVICE_PENALTY = 0.3;  // 70% penalty for customer service notices
const COMPETITOR_PENALTY = 0.25;        // 75% penalty for competitor promotions
const VIRAL_TEMPLATE_PENALTY = 0.15;    // 85% penalty for viral copypasta

// Quality threshold config (replaces fixed quota)
// Core principle: Relevance > Pain Signal > Virality
// High engagement tweets are NOT more valuable - they're already old news
// What matters: does this tweet express real pain points or feature requests about email?
const QUALITY_CONFIG = {
  aiPickTopN: 20,             // Increased to 20 - let more relevant tweets through
  kolMinFiloFitScore: 40,     // KOL tweets need at least 2 keywords (40 = 2 * 20) - adjusted for new weight
  minFinalScore: 50,          // Minimum score to be included
  // Insight: stricter threshold - quality over quantity
  insightMinFinalScore: 40,   // Insight needs reasonable score
  insightMinFiloFitScore: 20, // Insight needs at least 1 keyword (20 = 1 * 20)
  // Sentiment: must actually mention Filo brand
  sentimentMinFinalScore: 15, // Sentiment has natural low engagement but needs minimum quality
  noEmotionPenalty: 0.5,      // Score penalty for pain tweets without emotion words
  // NEW: Scoring weights - relevance over virality
  filoFitMultiplier: 20,      // Each keyword match = 20 points (was 5)
  viralityMultiplier: 20,     // Reduced from 100 to 20 - virality is just a tiebreaker
  strongEmotionBonus: 30,     // STRONG emotion words (hate, terrible, nightmare) - full bonus
  weakEmotionBonus: 10,       // WEAK signal words (issue, problem) - partial bonus, invalidated by CS reply
  requestSignalBonus: 25      // Bonus for tweets with feature request signals
};

// Freshness filter - only keep tweets from last N days
// Strict 3-day window to ensure fresh, actionable content
const MAX_TWEET_AGE_DAYS = 3;

// FiloFit keywords for scoring (used for viralityScore calculation)
const FILO_KEYWORDS = {
  en: [
    'inbox', 'email', 'gmail', 'newsletter', 'newsletters', 'notifications', 'notification',
    'noise', 'spam', 'summarize', 'summary', 'search', 'find', 'finding',
    'todo', 'task', 'tasks', 'triage', 'organize', 'overload', 'unsubscribe',
    'overwhelming', 'productivity', 'workflow', 'automation', 'AI', 'agent'
  ],
  jp: [
    'メール', '受信トレイ', '通知', '迷惑メール', 'スパム', '検索', '見つからない',
    '要約', 'タスク', '整理', 'メルマガ', '生産性', '自動化', 'AIエージェント',
    '情報過多', 'うざい', '最悪'
  ],
  cn: [
    '邮箱', '收件箱', '通知', '垃圾邮件', '搜索', '找不到', '总结', '待办',
    '任务', '整理', '降噪', '邮件', '生产力', '自动化', '效率', '太多'
  ]
};

const ALL_KEYWORDS = [
  ...FILO_KEYWORDS.en.map(k => k.toLowerCase()),
  ...FILO_KEYWORDS.jp,
  ...FILO_KEYWORDS.cn
];

/**
 * Count keyword matches in text
 */
function countKeywordMatches(text) {
  if (!text) return 0;
  const lowerText = text.toLowerCase();
  let count = 0;
  
  for (const keyword of ALL_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      count++;
    }
  }
  
  return count;
}

// Pain group bonus multiplier (pain tweets are more valuable for engagement)
const PAIN_GROUP_BONUS = 3;

// ============ Sentiment Classification (Filo舆情) ============

// Filo brand keywords - tweet must contain at least one to be valid sentiment
const FILO_BRAND_KEYWORDS = [
  'filomail', 'filo mail', 'filo_mail', '@filo_mail',
  'filoメール', 'filo邮件', 'filo郵件'
];

/**
 * Check if tweet actually mentions Filo brand
 * This prevents false positives from query matching noise
 * @param {string} text - Tweet text
 * @returns {boolean}
 */
function mentionsFilo(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return FILO_BRAND_KEYWORDS.some(kw => lowerText.includes(kw.toLowerCase()));
}

/**
 * Classify sentiment of a tweet about Filo
 * @param {string} text - Tweet text
 * @returns {'positive' | 'negative' | 'neutral'}
 */
function classifySentiment(text) {
  if (!text) return 'neutral';
  const lowerText = text.toLowerCase();
  
  // Negative patterns - check first (negative feedback is more important)
  const negativePatterns = [
    /\b(bug|bugs|broken|issue|issues|problem|problems)\b/i,
    /\b(hate|worst|terrible|disappointed|disappointing|frustrated|annoying)\b/i,
    /\b(doesn't work|doesn\'t work|does not work|cant|can't|cannot)\b/i,
    /\b(crash|crashes|crashing|slow|laggy|lag)\b/i,
    /\b(bad|poor|awful|horrible|useless|waste)\b/i,
    /不好用|问题|差评|坑|垃圾|难用|卡|崩/,
    /バグ|問題|使いにくい|ひどい|最悪/
  ];
  
  for (const pattern of negativePatterns) {
    if (pattern.test(text)) {
      return 'negative';
    }
  }
  
  // Positive patterns
  const positivePatterns = [
    /\b(love|loving|loved|amazing|awesome|great|excellent|fantastic)\b/i,
    /\b(best|recommend|recommended|helpful|solved|perfect|beautiful)\b/i,
    /\b(thanks|thank you|thank u|thx|grateful)\b/i,
    /\b(game changer|life saver|life-saver|must have|must-have)\b/i,
    /\b(impressed|impressive|brilliant|wonderful|incredible)\b/i,
    /完美|好用|推荐|感谢|解决了|神器|太棒|喜欢|爱/,
    /最高|素晴らしい|便利|助かる|おすすめ|ありがとう/
  ];
  
  for (const pattern of positivePatterns) {
    if (pattern.test(text)) {
      return 'positive';
    }
  }
  
  return 'neutral';
}

// ============ Insight Type Classification (用户洞察) ============

/**
 * Classify insight type for user insight tweets
 * @param {string} text - Tweet text
 * @param {string} sourceName - Source query name for context
 * @returns {'feature_request' | 'competitor_praise' | 'ai_demand' | 'general'}
 */
function classifyInsightType(text, sourceName = '') {
  if (!text) return 'general';
  
  // Check source name first for strong signals
  if (sourceName.includes('competitor')) {
    return 'competitor_praise';
  }
  if (sourceName.includes('ai-email') || sourceName.includes('ai_email')) {
    return 'ai_demand';
  }
  
  // Competitor praise patterns
  const competitorPatterns = [
    /\b(superhuman|spark|edison|shortwave|hey email|hey\.com)\b/i,
    /\b(mailspring|airmail|newton|polymail|front app)\b/i
  ];
  
  for (const pattern of competitorPatterns) {
    if (pattern.test(text)) {
      return 'competitor_praise';
    }
  }
  
  // AI demand patterns
  const aiDemandPatterns = [
    /\b(AI email|email AI|smart inbox|AI inbox|AI mail)\b/i,
    /\b(AI assistant|AI agent|automation|automate|auto-)\b/i,
    /AI邮件|智能邮箱|自动化|AIエージェント|AI秘書/
  ];
  
  for (const pattern of aiDemandPatterns) {
    if (pattern.test(text)) {
      return 'ai_demand';
    }
  }
  
  // Feature request patterns
  const featureRequestPatterns = [
    /\b(wish|hope|want|need|would be great|should have|would love)\b/i,
    /\b(feature request|requesting|please add|needs to have)\b/i,
    /\b(why doesn't|why can't|why isn't|if only)\b/i,
    /希望|想要|要是能|需要|功能|期待/,
    /欲しい|したい|機能|あったらいい/
  ];
  
  for (const pattern of featureRequestPatterns) {
    if (pattern.test(text)) {
      return 'feature_request';
    }
  }
  
  return 'general';
}

// Max tweets per KOL in final selection (prevent single KOL domination)
const MAX_PER_KOL = 1;

/**
 * Calculate scores for a tweet
 * NEW SCORING PHILOSOPHY:
 * - Relevance is KING: keyword matches are the primary score driver
 * - Pain signals matter: real complaints/frustrations get bonus
 * - Request signals matter: feature requests/unmet needs get bonus
 * - Virality is just a tiebreaker: high engagement ≠ high value for us
 * 
 * A tweet with 10 likes but perfect relevance should beat a tweet
 * with 10,000 likes but weak relevance.
 * 
 * IMPORTANT: Emotion words are split into STRONG and WEAK:
 * - STRONG (hate, terrible, nightmare): Full bonus, real user frustration
 * - WEAK (issue, problem): Partial bonus, often used by customer service
 */
function scoreTweet(tweet, group = null) {
  // Raw engagement score (for reference only)
  const rawEngagement = (tweet.likes || 0) * 2 + 
                        (tweet.retweets || 0) * 2 + 
                        (tweet.replies || 0) * 1.5;
  
  // Virality score - REDUCED weight, just a tiebreaker
  // log10(1 + 10000) * 20 ≈ 80, log10(1 + 10) * 20 ≈ 21
  // Compare to old: log10(1 + 10000) * 100 ≈ 400
  const viralityScore = Math.log10(1 + rawEngagement) * QUALITY_CONFIG.viralityMultiplier;
  
  // Keyword match score - PRIMARY scoring factor
  const keywordMatchCount = countKeywordMatches(tweet.text);
  // Each keyword = 20 points (was 5)
  const filoFitScore = keywordMatchCount * QUALITY_CONFIG.filoFitMultiplier;
  
  // Text quality bonus (minor)
  const textBonus = (tweet.text && tweet.text.length > 50) ? 10 : 
                    (tweet.text && tweet.text.length > 20) ? 5 : 0;
  
  // Check if this is a customer service reply (invalidates weak emotion bonus)
  const csCheck = isCustomerServiceNotice(tweet.text);
  const isCSReply = csCheck.isNotice;
  
  // Pain emotion bonus - tiered based on emotion strength
  const emotionCheck = checkPainEmotion(tweet.text);
  let painEmotionBonus = 0;
  if (emotionCheck.hasStrongEmotion) {
    // STRONG emotion: full bonus regardless of CS status (real frustration)
    painEmotionBonus = QUALITY_CONFIG.strongEmotionBonus;
  } else if (emotionCheck.hasPainEmotion && !isCSReply) {
    // WEAK signal: partial bonus, but NOT if it's a customer service reply
    painEmotionBonus = QUALITY_CONFIG.weakEmotionBonus;
  }
  // If it's a CS reply with only weak words (issue, problem), no bonus
  
  // Request signal bonus - feature requests are valuable
  const requestCheck = hasRequestSignal(tweet.text);
  // CS replies don't get request bonus either
  const requestSignalBonus = (requestCheck.hasSignal && !isCSReply) ? QUALITY_CONFIG.requestSignalBonus : 0;
  
  // Calculate final score
  // Order of importance: filoFitScore > painEmotionBonus/requestSignalBonus > viralityScore
  let finalScore = filoFitScore + painEmotionBonus + requestSignalBonus + viralityScore + textBonus;
  
  // Apply pain group bonus (pain tweets are more valuable)
  const painBonus = (group === 'pain') ? PAIN_GROUP_BONUS : 1;
  finalScore = finalScore * painBonus;
  
  return {
    viralityScore: Math.round(viralityScore * 10) / 10,
    rawEngagement: Math.round(rawEngagement * 10) / 10,
    filoFitScore,
    filoFitKeywordCount: keywordMatchCount,
    textBonus,
    painEmotionBonus,
    requestSignalBonus,
    painBonus,
    finalScore: Math.round(finalScore * 10) / 10,
    isCSReply,  // Flag for debugging
    // Debug info
    _emotionWords: emotionCheck.words || [],
    _strongEmotionWords: emotionCheck.strongWords || [],
    _weakEmotionWords: emotionCheck.weakWords || [],
    _requestPatterns: requestCheck.patterns || []
  };
}

/**
 * Select top tweets with quota and backfill logic
 */
function selectTop10(rawData) {
  // Merge all tweets from all sources
  const allTweets = [];
  
  for (const source of rawData.sources || []) {
    for (const tweet of source.tweets || []) {
      // sentiment and insight keep their group, kol becomes reach, others stay as-is
      let group = source.group;
      if (source.group === 'kol') {
        group = 'reach';
      }
      
      allTweets.push({
        ...tweet,
        group: group,
        sourceQuery: source.name,
        originalGroup: source.group
      });
    }
  }
  
  log('INFO', `Total tweets before dedup: ${allTweets.length}`);
  
  // Deduplicate by URL
  const seenUrls = new Set();
  const uniqueTweets = allTweets.filter(t => {
    if (!t.url || seenUrls.has(t.url)) return false;
    seenUrls.add(t.url);
    return true;
  });
  
  log('INFO', `Unique tweets after dedup: ${uniqueTweets.length}`);
  
  // ============ Freshness Filter ============
  const now = Date.now();
  const maxAgeMs = MAX_TWEET_AGE_DAYS * 24 * 60 * 60 * 1000;
  
  const freshTweets = uniqueTweets.filter(t => {
    if (!t.datetime) return true; // Keep if no datetime (can't determine age)
    
    const tweetDate = new Date(t.datetime);
    const ageMs = now - tweetDate.getTime();
    
    if (ageMs > maxAgeMs) {
      log('DEBUG', `Too old (${Math.floor(ageMs / (24 * 60 * 60 * 1000))} days): ${t.url}`);
      return false;
    }
    return true;
  });
  
  const tooOldFiltered = uniqueTweets.length - freshTweets.length;
  log('INFO', `Freshness filter (${MAX_TWEET_AGE_DAYS} days): ${freshTweets.length} kept, ${tooOldFiltered} filtered`);
  
  // ============ User Feedback URL Denylist ============
  let feedbackUrlFiltered = 0;
  const feedbackCleanTweets = freshTweets.filter(t => {
    if (FEEDBACK_URL_DENYLIST.has(t.url)) {
      feedbackUrlFiltered++;
      log('DEBUG', `Feedback denylist filtered: ${t.url}`);
      return false;
    }
    return true;
  });
  
  if (feedbackUrlFiltered > 0) {
    log('INFO', `Feedback URL denylist: ${feedbackCleanTweets.length} kept, ${feedbackUrlFiltered} filtered`);
  }
  
  // ============ Learned Keywords Filter (from LLM analysis) ============
  let learnedKeywordFiltered = 0;
  const learnedCleanTweets = feedbackCleanTweets.filter(t => {
    const check = containsLearnedKeyword(t.text);
    if (check.match) {
      learnedKeywordFiltered++;
      log('DEBUG', `Learned keyword filtered: ${t.url}`, { keyword: check.keyword });
      return false;
    }
    return true;
  });
  
  if (learnedKeywordFiltered > 0) {
    log('INFO', `Learned keywords filter: ${learnedCleanTweets.length} kept, ${learnedKeywordFiltered} filtered`);
  }
  
  // ============ Three-Tier Brand Safety Gate ============
  const filterStats = {
    tooOldFiltered,
    feedbackUrlFiltered,
    learnedKeywordFiltered,
    hardFiltered: 0,
    hardReasons: {},
    softFiltered: 0,
    softReasons: {},
    lowSignalPenalized: 0,
    filoFitFiltered: 0,
    relevanceFiltered: 0,
    // Sentiment quality gates
    sentimentNoBrandFiltered: 0,
    sentimentMinScoreFiltered: 0,
    // Insight quality gates
    insightNoiseFiltered: 0,
    insightWeakSignalFiltered: 0,
    insightCompetitorFiltered: 0,
    insightMinScoreFiltered: 0
  };
  
  // First pass: score all tweets (needed for soft tier decisions)
  // Pass group for pain bonus calculation
  const scoredTweets = learnedCleanTweets.map(t => ({
    ...t,
    ...scoreTweet(t, t.group)
  }));
  
  // Apply three-tier filtering
  const filteredTweets = [];
  
  for (const tweet of scoredTweets) {
    const safetyCheck = checkBrandSafety(tweet.text, tweet.filoFitScore);
    
    // Hard tier: immediate drop
    if (safetyCheck.action === 'drop' && safetyCheck.tier === 'hard') {
      filterStats.hardFiltered++;
      filterStats.hardReasons[safetyCheck.category] = (filterStats.hardReasons[safetyCheck.category] || 0) + 1;
      log('DEBUG', `Hard filtered: ${tweet.url}`, { 
        category: safetyCheck.category, 
        keyword: safetyCheck.keyword 
      });
      continue;
    }
    
    // Soft tier: drop unless high FiloFit (handled in checkBrandSafety)
    if (safetyCheck.action === 'drop' && safetyCheck.tier === 'soft') {
      filterStats.softFiltered++;
      filterStats.softReasons[safetyCheck.category] = (filterStats.softReasons[safetyCheck.category] || 0) + 1;
      log('DEBUG', `Soft filtered: ${tweet.url}`, { 
        category: safetyCheck.category, 
        reason: safetyCheck.reason 
      });
      continue;
    }
    
    // Low signal tier: apply penalty
    if (safetyCheck.action === 'penalize' && safetyCheck.tier === 'low_signal') {
      tweet.finalScore = Math.round(tweet.finalScore * LOW_SIGNAL_PENALTY * 10) / 10;
      tweet.lowSignalPenalty = true;
      tweet.lowSignalCategory = safetyCheck.category;
      filterStats.lowSignalPenalized++;
      log('DEBUG', `Low signal penalized: ${tweet.url}`, { 
        category: safetyCheck.category,
        newScore: tweet.finalScore 
      });
    }
    
    // Store safety metadata
    tweet.safetyTier = safetyCheck.tier || 'clean';
    tweet.safetyReason = safetyCheck.reason;
    
    filteredTweets.push(tweet);
  }
  
  log('INFO', `After Brand Safety Gate: ${filteredTweets.length}`, {
    hardFiltered: filterStats.hardFiltered,
    softFiltered: filterStats.softFiltered,
    lowSignalPenalized: filterStats.lowSignalPenalized
  });
  
  // ============ Minimum FiloFit Threshold ============
  // Quality over quantity - even sentiment/insight must pass quality gates
  const filoFitQualified = filteredTweets.filter(t => {
    // Sentiment group: must actually mention Filo brand (quality gate)
    if (t.group === 'sentiment') {
      if (!mentionsFilo(t.text)) {
        filterStats.sentimentNoBrandFiltered++;
        log('DEBUG', `Sentiment no Filo mention: ${t.url}`, { 
          text: t.text?.substring(0, 80) 
        });
        return false;
      }
      return true;
    }
    
    // Insight group: use a modest threshold (avoid 1-keyword noise)
    if (t.group === 'insight') {
      if (t.filoFitScore < QUALITY_CONFIG.insightMinFiloFitScore) {
        filterStats.filoFitFiltered++;
        log('DEBUG', `Insight FiloFit too low: ${t.url}`, { 
          filoFitScore: t.filoFitScore,
          required: QUALITY_CONFIG.insightMinFiloFitScore
        });
        return false;
      }
      return true;
    }
    
    const check = checkMinFiloFit(t.filoFitScore);
    if (!check.pass) {
      filterStats.filoFitFiltered++;
      log('DEBUG', `FiloFit below threshold: ${t.url}`, { 
        filoFitScore: t.filoFitScore,
        keywordCount: t.filoFitKeywordCount,
        minRequired: MIN_FILO_FIT 
      });
      return false;
    }
    return true;
  });
  
  log('INFO', `After FiloFit threshold (>=${MIN_FILO_FIT}): ${filoFitQualified.length} (filtered: ${filterStats.filoFitFiltered}, sentimentNoBrand: ${filterStats.sentimentNoBrandFiltered})`);
  
  // ============ Group Relevance Check ============
  // Skip for sentiment and insight groups (they have their own relevance via query)
  const relevantTweets = filoFitQualified.filter(t => {
    // Sentiment group: skip relevance check (brand mentions are inherently relevant)
    // Also classify sentiment here
    if (t.group === 'sentiment') {
      t.sentimentLabel = classifySentiment(t.text);
      t.relevanceKeywords = [];
      return true;
    }
    
    // Insight group: apply lightweight relevance/quality gates
    if (t.group === 'insight') {
      t.insightType = classifyInsightType(t.text, t.sourceQuery);
      t.relevanceKeywords = [];
      
      const noiseCheck = checkInsightNoise(t.text);
      if (noiseCheck.isNoise || isEmailActionOnly(t.text) || isCustomerServiceNotice(t.text).isNotice) {
        filterStats.insightNoiseFiltered++;
        log('DEBUG', `Insight noise filtered: ${t.url}`, { 
          reason: noiseCheck.category || 'email_action_or_support'
        });
        return false;
      }
      
      if (t.insightType === 'competitor_praise' && !isAllowedInsightCompetitor(t.text)) {
        filterStats.insightCompetitorFiltered++;
        log('DEBUG', `Insight competitor not allowed: ${t.url}`, { sourceQuery: t.sourceQuery });
        return false;
      }
      
      const requestSignal = checkInsightRequestSignal(t.text);
      if (t.insightType === 'general' && !requestSignal.hasSignal) {
        filterStats.insightWeakSignalFiltered++;
        log('DEBUG', `Insight weak signal filtered: ${t.url}`);
        return false;
      }
      
      return true;
    }
    
    let relevanceCheck;
    
    if (t.group === 'pain') {
      relevanceCheck = checkPainRelevance(t.text);
    } else {
      relevanceCheck = checkReachRelevance(t.text);
    }
    
    t.relevanceKeywords = relevanceCheck.keywords || [];
    
    if (!relevanceCheck.relevant) {
      filterStats.relevanceFiltered++;
      log('DEBUG', `Relevance filtered: ${t.url}`, { 
        group: t.group,
        matchCount: relevanceCheck.matchCount || 0
      });
      return false;
    }
    
    return true;
  });
  
  log('INFO', `After relevance check: ${relevantTweets.length} (filtered: ${filterStats.relevanceFiltered})`);
  
  // ============ Email Action Only Check ============
  // Filter out tweets that just mention "sending email" without actual pain points
  // Skip for sentiment and insight groups
  filterStats.emailActionOnlyFiltered = 0;
  filterStats.noEmotionPenalized = 0;
  
  const contextQualifiedTweets = relevantTweets.filter(t => {
    // Skip context checks for sentiment and insight groups
    if (t.group === 'sentiment' || t.group === 'insight') {
      return true;
    }
    
    if (t.group === 'pain') {
      // Check if this is just an email action, not a pain point
      if (isEmailActionOnly(t.text)) {
        filterStats.emailActionOnlyFiltered++;
        log('DEBUG', `Email action only (no pain context): ${t.url}`, { 
          text: t.text?.substring(0, 100)
        });
        return false;
      }
      
      // Check for pain emotion words - apply penalty if missing
      const emotionCheck = checkPainEmotion(t.text);
      t.painEmotionWords = emotionCheck.words;
      
      if (!emotionCheck.hasPainEmotion) {
        // No emotion words - apply score penalty but don't filter
        t.finalScore = Math.round(t.finalScore * QUALITY_CONFIG.noEmotionPenalty * 10) / 10;
        t.noEmotionPenalty = true;
        filterStats.noEmotionPenalized++;
        log('DEBUG', `No pain emotion words, score penalized: ${t.url}`, { 
          newScore: t.finalScore
        });
      }
    }
    return true;
  });
  
  log('INFO', `After context check: ${contextQualifiedTweets.length} (emailActionOnly: ${filterStats.emailActionOnlyFiltered}, noEmotionPenalized: ${filterStats.noEmotionPenalized})`);
  
  // ============ Customer Service Notice Check ============
  // Detect service providers telling users to check email (not user pain points)
  filterStats.customerServicePenalized = 0;
  
  for (const tweet of contextQualifiedTweets) {
    const csCheck = isCustomerServiceNotice(tweet.text);
    if (csCheck.isNotice) {
      tweet.finalScore = Math.round(tweet.finalScore * CUSTOMER_SERVICE_PENALTY * 10) / 10;
      tweet.customerServicePenalty = true;
      tweet.customerServicePattern = csCheck.pattern;
      filterStats.customerServicePenalized++;
      log('DEBUG', `Customer service notice penalized: ${tweet.url}`, {
        pattern: csCheck.pattern,
        newScore: tweet.finalScore
      });
    }
  }
  
  log('INFO', `Customer service notices penalized: ${filterStats.customerServicePenalized}`);
  
  // ============ Competitor Product Check ============
  // Detect competitor email/productivity product promotions
  filterStats.competitorPenalized = 0;
  
  for (const tweet of contextQualifiedTweets) {
    const compCheck = isCompetitorPromotion(tweet.text);
    if (compCheck.isPromotion) {
      tweet.finalScore = Math.round(tweet.finalScore * COMPETITOR_PENALTY * 10) / 10;
      tweet.competitorPenalty = true;
      tweet.competitorProduct = compCheck.product;
      filterStats.competitorPenalized++;
      log('DEBUG', `Competitor promotion penalized: ${tweet.url}`, {
        product: compCheck.product,
        pattern: compCheck.pattern,
        newScore: tweet.finalScore
      });
    }
  }
  
  log('INFO', `Competitor promotions penalized: ${filterStats.competitorPenalized}`);
  
  // ============ Viral Template Check ============
  // Filter out viral copypasta that contains email keywords but is off-topic
  filterStats.viralTemplateFiltered = 0;
  
  const nonViralTweets = contextQualifiedTweets.filter(tweet => {
    const viralCheck = isViralTemplate(tweet.text);
    if (viralCheck.isViral) {
      // Heavy penalty instead of hard filter - allows very high engagement viral content through with penalty
      tweet.finalScore = Math.round(tweet.finalScore * VIRAL_TEMPLATE_PENALTY * 10) / 10;
      tweet.viralTemplatePenalty = true;
      tweet.viralTemplate = viralCheck.template;
      filterStats.viralTemplateFiltered++;
      log('DEBUG', `Viral template penalized: ${tweet.url}`, {
        template: viralCheck.template,
        newScore: tweet.finalScore
      });
    }
    return true; // Keep all tweets but with penalty
  });
  
  log('INFO', `Viral templates penalized: ${filterStats.viralTemplateFiltered}`);
  
  // ============ Promotional Content / Soft Article Detection ============
  // Filter out advertisements, crypto promotions, product plugs disguised as user content
  filterStats.promoFiltered = 0;
  filterStats.promoPenalized = 0;
  
  const PROMO_HARD_PENALTY = 0;      // Hard promo = filter out completely
  const PROMO_MEDIUM_PENALTY = 0.2;  // Medium promo = 80% penalty
  const PROMO_SOFT_PENALTY = 0.5;    // Soft promo = 50% penalty
  
  const nonPromoTweets = nonViralTweets.filter(tweet => {
    const promoCheck = isPromotionalContent(tweet.text);
    if (promoCheck.isPromo) {
      if (promoCheck.severity === 'hard') {
        // Hard promo (direct ads, crypto撸毛) = filter out
        filterStats.promoFiltered++;
        log('DEBUG', `Promotional content filtered: ${tweet.url}`, {
          pattern: promoCheck.pattern,
          text: tweet.text?.substring(0, 80)
        });
        return false;
      } else if (promoCheck.severity === 'medium') {
        // Medium promo = heavy penalty
        tweet.finalScore = Math.round(tweet.finalScore * PROMO_MEDIUM_PENALTY * 10) / 10;
        tweet.promoPenalty = true;
        tweet.promoPattern = promoCheck.pattern;
        filterStats.promoPenalized++;
        log('DEBUG', `Promotional content penalized (medium): ${tweet.url}`, {
          pattern: promoCheck.pattern,
          newScore: tweet.finalScore
        });
      } else {
        // Soft promo = moderate penalty
        tweet.finalScore = Math.round(tweet.finalScore * PROMO_SOFT_PENALTY * 10) / 10;
        tweet.promoPenalty = true;
        tweet.promoPattern = promoCheck.pattern;
        filterStats.promoPenalized++;
        log('DEBUG', `Promotional content penalized (soft): ${tweet.url}`, {
          pattern: promoCheck.pattern,
          newScore: tweet.finalScore
        });
      }
    }
    return true;
  });
  
  log('INFO', `Promotional content: ${filterStats.promoFiltered} filtered, ${filterStats.promoPenalized} penalized`);
  
  // ============ KOL Author Verification ============
  // Verify that KOL tweets are actually from the expected KOL accounts
  filterStats.kolAuthorMismatch = 0;
  
  const kolVerifiedTweets = nonPromoTweets.filter(t => {
    if (t.originalGroup === 'kol') {
      const authorHandle = t.author?.replace('@', '').toLowerCase();
      if (!KOL_HANDLES.has(authorHandle)) {
        filterStats.kolAuthorMismatch++;
        log('DEBUG', `KOL author mismatch: expected KOL but got ${t.author}`, { 
          url: t.url,
          sourceQuery: t.sourceQuery
        });
        return false;
      }
    }
    return true;
  });
  
  log('INFO', `After KOL author verification: ${kolVerifiedTweets.length} (mismatched: ${filterStats.kolAuthorMismatch})`);
  
  // ============ KOL Strict Relevance Check ============
  // KOL tweets need higher FiloFit score to be included
  filterStats.kolRelevanceFiltered = 0;
  
  const qualifiedTweets = kolVerifiedTweets.filter(t => {
    // KOL tweets must have higher relevance
    if (t.originalGroup === 'kol') {
      if (t.filoFitScore < QUALITY_CONFIG.kolMinFiloFitScore) {
        filterStats.kolRelevanceFiltered++;
        log('DEBUG', `KOL relevance too low: ${t.url}`, { 
          author: t.author,
          filoFitScore: t.filoFitScore,
          required: QUALITY_CONFIG.kolMinFiloFitScore
        });
        return false;
      }
    }
    
    // Apply minimum final score threshold - quality over quantity for all groups
    if (t.group === 'sentiment') {
      if (t.finalScore < QUALITY_CONFIG.sentimentMinFinalScore) {
        filterStats.sentimentMinScoreFiltered = (filterStats.sentimentMinScoreFiltered || 0) + 1;
        log('DEBUG', `Sentiment score below threshold: ${t.url}`, { 
          finalScore: t.finalScore,
          required: QUALITY_CONFIG.sentimentMinFinalScore
        });
        return false;
      }
      return true;
    }
    if (t.group === 'insight') {
      if (t.finalScore < QUALITY_CONFIG.insightMinFinalScore) {
        filterStats.insightMinScoreFiltered++;
        log('DEBUG', `Insight score below threshold: ${t.url}`, { 
          finalScore: t.finalScore,
          required: QUALITY_CONFIG.insightMinFinalScore
        });
        return false;
      }
      return true;
    }
    if (t.finalScore < QUALITY_CONFIG.minFinalScore) {
      log('DEBUG', `Score below threshold: ${t.url}`, { 
        finalScore: t.finalScore,
        required: QUALITY_CONFIG.minFinalScore
      });
      return false;
    }
    
    return true;
  });
  
  log('INFO', `After KOL strict relevance: ${qualifiedTweets.length} (KOL filtered: ${filterStats.kolRelevanceFiltered})`);
  
  // Handle empty results
  if (qualifiedTweets.length === 0) {
    log('WARN', 'No tweets passed all filters');
    return {
      runDate: rawData.runDate,
      runAt: rawData.runAt,
      selectionStats: {
        totalCandidates: allTweets.length,
        uniqueAfterDedup: uniqueTweets.length,
        ...filterStats,
        qualified: 0,
        aiPicked: 0,
        warning: 'NO_TWEETS_PASSED_FILTERS'
      },
      qualityConfig: QUALITY_CONFIG,
      top: []
    };
  }
  
  // ============ KOL Deduplication (max 1 per KOL) ============
  const kolCounts = {};
  const dedupedTweets = qualifiedTweets.filter(t => {
    if (t.originalGroup === 'kol' && t.author) {
      const handle = t.author.toLowerCase();
      const currentCount = kolCounts[handle] || 0;
      
      if (currentCount >= MAX_PER_KOL) {
        log('DEBUG', `KOL limit reached for ${t.author}, skipping`, { url: t.url });
        return false;
      }
      
      kolCounts[handle] = currentCount + 1;
    }
    return true;
  });
  
  log('INFO', `After KOL dedup (max ${MAX_PER_KOL} per KOL): ${dedupedTweets.length}`);
  
  // ============ Final Selection - All Qualified Tweets ============
  // Sort by score, mark top N as AI-picked
  const sortedTweets = dedupedTweets.sort((a, b) => b.finalScore - a.finalScore);
  
  const finalSelection = sortedTweets.map((t, idx) => ({
    rank: idx + 1,
    aiPicked: idx < QUALITY_CONFIG.aiPickTopN, // Top N are AI-picked
    group: t.group,
    originalGroup: t.originalGroup,
    sourceQuery: t.sourceQuery,
    url: t.url,
    author: t.author,
    datetime: t.datetime,
    text: t.text,
    likes: t.likes,
    retweets: t.retweets,
    replies: t.replies,
    // Scoring details (NEW: relevance-first scoring)
    rawEngagement: t.rawEngagement,
    viralityScore: t.viralityScore,
    filoFitScore: t.filoFitScore,
    filoFitKeywordCount: t.filoFitKeywordCount,
    textBonus: t.textBonus,
    painEmotionBonus: t.painEmotionBonus || 0,      // NEW: bonus for pain emotion words
    requestSignalBonus: t.requestSignalBonus || 0,  // NEW: bonus for request signals
    painBonus: t.painBonus,
    finalScore: t.finalScore,
    // Safety metadata
    safetyTier: t.safetyTier,
    lowSignalPenalty: t.lowSignalPenalty || false,
    noEmotionPenalty: t.noEmotionPenalty || false,
    customerServicePenalty: t.customerServicePenalty || false,
    competitorPenalty: t.competitorPenalty || false,
    viralTemplatePenalty: t.viralTemplatePenalty || false,
    relevanceKeywords: t.relevanceKeywords || [],
    painEmotionWords: t._emotionWords || t.painEmotionWords || [],
    strongEmotionWords: t._strongEmotionWords || [],  // NEW: strong emotion words
    weakEmotionWords: t._weakEmotionWords || [],      // NEW: weak signal words
    requestPatterns: t._requestPatterns || [],        // NEW: matched request patterns
    isCSReply: t.isCSReply || false,                  // NEW: is customer service reply
    promoPenalty: t.promoPenalty || false,            // NEW: promotional content penalty
    promoPattern: t.promoPattern || null,             // NEW: detected promo pattern
    // Sentiment label (for sentiment group)
    ...(t.sentimentLabel && { sentimentLabel: t.sentimentLabel }),
    // Insight type (for insight group)
    ...(t.insightType && { insightType: t.insightType }),
    // Additional penalty details (if applicable)
    ...(t.customerServicePattern && { customerServicePattern: t.customerServicePattern }),
    ...(t.competitorProduct && { competitorProduct: t.competitorProduct }),
    ...(t.viralTemplate && { viralTemplate: t.viralTemplate }),
    ...(t.lowSignalWarning && { lowSignalWarning: t.lowSignalWarning })
  }));
  
  // Count stats by group
  const painCount = finalSelection.filter(t => t.group === 'pain').length;
  const reachCount = finalSelection.filter(t => t.group === 'reach').length;
  const kolCount = finalSelection.filter(t => t.originalGroup === 'kol').length;
  const sentimentCount = finalSelection.filter(t => t.group === 'sentiment').length;
  const insightCount = finalSelection.filter(t => t.group === 'insight').length;
  const aiPickedCount = finalSelection.filter(t => t.aiPicked).length;
  
  // Count sentiment labels
  const sentimentPositive = finalSelection.filter(t => t.sentimentLabel === 'positive').length;
  const sentimentNegative = finalSelection.filter(t => t.sentimentLabel === 'negative').length;
  const sentimentNeutral = finalSelection.filter(t => t.sentimentLabel === 'neutral').length;
  
  // Count insight types
  const insightFeatureRequest = finalSelection.filter(t => t.insightType === 'feature_request').length;
  const insightCompetitorPraise = finalSelection.filter(t => t.insightType === 'competitor_praise').length;
  const insightAiDemand = finalSelection.filter(t => t.insightType === 'ai_demand').length;
  
  // Count distinct KOLs
  const kolsInFinal = finalSelection
    .filter(t => t.originalGroup === 'kol')
    .map(t => t.author?.toLowerCase())
    .filter(Boolean);
  const distinctKOLs = new Set(kolsInFinal).size;
  
  const stats = {
    totalCandidates: allTweets.length,
    uniqueAfterDedup: uniqueTweets.length,
    freshAfterAgeFilter: freshTweets.length,
    ...filterStats,
    qualified: finalSelection.length,
    aiPicked: aiPickedCount,
    byGroup: {
      pain: painCount,
      reach: reachCount,
      kol: kolCount,
      sentiment: sentimentCount,
      insight: insightCount
    },
    bySentiment: {
      positive: sentimentPositive,
      negative: sentimentNegative,
      neutral: sentimentNeutral
    },
    byInsightType: {
      feature_request: insightFeatureRequest,
      competitor_praise: insightCompetitorPraise,
      ai_demand: insightAiDemand
    },
    distinctKOLs
  };
  
  log('INFO', 'Selection complete', stats);
  
  return {
    runDate: rawData.runDate,
    runAt: rawData.runAt,
    selectionStats: stats,
    qualityConfig: QUALITY_CONFIG,
    top: finalSelection
  };
}

/**
 * Check if today is Monday (for weekend data aggregation)
 */
function isMonday() {
  const now = new Date();
  // Use Beijing timezone for consistency
  const beijingOffset = 8 * 60; // UTC+8 in minutes
  const localOffset = now.getTimezoneOffset();
  const beijingTime = new Date(now.getTime() + (beijingOffset + localOffset) * 60 * 1000);
  return beijingTime.getDay() === 1;
}

/**
 * Get date string for N days ago
 */
function getDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

/**
 * Load and merge raw data from multiple days
 */
function loadAggregatedData(lookbackDays) {
  const allSources = [];
  const loadedDates = [];
  let latestRunAt = null;
  
  for (let i = 0; i < lookbackDays; i++) {
    const dateStr = getDateDaysAgo(i);
    const rawFile = join('out', dateStr, 'raw.json');
    
    if (existsSync(rawFile)) {
      try {
        const data = JSON.parse(readFileSync(rawFile, 'utf-8'));
        if (data.sources && data.sources.length > 0) {
          allSources.push(...data.sources);
          loadedDates.push(dateStr);
          
          // Track latest runAt
          if (!latestRunAt || (data.runAt && data.runAt > latestRunAt)) {
            latestRunAt = data.runAt;
          }
          
          log('INFO', `Loaded data from ${dateStr}`, { 
            sources: data.sources.length 
          });
        }
      } catch (e) {
        log('WARN', `Failed to load ${rawFile}`, { error: e.message });
      }
    } else {
      log('DEBUG', `No data file for ${dateStr}`);
    }
  }
  
  return {
    sources: allSources,
    loadedDates,
    runAt: latestRunAt || new Date().toISOString(),
    runDate: getTodayDate(),
    aggregatedDays: loadedDates.length
  };
}

async function main() {
  log('INFO', '=== Starting Selection Process ===');
  log('INFO', `Config: MIN_FILO_FIT=${MIN_FILO_FIT}`);
  
  // Check if Monday - aggregate weekend data
  const monday = isMonday();
  const lookbackDays = monday ? MONDAY_LOOKBACK_DAYS : 1;
  
  log('INFO', monday 
    ? `Monday detected - aggregating ${MONDAY_LOOKBACK_DAYS} days of data (Sat+Sun+Mon)`
    : 'Regular weekday - using today\'s data only'
  );
  
  let rawData;
  let aggregationInfo = null;
  
  if (lookbackDays > 1) {
    // Monday: aggregate multiple days
    rawData = loadAggregatedData(lookbackDays);
    aggregationInfo = {
      isAggregated: true,
      aggregatedDays: rawData.aggregatedDays,
      loadedDates: rawData.loadedDates
    };
    log('INFO', `Aggregated data loaded`, { 
      totalSources: rawData.sources.length,
      dates: rawData.loadedDates
    });
  } else {
    // Regular day: single file
    const inputFile = getInputPath('raw.json');
    rawData = JSON.parse(readFileSync(inputFile, 'utf-8'));
    log('INFO', `Loaded raw data from ${inputFile}`, { 
      sources: rawData.sources?.length,
      runDate: rawData.runDate,
      runAt: rawData.runAt 
    });
  }
  
  // Use runDate from raw data to ensure consistent directory
  const runDate = rawData.runDate || getTodayDate();
  const outputFile = getOutputPath('top10.json', runDate);
  
  // Select top 10
  const result = selectTop10(rawData);
  
  // Add aggregation info if applicable
  if (aggregationInfo) {
    result.aggregationInfo = aggregationInfo;
  }
  
  // Write output
  writeFileSync(outputFile, JSON.stringify(result, null, 2));
  log('INFO', `Output written to ${outputFile}`, { 
    selected: result.top.length,
    aggregated: aggregationInfo?.isAggregated || false
  });
  
  // Copy to latest directory
  copyToLatest(getOutputDir(runDate));
  log('INFO', 'Copied to out/latest/');
}

main().catch(err => {
  log('ERROR', 'Selection failed', { error: err.message });
  process.exit(1);
});
