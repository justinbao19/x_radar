import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { 
  log, parseEngagement, buildSearchUrl, ensureAbsoluteUrl, 
  randomBetween, sleep, cleanText, shuffle,
  getTodayDate, getOutputPath, copyToLatest, getOutputDir,
  cleanOldOutputDirs, appendToArchive, logOutputPaths
} from './utils.mjs';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_STATE_FILE = 'auth/state.json';
const AUTH_STATUS_FILE = 'out/auth-status.json';
const QUERIES_FILE = 'queries.json';
const INFLUENCERS_FILE = 'influencers.json';

// ============ Configuration ============

// Sampling configuration (env vars)
const MAX_SOURCES_PER_RUN = parseInt(process.env.MAX_SOURCES || '24', 10);
const SAMPLING_MODE = process.env.SAMPLING_MODE || 'random'; // 'random' or 'all'

// Group filter (optional): e.g. ONLY_GROUPS=sentiment,reach
const ONLY_GROUPS = (process.env.ONLY_GROUPS || '')
  .split(',')
  .map(g => g.trim())
  .filter(Boolean);
const ONLY_GROUPS_SET = new Set(ONLY_GROUPS);

// Sentiment lookback window (days) for search query
const SENTIMENT_LOOKBACK_DAYS = parseInt(process.env.SENTIMENT_LOOKBACK_DAYS || '7', 10);

// Runtime limit guard (minutes) - stops scraping if exceeded
const RUN_TIME_LIMIT_MIN = parseInt(process.env.RUN_TIME_LIMIT_MIN || '60', 10);

// Throttling configuration (configurable via env vars for tuning)
const PAGE_LOAD_WAIT_MIN = parseInt(process.env.PAGE_LOAD_WAIT_MIN || '4000', 10);
const PAGE_LOAD_WAIT_MAX = parseInt(process.env.PAGE_LOAD_WAIT_MAX || '8000', 10);
const BETWEEN_QUERIES_WAIT_MIN = parseInt(process.env.BETWEEN_QUERIES_WAIT_MIN || '15000', 10);
const BETWEEN_QUERIES_WAIT_MAX = parseInt(process.env.BETWEEN_QUERIES_WAIT_MAX || '30000', 10);
const SCROLL_WAIT_MIN = parseInt(process.env.SCROLL_WAIT_MIN || '2000', 10);
const SCROLL_WAIT_MAX = parseInt(process.env.SCROLL_WAIT_MAX || '4000', 10);

// Scroll configuration (increased depth for more content)
const MAX_SCROLL_ROUNDS = parseInt(process.env.MAX_SCROLL_ROUNDS || '12', 10);
const MIN_SCROLL_ROUNDS = parseInt(process.env.MIN_SCROLL_ROUNDS || '7', 10);
const SCROLL_DISTANCE_MIN = 600;
const SCROLL_DISTANCE_MAX = 1200;
const SCROLL_BACK_CHANCE = 0.2; // 20% chance to scroll back (more human-like)
const READ_PAUSE_CHANCE = 0.3; // 30% chance to pause for "reading" (human-like)
const READ_PAUSE_MIN = 1000;   // 1s minimum reading pause
const READ_PAUSE_MAX = 3000;   // 3s maximum reading pause

// Retry configuration
const MAX_RETRIES = 1;
const RETRY_BACKOFF_MS = 30000;

// ============ Selectors ============

const SELECTORS = {
  tweetContainer: ['article[data-testid="tweet"]', 'article[role="article"]'],
  tweetUrl: ['a[href*="/status/"]'],
  tweetText: ['div[data-testid="tweetText"]', '[data-testid="tweetText"]'],
  tweetTime: ['time[datetime]'],
  likeButton: ['button[data-testid="like"]', 'button[aria-label*="Like"]', 'button[aria-label*="like"]'],
  retweetButton: ['button[data-testid="retweet"]', 'button[aria-label*="Repost"]', 'button[aria-label*="repost"]'],
  replyButton: ['button[data-testid="reply"]', 'button[aria-label*="Reply"]', 'button[aria-label*="reply"]'],
  loginButton: ['[data-testid="loginButton"]', 'a[href="/login"]']
};

// ============ Helper Functions ============

/**
 * Get date string for N days ago
 */
function getDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

/**
 * Try multiple selectors and return first match
 */
async function $(element, selectors) {
  const sels = Array.isArray(selectors) ? selectors : [selectors];
  for (const sel of sels) {
    try {
      const result = await element.$(sel);
      if (result) return result;
    } catch (e) {
      continue;
    }
  }
  return null;
}

/**
 * Extract engagement count from a button's aria-label
 */
async function getEngagement(article, selectors) {
  try {
    const btn = await $(article, selectors);
    if (!btn) return 0;
    const label = await btn.getAttribute('aria-label');
    return parseEngagement(label);
  } catch (e) {
    return 0;
  }
}

/**
 * Extract a single tweet from an article element
 */
async function extractTweet(article) {
  const tweet = {
    url: null,
    author: null,
    datetime: null,
    text: null,
    likes: 0,
    retweets: 0,
    replies: 0
  };

  // URL
  try {
    const link = await $(article, SELECTORS.tweetUrl);
    if (link) {
      const href = await link.getAttribute('href');
      tweet.url = ensureAbsoluteUrl(href);
    }
  } catch (e) { /* ignore */ }

  // Author from URL
  if (tweet.url) {
    const match = tweet.url.match(/x\.com\/([^/]+)\/status/);
    if (match) tweet.author = `@${match[1]}`;
  }

  // Datetime
  try {
    const timeEl = await $(article, SELECTORS.tweetTime);
    if (timeEl) {
      tweet.datetime = await timeEl.getAttribute('datetime');
    }
  } catch (e) { /* ignore */ }

  // Text
  try {
    const textEl = await $(article, SELECTORS.tweetText);
    if (textEl) {
      tweet.text = cleanText(await textEl.innerText());
    }
  } catch (e) { /* ignore */ }

  // Engagement
  tweet.likes = await getEngagement(article, SELECTORS.likeButton);
  tweet.retweets = await getEngagement(article, SELECTORS.retweetButton);
  tweet.replies = await getEngagement(article, SELECTORS.replyButton);

  return tweet;
}

/**
 * Check if page requires login or shows error
 */
async function checkPageStatus(page) {
  try {
    const loginBtn = await $(page, SELECTORS.loginButton);
    if (loginBtn) return { ok: false, reason: 'LOGIN_REQUIRED', authFailed: true };
    
    const url = page.url();
    if (url.includes('/login') || url.includes('/i/flow/login')) {
      return { ok: false, reason: 'LOGIN_REDIRECT', authFailed: true };
    }
    
    // Check for error states
    const content = await page.content();
    if (content.includes('Something went wrong')) {
      return { ok: false, reason: 'ERROR_PAGE', authFailed: false };
    }
    if (content.includes('Rate limit') || content.includes('Too many requests')) {
      return { ok: false, reason: 'RATE_LIMIT', authFailed: false };
    }
    
    return { ok: true, authFailed: false };
  } catch (e) {
    return { ok: false, reason: 'CHECK_FAILED', authFailed: false };
  }
}

/**
 * Verify authentication by navigating to X home page
 */
async function verifyAuth(page) {
  log('INFO', 'Verifying X authentication status...');
  
  try {
    await page.goto('https://x.com/home', { 
      timeout: 30000,
      waitUntil: 'domcontentloaded'
    });
    
    await sleep(3000);
    
    const status = await checkPageStatus(page);
    
    if (status.authFailed) {
      log('ERROR', 'Authentication failed', { reason: status.reason });
      return { valid: false, reason: status.reason };
    }
    
    // Check for auth_token cookie
    const cookies = await page.context().cookies();
    const hasAuthCookie = cookies.some(c => c.name === 'auth_token');
    
    if (!hasAuthCookie) {
      log('ERROR', 'Auth token cookie missing');
      return { valid: false, reason: 'AUTH_TOKEN_MISSING' };
    }
    
    log('INFO', 'Authentication verified successfully');
    return { valid: true };
  } catch (e) {
    log('ERROR', 'Auth verification failed', { error: e.message });
    return { valid: false, reason: 'VERIFICATION_FAILED', error: e.message };
  }
}

/**
 * Save auth status to file for notification system
 */
function saveAuthStatus(status) {
  const outDir = 'out';
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  
  const authStatus = {
    ...status,
    checkedAt: new Date().toISOString()
  };
  
  writeFileSync(AUTH_STATUS_FILE, JSON.stringify(authStatus, null, 2));
  log('INFO', `Auth status saved to ${AUTH_STATUS_FILE}`, { valid: status.valid });
}

/**
 * Scroll page and wait for content to load
 * Limited depth scrolling with polite waits
 */
async function scrollAndLoad(page, maxTweets) {
  const seenUrls = new Set();
  let noNewContentRounds = 0;
  
  // Random scroll rounds between MIN and MAX
  const actualRounds = randomBetween(MIN_SCROLL_ROUNDS, MAX_SCROLL_ROUNDS);
  
  for (let round = 0; round < actualRounds; round++) {
    // Get current tweet count
    const articles = await page.$$(SELECTORS.tweetContainer[0]);
    const beforeCount = articles.length;
    
    // Collect URLs to track uniqueness
    for (const article of articles) {
      try {
        const link = await $(article, SELECTORS.tweetUrl);
        if (link) {
          const href = await link.getAttribute('href');
          if (href) seenUrls.add(href);
        }
      } catch (e) { /* ignore */ }
    }
    
    // Check if we have enough
    if (seenUrls.size >= maxTweets) {
      log('DEBUG', `Reached max tweets: ${seenUrls.size}`);
      break;
    }
    
    // Scroll down by random amount
    const scrollAmount = randomBetween(SCROLL_DISTANCE_MIN, SCROLL_DISTANCE_MAX);
    await page.evaluate((amount) => {
      window.scrollBy(0, amount);
    }, scrollAmount);
    
    // Polite wait between scrolls
    await sleep(randomBetween(SCROLL_WAIT_MIN, SCROLL_WAIT_MAX));
    
    // Optional small upward scroll (20% chance) - mimics re-reading
    if (Math.random() < SCROLL_BACK_CHANCE) {
      const scrollBackAmount = randomBetween(100, 200);
      await page.evaluate((amount) => {
        window.scrollBy(0, -amount);
      }, scrollBackAmount);
      await sleep(randomBetween(500, 1000));
    }
    
    // Optional reading pause (30% chance) - mimics stopping to read a tweet
    if (Math.random() < READ_PAUSE_CHANCE) {
      await sleep(randomBetween(READ_PAUSE_MIN, READ_PAUSE_MAX));
    }
    
    // Check for new content
    const afterArticles = await page.$$(SELECTORS.tweetContainer[0]);
    if (afterArticles.length <= beforeCount) {
      noNewContentRounds++;
      if (noNewContentRounds >= 2) {
        log('DEBUG', 'No new content after scrolling, stopping');
        break;
      }
    } else {
      noNewContentRounds = 0;
    }
  }
  
  return seenUrls.size;
}

/**
 * Scrape a single source with retry logic
 */
async function scrapeSourceWithRetry(page, source) {
  let lastError = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      log('INFO', `Retry ${attempt}/${MAX_RETRIES} for ${source.name}, waiting ${RETRY_BACKOFF_MS / 1000}s`);
      await sleep(RETRY_BACKOFF_MS);
    }
    
    const result = await scrapeSource(page, source, attempt);
    
    // Success or non-retryable error
    if (result.tweetCount > 0 || !result.retryable) {
      return result;
    }
    
    lastError = result.errors[result.errors.length - 1];
    log('WARN', `Attempt ${attempt + 1} failed for ${source.name}`, { error: lastError?.message });
  }
  
  // All retries exhausted
  log('ERROR', `All retries exhausted for ${source.name}`, { lastError: lastError?.message });
  return {
    group: source.group,
    name: source.name,
    query: source.query,
    searchUrl: source.searchUrl,
    scrapedAt: new Date().toISOString(),
    tweetCount: 0,
    tweets: [],
    errors: [{ type: 'MAX_RETRIES_EXHAUSTED', message: lastError?.message || 'Unknown error' }],
    retryable: false
  };
}

/**
 * Scrape a single source (query or KOL)
 */
async function scrapeSource(page, source, attempt = 0) {
  const result = {
    group: source.group,
    name: source.name,
    query: source.query,
    searchUrl: source.searchUrl,
    scrapedAt: new Date().toISOString(),
    tweetCount: 0,
    tweets: [],
    errors: [],
    retryable: false
  };

  const startTime = Date.now();
  log('INFO', `[START] Scraping: ${source.name}`, { group: source.group, attempt });

  try {
    // Navigate to search URL
    await page.goto(source.searchUrl, { 
      timeout: 30000,
      waitUntil: 'domcontentloaded'
    });
    
    // Polite wait for dynamic content
    await sleep(randomBetween(PAGE_LOAD_WAIT_MIN, PAGE_LOAD_WAIT_MAX));
    
    // Check page status
    const status = await checkPageStatus(page);
    if (!status.ok) {
      log('WARN', `Page status issue: ${status.reason}`, { name: source.name });
      result.errors.push({ type: status.reason, message: `Page check failed: ${status.reason}` });
      result.retryable = status.reason === 'RATE_LIMIT' || status.reason === 'ERROR_PAGE';
      return result;
    }
    
    // Scroll to load more tweets (limited depth)
    await scrollAndLoad(page, source.max || 30);
    
    // Extract tweets
    const articles = await page.$$(SELECTORS.tweetContainer[0]);
    log('DEBUG', `Found ${articles.length} articles`);
    
    const seenUrls = new Set();
    for (const article of articles) {
      try {
        const tweet = await extractTweet(article);
        
        // Skip if no URL or duplicate
        if (!tweet.url || seenUrls.has(tweet.url)) continue;
        seenUrls.add(tweet.url);
        
        // Skip if no text (likely not a real tweet)
        if (!tweet.text || tweet.text.length < 5) continue;
        
        result.tweets.push(tweet);
        
        if (result.tweets.length >= source.max) break;
      } catch (err) {
        log('WARN', 'Failed to extract tweet', { error: err.message });
        result.errors.push({ type: 'EXTRACT_FAILED', message: err.message });
      }
    }
    
    result.tweetCount = result.tweets.length;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log('INFO', `[SUCCESS] ${source.name}: ${result.tweetCount} tweets in ${duration}s`);
    
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    log('ERROR', `[FAILED] ${source.name} after ${duration}s`, { error: err.message });
    result.errors.push({ type: 'SCRAPE_FAILED', message: err.message });
    result.retryable = true;
  }

  return result;
}

/**
 * Build source list from queries and influencers config
 * Supports random sampling to reduce load
 */
function buildSourceList() {
  const allSources = [];
  
  // Load queries
  const queries = JSON.parse(readFileSync(QUERIES_FILE, 'utf-8'));
  
  // Pain queries
  for (const q of queries.pain || []) {
    allSources.push({
      group: 'pain',
      name: q.name,
      query: q.query,
      searchUrl: buildSearchUrl(q.query),
      max: q.max || 30
    });
  }
  
  // Reach queries
  for (const q of queries.reach || []) {
    allSources.push({
      group: 'reach',
      name: q.name,
      query: q.query,
      searchUrl: buildSearchUrl(q.query),
      max: q.max || 30
    });
  }
  
  // Sentiment queries (Filo舆情)
  for (const q of queries.sentiment || []) {
    const lookbackDays = Number.isNaN(SENTIMENT_LOOKBACK_DAYS) ? 7 : SENTIMENT_LOOKBACK_DAYS;
    const sinceDays = Math.max(0, lookbackDays - 1);
    const sinceDate = lookbackDays > 1 ? getDateDaysAgo(sinceDays) : null;
    const sentimentQuery = sinceDate ? `${q.query} since:${sinceDate}` : q.query;
    allSources.push({
      group: 'sentiment',
      name: q.name,
      query: sentimentQuery,
      searchUrl: buildSearchUrl(sentimentQuery),
      max: q.max || 30
    });
  }
  
  // Insight queries (用户洞察)
  for (const q of queries.insight || []) {
    allSources.push({
      group: 'insight',
      name: q.name,
      query: q.query,
      searchUrl: buildSearchUrl(q.query),
      max: q.max || 30
    });
  }
  
  // KOL queries - with topic filter and denyTerms
  if (existsSync(INFLUENCERS_FILE)) {
    const influencers = JSON.parse(readFileSync(INFLUENCERS_FILE, 'utf-8'));
    const topicQuery = influencers.allowedQuery || influencers.query || '';
    const denyTerms = influencers.denyTerms || '';
    
    for (const handle of influencers.handles || []) {
      const kolQuery = `from:${handle} ${topicQuery} ${denyTerms} -filter:retweets`.trim();
      allSources.push({
        group: 'kol',
        name: `kol-${handle}`,
        query: kolQuery,
        searchUrl: buildSearchUrl(kolQuery),
        max: 15
      });
    }
    
    log('INFO', `KOL queries configured`, { 
      handles: influencers.handles?.length,
      hasDenyTerms: !!denyTerms
    });
  }

  // Optional group filter
  if (ONLY_GROUPS_SET.size > 0) {
    const before = allSources.length;
    const filtered = allSources.filter(s => ONLY_GROUPS_SET.has(s.group));
    log('INFO', `Group filter applied: ${ONLY_GROUPS.join(',')}`, { before, after: filtered.length });
    allSources.length = 0;
    allSources.push(...filtered);
  }
  
  // Apply sampling strategy
  if (SAMPLING_MODE === 'all' || allSources.length <= MAX_SOURCES_PER_RUN) {
    log('INFO', `Using all ${allSources.length} sources`);
    return allSources;
  }
  
  // Random sampling: ensure balanced selection from each group
  const painSources = allSources.filter(s => s.group === 'pain');
  const reachSources = allSources.filter(s => s.group === 'reach');
  const kolSources = allSources.filter(s => s.group === 'kol');
  const sentimentSources = allSources.filter(s => s.group === 'sentiment');
  const insightSources = allSources.filter(s => s.group === 'insight');
  
  // Always include ALL sentiment and insight sources (they're usually few and important)
  const alwaysInclude = [...sentimentSources, ...insightSources];
  const remainingSlots = Math.max(0, MAX_SOURCES_PER_RUN - alwaysInclude.length);
  
  // Allocate remaining slots: ~60% pain, ~25% reach, ~15% kol (pain-first strategy)
  let painCount = Math.max(2, Math.floor(remainingSlots * 0.6));
  let reachCount = Math.max(1, Math.floor(remainingSlots * 0.25));
  let kolCount = Math.max(0, remainingSlots - painCount - reachCount);
  
  // Backfill if a group has fewer sources
  const painAvailable = Math.min(painCount, painSources.length);
  const reachAvailable = Math.min(reachCount, reachSources.length);
  const kolAvailable = Math.min(kolCount, kolSources.length);
  
  let remaining = remainingSlots - painAvailable - reachAvailable - kolAvailable;
  
  // Distribute remaining slots
  const selectedSources = [
    ...alwaysInclude,
    ...shuffle(painSources).slice(0, painAvailable),
    ...shuffle(reachSources).slice(0, reachAvailable),
    ...shuffle(kolSources).slice(0, kolAvailable)
  ];
  
  // Backfill from groups that have more sources (pain priority)
  if (remaining > 0 && painSources.length > painAvailable) {
    const extra = shuffle(painSources).slice(painAvailable, painAvailable + remaining);
    selectedSources.push(...extra);
    remaining -= extra.length;
  }
  if (remaining > 0 && reachSources.length > reachAvailable) {
    const extra = shuffle(reachSources).slice(reachAvailable, reachAvailable + remaining);
    selectedSources.push(...extra);
    remaining -= extra.length;
  }
  
  // Shuffle final selection to randomize order
  const finalSources = shuffle(selectedSources);
  
  log('INFO', `Random sampling: selected ${finalSources.length} of ${allSources.length} sources`, {
    pain: finalSources.filter(s => s.group === 'pain').length,
    reach: finalSources.filter(s => s.group === 'reach').length,
    kol: finalSources.filter(s => s.group === 'kol').length,
    sentiment: finalSources.filter(s => s.group === 'sentiment').length,
    insight: finalSources.filter(s => s.group === 'insight').length
  });
  
  return finalSources;
}

async function main() {
  const runStartTime = Date.now();
  const runTimeLimitMs = RUN_TIME_LIMIT_MIN * 60 * 1000;
  
  log('INFO', '=== X Radar Scraper Starting ===');
  log('INFO', `Config: MAX_SOURCES=${MAX_SOURCES_PER_RUN}, SAMPLING_MODE=${SAMPLING_MODE}, TIME_LIMIT=${RUN_TIME_LIMIT_MIN}min`);
  log('INFO', `Sentiment lookback days: ${SENTIMENT_LOOKBACK_DAYS}, ONLY_GROUPS=${ONLY_GROUPS.join(',') || 'none'}`);
  
  // Clean old output directories (keep last 7 days)
  log('INFO', 'Checking for old data to clean up...');
  cleanOldOutputDirs(7);
  
  const runDate = getTodayDate();
  const runAt = new Date().toISOString();
  const outputFile = getOutputPath('raw.json', runDate);
  
  log('INFO', `Output directory: ${getOutputDir(runDate)}`);
  
  // Build source list
  const sources = buildSourceList();
  log('INFO', `Total sources to scrape: ${sources.length}`);
  
  if (sources.length === 0) {
    log('WARN', 'No sources to scrape');
    const emptyOutput = {
      runDate,
      runAt,
      stats: { totalSources: 0, totalTweets: 0, byGroup: {} },
      sources: [],
      errors: []
    };
    writeFileSync(outputFile, JSON.stringify(emptyOutput, null, 2));
    appendToArchive(emptyOutput);
    copyToLatest(getOutputDir(runDate));
    logOutputPaths(runDate);
    return;
  }
  
  // Launch browser (simple config, no anti-detection)
  const headless = process.env.PLAYWRIGHT_HEADLESS === 'true';
  log('INFO', `Launching browser (headless: ${headless})`);
  
  const browser = await chromium.launch({
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  // Create context (simple config)
  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  
  if (existsSync(AUTH_STATE_FILE)) {
    log('INFO', 'Loading auth state from file');
    contextOptions.storageState = AUTH_STATE_FILE;
  } else {
    log('WARN', 'No auth state found, scraping may be limited');
  }
  
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  
  // Verify authentication before starting
  const authStatus = await verifyAuth(page);
  saveAuthStatus(authStatus);
  
  if (!authStatus.valid) {
    log('ERROR', 'Authentication failed, aborting scrape');
    await browser.close();
    
    // Exit with error code to trigger notification in workflow
    process.exit(2); // Exit code 2 = auth failed
  }
  
  // Scrape all sources with graceful failure handling
  const results = [];
  const globalErrors = [];
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < sources.length; i++) {
    // Runtime guard: check if time limit exceeded
    const elapsedMs = Date.now() - runStartTime;
    const elapsedMin = (elapsedMs / 60000).toFixed(1);
    if (elapsedMs >= runTimeLimitMs) {
      log('WARN', `Runtime limit reached (${elapsedMin}min >= ${RUN_TIME_LIMIT_MIN}min), stopping scrape`, {
        completedSources: i,
        totalSources: sources.length
      });
      break;
    }
    
    const source = sources[i];
    log('INFO', `--- Source ${i + 1}/${sources.length}: ${source.name} (${elapsedMin}min elapsed) ---`);
    
    try {
      const result = await scrapeSourceWithRetry(page, source);
      results.push(result);
      
      if (result.tweetCount > 0) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Polite wait between sources (except for last one)
      if (i < sources.length - 1) {
        const waitTime = randomBetween(BETWEEN_QUERIES_WAIT_MIN, BETWEEN_QUERIES_WAIT_MAX);
        log('DEBUG', `Waiting ${(waitTime / 1000).toFixed(0)}s before next source`);
        await sleep(waitTime);
      }
    } catch (err) {
      log('ERROR', `Unexpected error for ${source.name}`, { error: err.message });
      globalErrors.push({ 
        source: source.name, 
        error: err.message, 
        timestamp: new Date().toISOString() 
      });
      failCount++;
      
      // Still add a failed result to track it
      results.push({
        group: source.group,
        name: source.name,
        query: source.query,
        searchUrl: source.searchUrl,
        scrapedAt: new Date().toISOString(),
        tweetCount: 0,
        tweets: [],
        errors: [{ type: 'UNEXPECTED_ERROR', message: err.message }]
      });
    }
  }
  
  // Close browser
  await browser.close();
  
  // Calculate stats
  const stats = {
    totalSources: results.length,
    successfulSources: successCount,
    failedSources: failCount,
    totalTweets: results.reduce((sum, r) => sum + r.tweetCount, 0),
    byGroup: {
      pain: results.filter(r => r.group === 'pain').reduce((sum, r) => sum + r.tweetCount, 0),
      reach: results.filter(r => r.group === 'reach').reduce((sum, r) => sum + r.tweetCount, 0),
      kol: results.filter(r => r.group === 'kol').reduce((sum, r) => sum + r.tweetCount, 0),
      sentiment: results.filter(r => r.group === 'sentiment').reduce((sum, r) => sum + r.tweetCount, 0),
      insight: results.filter(r => r.group === 'insight').reduce((sum, r) => sum + r.tweetCount, 0)
    }
  };
  
  // Write output (always, even if some sources failed)
  const output = {
    runDate,
    runAt,
    stats,
    sources: results,
    errors: globalErrors
  };
  
  writeFileSync(outputFile, JSON.stringify(output, null, 2));
  log('INFO', `Output written to ${outputFile}`);
  
  // Archive to permanent storage (JSONL)
  appendToArchive(output);
  
  // Copy to latest directory
  copyToLatest(getOutputDir(runDate));
  log('INFO', 'Copied to out/latest/');
  
  // Print clear path summary
  logOutputPaths(runDate);
  
  const totalElapsedMin = ((Date.now() - runStartTime) / 60000).toFixed(1);
  log('INFO', '=== Scrape Complete ===', { ...stats, runtimeMinutes: totalElapsedMin });
}

main().catch(err => {
  log('ERROR', 'Scraper crashed', { error: err.message });
  process.exit(1);
});
