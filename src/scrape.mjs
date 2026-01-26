import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { log, parseEngagement, buildSearchUrl, ensureAbsoluteUrl, randomBetween, sleep, cleanText, shuffle } from './utils.mjs';
import 'dotenv/config';

const AUTH_STATE_FILE = 'auth/state.json';
const OUTPUT_FILE = 'out/raw.json';
const QUERIES_FILE = 'queries.json';
const INFLUENCERS_FILE = 'influencers.json';

// ============ Browser Fingerprint Configuration ============

// Pool of realistic User-Agent strings (Chrome on Mac/Windows)
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
];

// Viewport size ranges for random selection
const VIEWPORT_WIDTHS = [1280, 1366, 1440, 1536, 1600, 1920];
const VIEWPORT_HEIGHTS = [720, 768, 800, 864, 900, 1080];

// Timezone and locale options
const TIMEZONES = ['America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Europe/London'];
const LOCALES = ['en-US', 'en-GB'];

/**
 * Get random browser fingerprint configuration
 */
function getRandomFingerprint() {
  return {
    userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
    viewport: {
      width: VIEWPORT_WIDTHS[Math.floor(Math.random() * VIEWPORT_WIDTHS.length)],
      height: VIEWPORT_HEIGHTS[Math.floor(Math.random() * VIEWPORT_HEIGHTS.length)]
    },
    locale: LOCALES[Math.floor(Math.random() * LOCALES.length)],
    timezoneId: TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)]
  };
}

// Selectors with fallbacks
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

// ============ Human Behavior Simulation ============

/**
 * Simulate human-like mouse movement
 */
async function humanMouseMove(page) {
  try {
    const x = randomBetween(100, 900);
    const y = randomBetween(100, 600);
    // Move mouse with random steps to simulate natural movement
    await page.mouse.move(x, y, { steps: randomBetween(5, 15) });
  } catch (e) {
    // Ignore mouse move errors
  }
}

/**
 * Randomly pause to simulate reading behavior (30% chance)
 */
async function maybeReadingPause(page) {
  if (Math.random() < 0.3) {
    await humanMouseMove(page);
    await sleep(randomBetween(3000, 8000));
  }
}

/**
 * Random micro-interaction (hover, small movement)
 */
async function microInteraction(page) {
  if (Math.random() < 0.4) {
    await humanMouseMove(page);
    await sleep(randomBetween(200, 600));
  }
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
 * Check if page requires login
 */
async function checkLoginRequired(page) {
  try {
    const loginBtn = await $(page, SELECTORS.loginButton);
    if (loginBtn) return true;
    
    const url = page.url();
    if (url.includes('/login') || url.includes('/i/flow/login')) return true;
    
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Scroll page and wait for content to load
 * Randomized behavior to avoid bot detection
 */
async function scrollAndLoad(page, maxTweets, maxRounds = 7) {
  const seenUrls = new Set();
  let noNewContentRounds = 0;
  
  // Randomize actual number of scroll rounds (3-6)
  const actualRounds = randomBetween(3, Math.min(6, maxRounds));
  
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
    
    // Random mouse movement before scrolling
    await microInteraction(page);
    
    // Scroll down by random amount (not always to bottom)
    const scrollAmount = randomBetween(600, 1200);
    await page.evaluate((amount) => {
      window.scrollBy(0, amount);
    }, scrollAmount);
    
    // Random delay between scrolls
    await sleep(randomBetween(3000, 7000));
    
    // Occasional mouse movement after scrolling
    await microInteraction(page);
    
    // Occasionally scroll up a bit (simulate human looking back, 20% chance)
    if (Math.random() < 0.2) {
      await sleep(randomBetween(500, 1500));
      const scrollBackAmount = randomBetween(150, 300);
      await page.evaluate((amount) => {
        window.scrollBy(0, -amount);
      }, scrollBackAmount);
      await sleep(randomBetween(1000, 2000));
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
 * Scrape a single source (query or KOL)
 */
async function scrapeSource(page, source) {
  const result = {
    group: source.group,
    name: source.name,
    query: source.query,
    searchUrl: source.searchUrl,
    scrapedAt: new Date().toISOString(),
    tweetCount: 0,
    tweets: [],
    errors: []
  };

  try {
    log('INFO', `Scraping: ${source.name}`, { group: source.group });
    
    // Navigate to search URL
    await page.goto(source.searchUrl, { 
      timeout: 30000,
      waitUntil: 'domcontentloaded'
    });
    
    // Wait a bit for dynamic content
    await sleep(randomBetween(4000, 8000));
    
    // Simulate human behavior after page load
    await humanMouseMove(page);
    await maybeReadingPause(page);
    
    // Check for login requirement
    if (await checkLoginRequired(page)) {
      log('WARN', 'Login required, skipping source', { name: source.name });
      result.errors.push({ type: 'LOGIN_REQUIRED', message: 'Login wall detected' });
      return result;
    }
    
    // Check for rate limit
    const content = await page.content();
    if (content.includes('Rate limit') || content.includes('Too many requests')) {
      log('WARN', 'Rate limit detected, waiting 60s', { name: source.name });
      await sleep(60000);
      await page.reload();
    }
    
    // Scroll to load more tweets
    await scrollAndLoad(page, source.max || 50);
    
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
    log('INFO', `Scraped ${result.tweetCount} tweets from ${source.name}`);
    
  } catch (err) {
    log('ERROR', 'Source scrape failed', { name: source.name, error: err.message });
    result.errors.push({ type: 'SCRAPE_FAILED', message: err.message });
  }

  return result;
}

// Configuration for random sampling
const MAX_SOURCES_PER_RUN = parseInt(process.env.MAX_SOURCES || '8', 10);
const SAMPLING_MODE = process.env.SAMPLING_MODE || 'random'; // 'random' or 'all'

/**
 * Build source list from queries and influencers config
 * Supports random sampling to reduce detection risk
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
      max: q.max || 50
    });
  }
  
  // Reach queries
  for (const q of queries.reach || []) {
    allSources.push({
      group: 'reach',
      name: q.name,
      query: q.query,
      searchUrl: buildSearchUrl(q.query),
      max: q.max || 50
    });
  }
  
  // KOL queries
  if (existsSync(INFLUENCERS_FILE)) {
    const influencers = JSON.parse(readFileSync(INFLUENCERS_FILE, 'utf-8'));
    for (const handle of influencers.handles || []) {
      const kolQuery = `from:${handle} ${influencers.query} -filter:retweets`;
      allSources.push({
        group: 'kol',
        name: `kol-${handle}`,
        query: kolQuery,
        searchUrl: buildSearchUrl(kolQuery),
        max: 20 // Limit per KOL
      });
    }
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
  
  // Allocate: ~30% pain, ~40% reach, ~30% kol
  const painCount = Math.max(2, Math.floor(MAX_SOURCES_PER_RUN * 0.3));
  const reachCount = Math.max(2, Math.floor(MAX_SOURCES_PER_RUN * 0.4));
  const kolCount = MAX_SOURCES_PER_RUN - painCount - reachCount;
  
  const selectedSources = [
    ...shuffle(painSources).slice(0, painCount),
    ...shuffle(reachSources).slice(0, reachCount),
    ...shuffle(kolSources).slice(0, kolCount)
  ];
  
  // Shuffle final selection to randomize order
  const finalSources = shuffle(selectedSources);
  
  log('INFO', `Random sampling: selected ${finalSources.length} of ${allSources.length} sources`, {
    pain: finalSources.filter(s => s.group === 'pain').length,
    reach: finalSources.filter(s => s.group === 'reach').length,
    kol: finalSources.filter(s => s.group === 'kol').length
  });
  
  return finalSources;
}

async function main() {
  log('INFO', 'Starting X Radar scraper');
  const runAt = new Date().toISOString();
  
  // Build source list
  const sources = buildSourceList();
  log('INFO', `Total sources to scrape: ${sources.length}`);
  
  // Launch browser
  const headless = process.env.PLAYWRIGHT_HEADLESS === 'true';
  log('INFO', `Launching browser (headless: ${headless})`);
  
  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled', // Hide automation flag
      '--disable-infobars',
      '--window-size=1920,1080'
    ]
  });
  
  // Get random browser fingerprint
  const fingerprint = getRandomFingerprint();
  log('INFO', 'Using random fingerprint', { 
    viewport: `${fingerprint.viewport.width}x${fingerprint.viewport.height}`,
    locale: fingerprint.locale,
    timezone: fingerprint.timezoneId
  });
  
  // Create context with auth state and random fingerprint
  const contextOptions = {
    viewport: fingerprint.viewport,
    userAgent: fingerprint.userAgent,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezoneId,
    // Add permissions that real browsers have
    permissions: ['geolocation'],
    // Disable some automation indicators
    bypassCSP: false,
    javaScriptEnabled: true
  };
  
  if (existsSync(AUTH_STATE_FILE)) {
    log('INFO', 'Loading auth state from file');
    contextOptions.storageState = AUTH_STATE_FILE;
  } else {
    log('WARN', 'No auth state found, scraping may be limited');
  }
  
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  
  // Inject anti-detection scripts
  await page.addInitScript(() => {
    // Hide webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
      configurable: true
    });
    
    // Add chrome object (present in real Chrome)
    if (!window.chrome) {
      window.chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
    }
    
    // Override plugins to look like real browser
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
        { name: 'Native Client', filename: 'internal-nacl-plugin' }
      ]
    });
    
    // Override languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });
    
    // Prevent detection via permissions API
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });
  
  // Scrape all sources
  const results = [];
  const errors = [];
  
  for (const source of sources) {
    try {
      const result = await scrapeSource(page, source);
      results.push(result);
      
      // Add delay between sources (longer to avoid detection)
      await sleep(randomBetween(15000, 30000));
    } catch (err) {
      log('ERROR', 'Failed to scrape source', { name: source.name, error: err.message });
      errors.push({ source: source.name, error: err.message, timestamp: new Date().toISOString() });
    }
  }
  
  // Close browser
  await browser.close();
  
  // Calculate stats
  const stats = {
    totalSources: results.length,
    totalTweets: results.reduce((sum, r) => sum + r.tweetCount, 0),
    byGroup: {
      pain: results.filter(r => r.group === 'pain').reduce((sum, r) => sum + r.tweetCount, 0),
      reach: results.filter(r => r.group === 'reach').reduce((sum, r) => sum + r.tweetCount, 0),
      kol: results.filter(r => r.group === 'kol').reduce((sum, r) => sum + r.tweetCount, 0)
    }
  };
  
  // Write output
  const output = {
    runAt,
    stats,
    sources: results,
    errors
  };
  
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  log('INFO', 'Scrape complete', stats);
  log('INFO', `Output written to ${OUTPUT_FILE}`);
}

main().catch(err => {
  log('ERROR', 'Scraper crashed', { error: err.message });
  process.exit(1);
});
