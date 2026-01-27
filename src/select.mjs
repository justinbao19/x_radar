import { readFileSync, writeFileSync, existsSync } from 'fs';
import { log, getInputPath, getOutputPath, copyToLatest, getOutputDir } from './utils.mjs';

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
import { 
  checkBrandSafety,
  checkMinFiloFit,
  checkPainRelevance,
  checkReachRelevance,
  countFiloFitKeywords,
  isEmailActionOnly,
  checkPainEmotion,
  MIN_FILO_FIT,
  LOW_SIGNAL_PENALTY
} from './safety.mjs';

// Quality threshold config (replaces fixed quota)
const QUALITY_CONFIG = {
  aiPickTopN: 10,           // Number of AI-picked tweets for quick view
  kolMinFiloFitScore: 20,   // KOL tweets need at least 4 keywords (20 = 4 * 5) - raised from 15
  minFinalScore: 50,        // Minimum score to be included - raised from 30
  noEmotionPenalty: 0.5     // Score penalty for pain tweets without emotion words
};

// Freshness filter - only keep tweets from last N days
const MAX_TWEET_AGE_DAYS = 7;

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

// Max tweets per KOL in final selection (prevent single KOL domination)
const MAX_PER_KOL = 1;

/**
 * Calculate scores for a tweet
 * Uses logarithmic compression for viralityScore to reduce KOL dominance
 */
function scoreTweet(tweet, group = null) {
  // Raw engagement score
  const rawEngagement = (tweet.likes || 0) * 2 + 
                        (tweet.retweets || 0) * 2 + 
                        (tweet.replies || 0) * 1.5;
  
  // Apply logarithmic compression to reduce KOL advantage
  // log10(1 + 14938) * 100 ≈ 417, log10(1 + 31) * 100 ≈ 149
  const viralityScore = Math.log10(1 + rawEngagement) * 100;
  
  const keywordMatchCount = countKeywordMatches(tweet.text);
  const filoFitScore = keywordMatchCount * 5;
  const textBonus = (tweet.text && tweet.text.length > 20) ? 5 : 0;
  
  let finalScore = viralityScore + filoFitScore + textBonus;
  
  // Apply pain group bonus (pain tweets are more valuable)
  const painBonus = (group === 'pain') ? PAIN_GROUP_BONUS : 1;
  finalScore = finalScore * painBonus;
  
  return {
    viralityScore: Math.round(viralityScore * 10) / 10,
    rawEngagement: Math.round(rawEngagement * 10) / 10,
    filoFitScore,
    filoFitKeywordCount: keywordMatchCount,
    textBonus,
    painBonus,
    finalScore: Math.round(finalScore * 10) / 10
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
      allTweets.push({
        ...tweet,
        group: source.group === 'kol' ? 'reach' : source.group,
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
  
  // ============ Three-Tier Brand Safety Gate ============
  const filterStats = {
    tooOldFiltered,
    hardFiltered: 0,
    hardReasons: {},
    softFiltered: 0,
    softReasons: {},
    lowSignalPenalized: 0,
    filoFitFiltered: 0,
    relevanceFiltered: 0
  };
  
  // First pass: score all tweets (needed for soft tier decisions)
  // Pass group for pain bonus calculation
  const scoredTweets = freshTweets.map(t => ({
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
  const filoFitQualified = filteredTweets.filter(t => {
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
  
  log('INFO', `After FiloFit threshold (>=${MIN_FILO_FIT}): ${filoFitQualified.length} (filtered: ${filterStats.filoFitFiltered})`);
  
  // ============ Group Relevance Check ============
  const relevantTweets = filoFitQualified.filter(t => {
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
  filterStats.emailActionOnlyFiltered = 0;
  filterStats.noEmotionPenalized = 0;
  
  const contextQualifiedTweets = relevantTweets.filter(t => {
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
  
  // ============ KOL Author Verification ============
  // Verify that KOL tweets are actually from the expected KOL accounts
  filterStats.kolAuthorMismatch = 0;
  
  const kolVerifiedTweets = contextQualifiedTweets.filter(t => {
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
    
    // Apply minimum final score threshold
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
    // Scoring details
    rawEngagement: t.rawEngagement,
    viralityScore: t.viralityScore,
    filoFitScore: t.filoFitScore,
    filoFitKeywordCount: t.filoFitKeywordCount,
    textBonus: t.textBonus,
    painBonus: t.painBonus,
    finalScore: t.finalScore,
    // Safety metadata
    safetyTier: t.safetyTier,
    lowSignalPenalty: t.lowSignalPenalty || false,
    noEmotionPenalty: t.noEmotionPenalty || false,
    relevanceKeywords: t.relevanceKeywords || [],
    painEmotionWords: t.painEmotionWords || []
  }));
  
  // Count stats by group
  const painCount = finalSelection.filter(t => t.group === 'pain').length;
  const reachCount = finalSelection.filter(t => t.group === 'reach').length;
  const kolCount = finalSelection.filter(t => t.originalGroup === 'kol').length;
  const aiPickedCount = finalSelection.filter(t => t.aiPicked).length;
  
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
      kol: kolCount
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

async function main() {
  log('INFO', '=== Starting Selection Process ===');
  log('INFO', `Config: MIN_FILO_FIT=${MIN_FILO_FIT}`);
  
  // Read raw data from latest (or date-specific directory)
  const inputFile = getInputPath('raw.json');
  const rawData = JSON.parse(readFileSync(inputFile, 'utf-8'));
  
  // Use runDate from raw data to ensure consistent directory
  const runDate = rawData.runDate;
  const outputFile = getOutputPath('top10.json', runDate);
  
  log('INFO', `Loaded raw data from ${inputFile}`, { 
    sources: rawData.sources?.length,
    runDate: runDate,
    runAt: rawData.runAt 
  });
  
  // Select top 10
  const result = selectTop10(rawData);
  
  // Write output
  writeFileSync(outputFile, JSON.stringify(result, null, 2));
  log('INFO', `Output written to ${outputFile}`, { 
    selected: result.top.length 
  });
  
  // Copy to latest directory
  copyToLatest(getOutputDir(runDate));
  log('INFO', 'Copied to out/latest/');
}

main().catch(err => {
  log('ERROR', 'Selection failed', { error: err.message });
  process.exit(1);
});
