import { franc } from 'franc';
import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

// ============ Output Directory Utilities ============

const OUT_DIR = 'out';
const LATEST_DIR = join(OUT_DIR, 'latest');

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get output directory for a specific date
 * @param {string} date - Date string in YYYY-MM-DD format (defaults to today)
 * @returns {string} - Directory path like 'out/2026-01-26'
 */
export function getOutputDir(date = null) {
  const dateStr = date || getTodayDate();
  return join(OUT_DIR, dateStr);
}

/**
 * Get the run date from raw.json or use current date
 * This ensures all pipeline steps use the same date directory
 * @returns {string} - Date string in YYYY-MM-DD format
 */
export function getRunDate() {
  // Try to read from latest raw.json to get consistent date across pipeline
  const latestRaw = join(LATEST_DIR, 'raw.json');
  if (existsSync(latestRaw)) {
    try {
      const data = JSON.parse(readFileSync(latestRaw, 'utf-8'));
      if (data.runDate) {
        return data.runDate;
      }
      // Fallback: extract date from runAt timestamp
      if (data.runAt) {
        return data.runAt.split('T')[0];
      }
    } catch (e) {
      // Ignore and use today
    }
  }
  return getTodayDate();
}

/**
 * Ensure output directories exist (date dir + latest dir)
 * @param {string} date - Date string in YYYY-MM-DD format (defaults to today)
 * @returns {string} - The date directory path
 */
export function ensureOutputDirs(date = null) {
  const dateStr = date || getTodayDate();
  const dateDir = getOutputDir(dateStr);
  
  // Create date directory
  if (!existsSync(dateDir)) {
    mkdirSync(dateDir, { recursive: true });
  }
  
  // Create latest directory
  if (!existsSync(LATEST_DIR)) {
    mkdirSync(LATEST_DIR, { recursive: true });
  }
  
  return dateDir;
}

/**
 * Copy all files from source directory to latest directory
 * @param {string} sourceDir - Source directory path
 */
export function copyToLatest(sourceDir) {
  if (!existsSync(sourceDir)) {
    return;
  }
  
  // Ensure latest directory exists
  if (!existsSync(LATEST_DIR)) {
    mkdirSync(LATEST_DIR, { recursive: true });
  }
  
  // Copy all files
  const files = readdirSync(sourceDir);
  for (const file of files) {
    const srcPath = join(sourceDir, file);
    const destPath = join(LATEST_DIR, file);
    try {
      copyFileSync(srcPath, destPath);
    } catch (e) {
      // Ignore copy errors
    }
  }
}

/**
 * Get input file path (checks date dir first, then latest)
 * @param {string} filename - File name like 'raw.json'
 * @param {string} date - Optional date string
 * @returns {string} - Full file path
 */
export function getInputPath(filename, date = null) {
  // If date specified, use that directory
  if (date) {
    return join(getOutputDir(date), filename);
  }
  
  // Try to find in latest first
  const latestPath = join(LATEST_DIR, filename);
  if (existsSync(latestPath)) {
    return latestPath;
  }
  
  // Fallback to today's directory
  return join(getOutputDir(), filename);
}

/**
 * Get output file path for current run
 * @param {string} filename - File name like 'raw.json'
 * @param {string} date - Optional date string (defaults to today)
 * @returns {string} - Full file path
 */
export function getOutputPath(filename, date = null) {
  const dateDir = ensureOutputDirs(date);
  return join(dateDir, filename);
}

// ============ Logging ============

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

export function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const prefix = { INFO: 'ℹ️', WARN: '⚠️', ERROR: '❌', DEBUG: '🔍' }[level] || '•';
  const dataStr = Object.keys(data).length ? ' ' + JSON.stringify(data) : '';
  console.log(`${timestamp} ${prefix} [${level}] ${message}${dataStr}`);
}

// ============ Engagement Parsing ============

/**
 * Parse engagement count from aria-label like "45 Likes", "1,234 replies", "1.2K Retweets", "3.5M"
 */
export function parseEngagement(ariaLabel) {
  if (!ariaLabel) return 0;
  
  // Extract the numeric part with optional K/M/B suffix
  const match = ariaLabel.match(/([\d,.]+)\s*([KMB])?/i);
  if (!match) return 0;
  
  let num = parseFloat(match[1].replace(/,/g, ''));
  const suffix = (match[2] || '').toUpperCase();
  
  if (suffix === 'K') num *= 1000;
  else if (suffix === 'M') num *= 1000000;
  else if (suffix === 'B') num *= 1000000000;
  
  return Math.round(num);
}

// ============ Language Detection ============

const LANG_MAP = {
  eng: 'en',
  jpn: 'ja',
  cmn: 'zh',
  zho: 'zh',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  kor: 'ko',
  por: 'pt',
  rus: 'ru',
  ara: 'ar',
  hin: 'hi',
  und: 'other'
};

/**
 * Detect language of text using franc
 * Returns: 'en', 'ja', 'zh', or 'other'
 */
export function detectLanguage(text) {
  if (!text || text.length < 10) return 'other';
  
  try {
    const langCode = franc(text);
    return LANG_MAP[langCode] || 'other';
  } catch (e) {
    return 'other';
  }
}

// ============ JSON Extraction ============

/**
 * Extract JSON object from a string that may contain extra text
 */
export function extractJSON(text) {
  if (!text) return null;
  
  // Try to find JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    // Try to fix common issues
    let fixed = jsonMatch[0]
      .replace(/,\s*}/g, '}')  // Remove trailing commas
      .replace(/,\s*]/g, ']')
      .replace(/'/g, '"');     // Replace single quotes
    
    try {
      return JSON.parse(fixed);
    } catch (e2) {
      return null;
    }
  }
}

// ============ Random Utilities ============

/**
 * Random integer between min and max (inclusive)
 */
export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for ms milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fisher-Yates shuffle algorithm
 * Returns a new shuffled array (does not mutate original)
 */
export function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ============ URL Utilities ============

/**
 * Build X search URL
 */
export function buildSearchUrl(query) {
  return `https://x.com/search?q=${encodeURIComponent(query)}&f=live`;
}

/**
 * Ensure URL is absolute
 */
export function ensureAbsoluteUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return 'https://x.com' + url;
}

// ============ Text Utilities ============

/**
 * Truncate text to maxLength with ellipsis
 */
export function truncate(text, maxLength = 100) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Clean tweet text (remove extra whitespace)
 */
export function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}
