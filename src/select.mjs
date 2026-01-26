import { readFileSync, writeFileSync } from 'fs';
import { log } from './utils.mjs';
import { 
  checkBrandSafety,
  checkMinFiloFit,
  checkPainRelevance,
  checkReachRelevance,
  countFiloFitKeywords,
  MIN_FILO_FIT,
  LOW_SIGNAL_PENALTY
} from './safety.mjs';

const INPUT_FILE = 'out/raw.json';
const OUTPUT_FILE = 'out/top10.json';

// Selection quota
const QUOTA = {
  pain: 4,
  reach: 6, // includes KOL
  total: 10
};

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

/**
 * Calculate scores for a tweet
 */
function scoreTweet(tweet) {
  const viralityScore = (tweet.likes || 0) * 2 + 
                        (tweet.retweets || 0) * 2 + 
                        (tweet.replies || 0) * 1.5;
  
  const keywordMatchCount = countKeywordMatches(tweet.text);
  const filoFitScore = keywordMatchCount * 5;
  const textBonus = (tweet.text && tweet.text.length > 20) ? 5 : 0;
  const finalScore = viralityScore + filoFitScore + textBonus;
  
  return {
    viralityScore: Math.round(viralityScore * 10) / 10,
    filoFitScore,
    filoFitKeywordCount: keywordMatchCount,
    textBonus,
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
  
  // ============ Three-Tier Brand Safety Gate ============
  const filterStats = {
    hardFiltered: 0,
    hardReasons: {},
    softFiltered: 0,
    softReasons: {},
    lowSignalPenalized: 0,
    filoFitFiltered: 0,
    relevanceFiltered: 0
  };
  
  // First pass: score all tweets (needed for soft tier decisions)
  const scoredTweets = uniqueTweets.map(t => ({
    ...t,
    ...scoreTweet(t)
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
  
  // Handle empty results
  if (relevantTweets.length === 0) {
    log('WARN', 'No tweets passed all filters');
    return {
      runAt: rawData.runAt,
      selectionStats: {
        totalCandidates: allTweets.length,
        uniqueAfterDedup: uniqueTweets.length,
        ...filterStats,
        painSelected: 0,
        reachSelected: 0,
        backfilled: 0,
        warning: 'NO_TWEETS_PASSED_FILTERS'
      },
      quota: QUOTA,
      top: []
    };
  }
  
  // Split by group
  const painPool = relevantTweets
    .filter(t => t.group === 'pain')
    .sort((a, b) => b.finalScore - a.finalScore);
  
  const reachPool = relevantTweets
    .filter(t => t.group === 'reach')
    .sort((a, b) => b.finalScore - a.finalScore);
  
  log('INFO', `Pain pool: ${painPool.length}, Reach pool: ${reachPool.length}`);
  
  // Select with quota
  const selected = [];
  
  // Pick from pain
  const painPicked = painPool.slice(0, QUOTA.pain);
  selected.push(...painPicked);
  
  // Pick from reach
  const reachPicked = reachPool.slice(0, QUOTA.reach);
  selected.push(...reachPicked);
  
  // Calculate backfill needed
  let backfilled = 0;
  const remaining = QUOTA.total - selected.length;
  
  if (remaining > 0) {
    if (painPicked.length < QUOTA.pain) {
      const extraFromReach = reachPool.slice(reachPicked.length, reachPicked.length + remaining);
      selected.push(...extraFromReach);
      backfilled += extraFromReach.length;
    } else if (reachPicked.length < QUOTA.reach) {
      const extraFromPain = painPool.slice(painPicked.length, painPicked.length + remaining);
      selected.push(...extraFromPain);
      backfilled += extraFromPain.length;
    }
  }
  
  // Final sort by score and add rank
  const finalSelection = selected
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, QUOTA.total)
    .map((t, idx) => ({
      rank: idx + 1,
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
      viralityScore: t.viralityScore,
      filoFitScore: t.filoFitScore,
      filoFitKeywordCount: t.filoFitKeywordCount,
      textBonus: t.textBonus,
      finalScore: t.finalScore,
      // Safety metadata
      safetyTier: t.safetyTier,
      lowSignalPenalty: t.lowSignalPenalty || false,
      relevanceKeywords: t.relevanceKeywords || []
    }));
  
  const stats = {
    totalCandidates: allTweets.length,
    uniqueAfterDedup: uniqueTweets.length,
    ...filterStats,
    qualifiedAfterFilters: relevantTweets.length,
    painPool: painPool.length,
    reachPool: reachPool.length,
    painSelected: finalSelection.filter(t => t.group === 'pain').length,
    reachSelected: finalSelection.filter(t => t.group === 'reach').length,
    backfilled
  };
  
  log('INFO', 'Selection complete', stats);
  
  return {
    runAt: rawData.runAt,
    selectionStats: stats,
    quota: QUOTA,
    top: finalSelection
  };
}

async function main() {
  log('INFO', '=== Starting Selection Process ===');
  log('INFO', `Config: MIN_FILO_FIT=${MIN_FILO_FIT}`);
  
  // Read raw data
  const rawData = JSON.parse(readFileSync(INPUT_FILE, 'utf-8'));
  log('INFO', `Loaded raw data from ${INPUT_FILE}`, { 
    sources: rawData.sources?.length,
    runAt: rawData.runAt 
  });
  
  // Select top 10
  const result = selectTop10(rawData);
  
  // Write output
  writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  log('INFO', `Output written to ${OUTPUT_FILE}`, { 
    selected: result.top.length 
  });
}

main().catch(err => {
  log('ERROR', 'Selection failed', { error: err.message });
  process.exit(1);
});
