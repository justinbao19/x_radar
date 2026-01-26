import { readFileSync, writeFileSync } from 'fs';
import { log } from './utils.mjs';

const INPUT_FILE = 'out/raw.json';
const OUTPUT_FILE = 'out/top10.json';

// Selection quota
const QUOTA = {
  pain: 4,
  reach: 6, // includes KOL
  total: 10
};

// FiloFit keywords for scoring
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

// All keywords flattened for matching
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
  
  const filoFitScore = countKeywordMatches(tweet.text) * 5;
  const textBonus = (tweet.text && tweet.text.length > 20) ? 5 : 0;
  const finalScore = viralityScore + filoFitScore + textBonus;
  
  return {
    viralityScore: Math.round(viralityScore * 10) / 10,
    filoFitScore,
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
        group: source.group === 'kol' ? 'reach' : source.group, // KOL counts as reach
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
  
  // Handle empty results
  if (uniqueTweets.length === 0) {
    log('WARN', 'No tweets found across all sources');
    return {
      runAt: rawData.runAt,
      selectionStats: {
        totalCandidates: 0,
        uniqueAfterDedup: 0,
        painSelected: 0,
        reachSelected: 0,
        backfilled: 0,
        warning: 'NO_TWEETS_FOUND'
      },
      quota: QUOTA,
      top: []
    };
  }
  
  // Score all tweets
  const scoredTweets = uniqueTweets.map(t => ({
    ...t,
    ...scoreTweet(t)
  }));
  
  // Split by group
  const painPool = scoredTweets
    .filter(t => t.group === 'pain')
    .sort((a, b) => b.finalScore - a.finalScore);
  
  const reachPool = scoredTweets
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
    // If pain is short, backfill from reach
    if (painPicked.length < QUOTA.pain) {
      const extraFromReach = reachPool.slice(reachPicked.length, reachPicked.length + remaining);
      selected.push(...extraFromReach);
      backfilled += extraFromReach.length;
    }
    // If reach is short, backfill from pain
    else if (reachPicked.length < QUOTA.reach) {
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
      textBonus: t.textBonus,
      finalScore: t.finalScore
    }));
  
  const stats = {
    totalCandidates: allTweets.length,
    uniqueAfterDedup: uniqueTweets.length,
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
  log('INFO', 'Starting selection process');
  
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
