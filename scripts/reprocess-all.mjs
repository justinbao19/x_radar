/**
 * Reprocess all historical data with the latest filtering logic
 * - Does NOT change timestamps
 * - Preserves existing comments where available
 * - Applies new scoring/filtering to all tweets
 * - Disables freshness filter for historical data
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Import selection logic
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
  LOW_SIGNAL_PENALTY
} from '../src/safety.mjs';

// ============ Configuration ============
const OUT_DIR = 'out';
const SKIP_FRESHNESS_FILTER = true; // For historical reprocessing

// Quality config (same as select.mjs)
const QUALITY_CONFIG = {
  aiPickTopN: 20,
  kolMinFiloFitScore: 40,
  minFinalScore: 50,
  insightMinFinalScore: 40,
  insightMinFiloFitScore: 20,
  sentimentMinFinalScore: 15,
  noEmotionPenalty: 0.5,
  filoFitMultiplier: 20,
  viralityMultiplier: 20,
  strongEmotionBonus: 30,
  weakEmotionBonus: 10,
  requestSignalBonus: 25
};

const PAIN_GROUP_BONUS = 3;
const CUSTOMER_SERVICE_PENALTY = 0.3;
const COMPETITOR_PENALTY = 0.25;
const VIRAL_TEMPLATE_PENALTY = 0.15;
const PROMO_HARD_PENALTY = 0;
const PROMO_MEDIUM_PENALTY = 0.2;
const PROMO_SOFT_PENALTY = 0.5;
const MAX_PER_KOL = 1;

// FiloFit keywords
const FILO_KEYWORDS = {
  en: ['inbox', 'email', 'gmail', 'newsletter', 'newsletters', 'notifications', 'notification',
       'noise', 'spam', 'summarize', 'summary', 'search', 'find', 'finding',
       'todo', 'task', 'tasks', 'triage', 'organize', 'overload', 'unsubscribe',
       'overwhelming', 'productivity', 'workflow', 'automation', 'AI', 'agent'],
  jp: ['メール', '受信トレイ', '通知', '迷惑メール', 'スパム', '検索', '見つからない',
       '要約', 'タスク', '整理', 'メルマガ', '生産性', '自動化', 'AIエージェント',
       '情報過多', 'うざい', '最悪'],
  cn: ['邮箱', '收件箱', '通知', '垃圾邮件', '搜索', '找不到', '总结', '待办',
       '任务', '整理', '降噪', '邮件', '生产力', '自动化', '效率', '太多']
};

const ALL_KEYWORDS = [
  ...FILO_KEYWORDS.en.map(k => k.toLowerCase()),
  ...FILO_KEYWORDS.jp,
  ...FILO_KEYWORDS.cn
];

// Request signal patterns
const REQUEST_SIGNAL_PATTERNS = [
  /\b(wish|hope|want|need|should have|would be great|would love|please add)\b/i,
  /\b(why doesn'?t|why can'?t|why isn'?t|if only|looking for)\b/i,
  /\b(feature request|needs to have|any app|any tool|recommend|suggestion)\b/i,
  /(欲しい|したい|あったらいい|要望|機能|できれば|探している)/,
  /(希望|想要|要是能|功能|需求|期待|能不能|建议|最好|求推荐|有没有)/
];

// Load KOL handles
let KOL_HANDLES = new Set();
if (existsSync('influencers.json')) {
  try {
    const influencers = JSON.parse(readFileSync('influencers.json', 'utf-8'));
    KOL_HANDLES = new Set((influencers.handles || []).map(h => h.toLowerCase()));
  } catch (e) {}
}

function log(level, msg, data = {}) {
  const timestamp = new Date().toISOString();
  const icon = level === 'INFO' ? 'ℹ️' : level === 'WARN' ? '⚠️' : level === 'ERROR' ? '❌' : '🔍';
  console.log(`${timestamp} ${icon} [${level}] ${msg}`, Object.keys(data).length ? JSON.stringify(data) : '');
}

function countKeywordMatches(text) {
  if (!text) return 0;
  const lowerText = text.toLowerCase();
  let count = 0;
  for (const keyword of ALL_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) count++;
  }
  return count;
}

function hasRequestSignal(text) {
  if (!text) return { hasSignal: false, patterns: [] };
  const matchedPatterns = [];
  for (const pattern of REQUEST_SIGNAL_PATTERNS) {
    if (pattern.test(text)) matchedPatterns.push(pattern.source);
  }
  return { hasSignal: matchedPatterns.length > 0, patterns: matchedPatterns };
}

function scoreTweet(tweet, group = null) {
  const rawEngagement = (tweet.likes || 0) * 2 + (tweet.retweets || 0) * 2 + (tweet.replies || 0) * 1.5;
  const viralityScore = Math.log10(1 + rawEngagement) * QUALITY_CONFIG.viralityMultiplier;
  const keywordMatchCount = countKeywordMatches(tweet.text);
  const filoFitScore = keywordMatchCount * QUALITY_CONFIG.filoFitMultiplier;
  const textBonus = (tweet.text && tweet.text.length > 50) ? 10 : (tweet.text && tweet.text.length > 20) ? 5 : 0;
  
  const csCheck = isCustomerServiceNotice(tweet.text);
  const isCSReply = csCheck.isNotice;
  
  const emotionCheck = checkPainEmotion(tweet.text);
  let painEmotionBonus = 0;
  if (emotionCheck.hasStrongEmotion) {
    painEmotionBonus = QUALITY_CONFIG.strongEmotionBonus;
  } else if (emotionCheck.hasPainEmotion && !isCSReply) {
    painEmotionBonus = QUALITY_CONFIG.weakEmotionBonus;
  }
  
  const requestCheck = hasRequestSignal(tweet.text);
  const requestSignalBonus = (requestCheck.hasSignal && !isCSReply) ? QUALITY_CONFIG.requestSignalBonus : 0;
  
  let finalScore = filoFitScore + painEmotionBonus + requestSignalBonus + viralityScore + textBonus;
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
    isCSReply,
    _emotionWords: emotionCheck.words || [],
    _strongEmotionWords: emotionCheck.strongWords || [],
    _weakEmotionWords: emotionCheck.weakWords || [],
    _requestPatterns: requestCheck.patterns || []
  };
}

// Filo brand keywords for sentiment
const FILO_BRAND_KEYWORDS = ['filomail', 'filo mail', 'filo_mail', '@filo_mail', 'filoメール', 'filo邮件', 'filo郵件'];

function mentionsFilo(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return FILO_BRAND_KEYWORDS.some(kw => lowerText.includes(kw.toLowerCase()));
}

function classifySentiment(text) {
  if (!text) return 'neutral';
  const negativePatterns = [/\b(bug|bugs|broken|issue|issues|problem|problems)\b/i, /\b(hate|worst|terrible|disappointed)\b/i];
  for (const pattern of negativePatterns) if (pattern.test(text)) return 'negative';
  const positivePatterns = [/\b(love|loving|loved|amazing|awesome|great|excellent)\b/i, /\b(best|recommend|recommended|helpful)\b/i];
  for (const pattern of positivePatterns) if (pattern.test(text)) return 'positive';
  return 'neutral';
}

function classifyInsightType(text, sourceName = '') {
  if (!text) return 'general';
  if (sourceName.includes('competitor')) return 'competitor_praise';
  if (sourceName.includes('ai-email') || sourceName.includes('ai_email')) return 'ai_demand';
  return 'general';
}

function processRawData(rawData, existingComments = {}) {
  const allTweets = [];
  
  for (const source of rawData.sources || []) {
    for (const tweet of source.tweets || []) {
      let group = source.group;
      if (source.group === 'kol') group = 'reach';
      allTweets.push({ ...tweet, group, sourceQuery: source.name, originalGroup: source.group });
    }
  }
  
  log('INFO', `Total tweets: ${allTweets.length}`);
  
  // Deduplicate
  const seenUrls = new Set();
  const uniqueTweets = allTweets.filter(t => {
    if (!t.url || seenUrls.has(t.url)) return false;
    seenUrls.add(t.url);
    return true;
  });
  
  log('INFO', `After dedup: ${uniqueTweets.length}`);
  
  // SKIP freshness filter for historical data
  const freshTweets = uniqueTweets;
  
  // Score all tweets
  const scoredTweets = freshTweets.map(t => ({ ...t, ...scoreTweet(t, t.group) }));
  
  // Brand safety filter
  const filterStats = { hardFiltered: 0, softFiltered: 0, lowSignalPenalized: 0, filoFitFiltered: 0, relevanceFiltered: 0 };
  
  let filteredTweets = scoredTweets.filter(tweet => {
    const safetyCheck = checkBrandSafety(tweet.text, tweet.filoFitScore);
    if (safetyCheck.action === 'drop') {
      if (safetyCheck.tier === 'hard') filterStats.hardFiltered++;
      else filterStats.softFiltered++;
      return false;
    }
    if (safetyCheck.action === 'penalize') {
      tweet.finalScore = Math.round(tweet.finalScore * LOW_SIGNAL_PENALTY * 10) / 10;
      tweet.lowSignalPenalty = true;
      filterStats.lowSignalPenalized++;
    }
    tweet.safetyTier = safetyCheck.tier || 'clean';
    return true;
  });
  
  // FiloFit filter
  filteredTweets = filteredTweets.filter(t => {
    if (t.group === 'sentiment') return mentionsFilo(t.text);
    if (t.group === 'insight') return t.filoFitScore >= QUALITY_CONFIG.insightMinFiloFitScore;
    const check = checkMinFiloFit(t.filoFitScore);
    if (!check.pass) { filterStats.filoFitFiltered++; return false; }
    return true;
  });
  
  // Relevance filter
  filteredTweets = filteredTweets.filter(t => {
    if (t.group === 'sentiment') { t.sentimentLabel = classifySentiment(t.text); return true; }
    if (t.group === 'insight') { t.insightType = classifyInsightType(t.text, t.sourceQuery); return true; }
    let relevanceCheck = t.group === 'pain' ? checkPainRelevance(t.text) : checkReachRelevance(t.text);
    t.relevanceKeywords = relevanceCheck.keywords || [];
    if (!relevanceCheck.relevant) { filterStats.relevanceFiltered++; return false; }
    return true;
  });
  
  // Email action only filter
  filteredTweets = filteredTweets.filter(t => {
    if (t.group === 'pain' && isEmailActionOnly(t.text)) return false;
    return true;
  });
  
  // Customer service penalty
  for (const tweet of filteredTweets) {
    const csCheck = isCustomerServiceNotice(tweet.text);
    if (csCheck.isNotice) {
      tweet.finalScore = Math.round(tweet.finalScore * CUSTOMER_SERVICE_PENALTY * 10) / 10;
      tweet.customerServicePenalty = true;
    }
  }
  
  // Competitor penalty
  for (const tweet of filteredTweets) {
    const compCheck = isCompetitorPromotion(tweet.text);
    if (compCheck.isPromotion) {
      tweet.finalScore = Math.round(tweet.finalScore * COMPETITOR_PENALTY * 10) / 10;
      tweet.competitorPenalty = true;
    }
  }
  
  // Viral template penalty
  for (const tweet of filteredTweets) {
    const viralCheck = isViralTemplate(tweet.text);
    if (viralCheck.isViral) {
      tweet.finalScore = Math.round(tweet.finalScore * VIRAL_TEMPLATE_PENALTY * 10) / 10;
      tweet.viralTemplatePenalty = true;
    }
  }
  
  // Promotional content filter
  filteredTweets = filteredTweets.filter(tweet => {
    const promoCheck = isPromotionalContent(tweet.text);
    if (promoCheck.isPromo) {
      if (promoCheck.severity === 'hard') return false;
      const penalty = promoCheck.severity === 'medium' ? PROMO_MEDIUM_PENALTY : PROMO_SOFT_PENALTY;
      tweet.finalScore = Math.round(tweet.finalScore * penalty * 10) / 10;
      tweet.promoPenalty = true;
      tweet.promoPattern = promoCheck.pattern;
    }
    return true;
  });
  
  // KOL verification
  filteredTweets = filteredTweets.filter(t => {
    if (t.originalGroup === 'kol') {
      const authorHandle = t.author?.replace('@', '').toLowerCase();
      if (!KOL_HANDLES.has(authorHandle)) return false;
      if (t.filoFitScore < QUALITY_CONFIG.kolMinFiloFitScore) return false;
    }
    return true;
  });
  
  // Min score filter
  filteredTweets = filteredTweets.filter(t => {
    if (t.group === 'sentiment') return t.finalScore >= QUALITY_CONFIG.sentimentMinFinalScore;
    if (t.group === 'insight') return t.finalScore >= QUALITY_CONFIG.insightMinFinalScore;
    return t.finalScore >= QUALITY_CONFIG.minFinalScore;
  });
  
  // KOL dedup
  const kolCounts = {};
  filteredTweets = filteredTweets.filter(t => {
    if (t.originalGroup === 'kol' && t.author) {
      const handle = t.author.toLowerCase();
      if ((kolCounts[handle] || 0) >= MAX_PER_KOL) return false;
      kolCounts[handle] = (kolCounts[handle] || 0) + 1;
    }
    return true;
  });
  
  // Sort and select
  const sortedTweets = filteredTweets.sort((a, b) => b.finalScore - a.finalScore);
  
  const finalSelection = sortedTweets.map((t, idx) => {
    // Preserve existing comments if available
    const existingData = existingComments[t.url] || {};
    
    return {
      rank: idx + 1,
      aiPicked: idx < QUALITY_CONFIG.aiPickTopN,
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
      rawEngagement: t.rawEngagement,
      viralityScore: t.viralityScore,
      filoFitScore: t.filoFitScore,
      filoFitKeywordCount: t.filoFitKeywordCount,
      textBonus: t.textBonus,
      painEmotionBonus: t.painEmotionBonus || 0,
      requestSignalBonus: t.requestSignalBonus || 0,
      painBonus: t.painBonus,
      finalScore: t.finalScore,
      safetyTier: t.safetyTier,
      lowSignalPenalty: t.lowSignalPenalty || false,
      noEmotionPenalty: t.noEmotionPenalty || false,
      customerServicePenalty: t.customerServicePenalty || false,
      competitorPenalty: t.competitorPenalty || false,
      viralTemplatePenalty: t.viralTemplatePenalty || false,
      promoPenalty: t.promoPenalty || false,
      promoPattern: t.promoPattern || null,
      relevanceKeywords: t.relevanceKeywords || [],
      painEmotionWords: t._emotionWords || [],
      strongEmotionWords: t._strongEmotionWords || [],
      weakEmotionWords: t._weakEmotionWords || [],
      requestPatterns: t._requestPatterns || [],
      isCSReply: t.isCSReply || false,
      // Preserve existing comments
      comments: existingData.comments || null,
      commentError: existingData.commentError || null,
      commentSkipped: existingData.commentSkipped || false,
      skipReason: existingData.skipReason,
      skipReasonZh: existingData.skipReasonZh,
      detectedLanguage: existingData.detectedLanguage || null,
      ...(t.sentimentLabel && { sentimentLabel: t.sentimentLabel }),
      ...(t.insightType && { insightType: t.insightType })
    };
  });
  
  const stats = {
    totalCandidates: allTweets.length,
    uniqueAfterDedup: uniqueTweets.length,
    freshAfterAgeFilter: freshTweets.length,
    ...filterStats,
    qualified: finalSelection.length,
    aiPicked: finalSelection.filter(t => t.aiPicked).length,
    byGroup: {
      pain: finalSelection.filter(t => t.group === 'pain').length,
      reach: finalSelection.filter(t => t.group === 'reach').length,
      kol: finalSelection.filter(t => t.originalGroup === 'kol').length,
      sentiment: finalSelection.filter(t => t.group === 'sentiment').length,
      insight: finalSelection.filter(t => t.group === 'insight').length
    }
  };
  
  return { selectionStats: stats, qualityConfig: QUALITY_CONFIG, top: finalSelection };
}

async function main() {
  log('INFO', '=== Reprocessing All Historical Data ===');
  
  // Find all date directories
  const entries = readdirSync(OUT_DIR, { withFileTypes: true });
  const dateDirs = entries
    .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map(e => e.name)
    .sort();
  
  log('INFO', `Found ${dateDirs.length} date directories: ${dateDirs.join(', ')}`);
  
  for (const dateDir of dateDirs) {
    const dirPath = join(OUT_DIR, dateDir);
    const rawPath = join(dirPath, 'raw.json');
    const top10Path = join(dirPath, 'top10.json');
    const commentsPath = join(dirPath, 'top10_with_comments.json');
    
    if (!existsSync(rawPath)) {
      log('WARN', `No raw.json in ${dateDir}, skipping`);
      continue;
    }
    
    log('INFO', `Processing ${dateDir}...`);
    
    // Read raw data
    const rawData = JSON.parse(readFileSync(rawPath, 'utf-8'));
    
    // Load existing comments (to preserve them)
    let existingComments = {};
    if (existsSync(commentsPath)) {
      try {
        const commentsData = JSON.parse(readFileSync(commentsPath, 'utf-8'));
        for (const tweet of commentsData.top || []) {
          if (tweet.url) {
            existingComments[tweet.url] = {
              comments: tweet.comments,
              commentError: tweet.commentError,
              commentSkipped: tweet.commentSkipped,
              skipReason: tweet.skipReason,
              skipReasonZh: tweet.skipReasonZh,
              detectedLanguage: tweet.detectedLanguage
            };
          }
        }
        log('INFO', `  Loaded ${Object.keys(existingComments).length} existing comments`);
      } catch (e) {
        log('WARN', `  Failed to load comments: ${e.message}`);
      }
    }
    
    // Process with new logic
    const result = processRawData(rawData, existingComments);
    
    // Preserve original timestamps
    result.runDate = rawData.runDate || dateDir;
    result.runAt = rawData.runAt;
    
    // Write updated top10.json
    writeFileSync(top10Path, JSON.stringify(result, null, 2));
    log('INFO', `  Written ${result.top.length} tweets to ${top10Path}`);
    log('INFO', `  AI Picked: ${result.selectionStats.aiPicked}, Comments preserved: ${result.top.filter(t => t.comments).length}`);
  }
  
  // Update latest symlink
  if (dateDirs.length > 0) {
    const latestDate = dateDirs[dateDirs.length - 1];
    const latestDir = join(OUT_DIR, latestDate);
    const latestPath = join(OUT_DIR, 'latest');
    
    // Copy latest to latest folder
    const files = ['raw.json', 'top10.json', 'top10.md', 'top10_with_comments.json', 'top10_with_comments.html', 'top10_with_comments.md'];
    for (const file of files) {
      const src = join(latestDir, file);
      const dst = join(latestPath, file);
      if (existsSync(src)) {
        writeFileSync(dst, readFileSync(src));
      }
    }
    log('INFO', `Updated latest/ with ${latestDate} data`);
  }
  
  log('INFO', '=== Reprocessing Complete ===');
}

main().catch(err => {
  log('ERROR', 'Reprocessing failed', { error: err.message });
  console.error(err);
  process.exit(1);
});
