import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { log } from './utils.mjs';

const AUTH_DIR = 'auth';
const STATE_FILE = `${AUTH_DIR}/state.json`;
const USER_DATA_DIR = join(homedir(), '.x-radar-browser');

async function main() {
  log('INFO', 'Saving auth state from persistent browser profile');
  
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }
  
  if (!existsSync(USER_DATA_DIR)) {
    log('ERROR', 'Browser profile not found. Run npm run login first.');
    process.exit(1);
  }
  
  // Launch with existing profile in headless mode
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true
  });
  
  // Navigate to X to verify login and get cookies
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Wait a moment for cookies to settle
  await page.waitForTimeout(2000);
  
  // Save state
  await context.storageState({ path: STATE_FILE });
  
  log('INFO', `Auth state saved to ${STATE_FILE}`);
  console.log('\n✅ 登录状态已保存！');
  
  await context.close();
}

main().catch(err => {
  log('ERROR', 'Failed to save state', { error: err.message });
  process.exit(1);
});
