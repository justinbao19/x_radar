import { chromium } from 'playwright';
import { createInterface } from 'readline';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { log } from './utils.mjs';

const AUTH_DIR = 'auth';
const STATE_FILE = `${AUTH_DIR}/state.json`;

// Use a persistent user data directory to avoid Google blocking
const USER_DATA_DIR = join(homedir(), '.x-radar-browser');

async function main() {
  log('INFO', 'Starting login helper');
  
  // Ensure auth directory exists
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }
  
  // Use persistent context to avoid Google detection
  log('INFO', `Using persistent browser profile at: ${USER_DATA_DIR}`);
  
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: null,
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled'
    ],
    ignoreDefaultArgs: ['--enable-automation']
  });
  
  // Get the first page or create new one
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  
  log('INFO', 'Navigating to X login page...');
  await page.goto('https://x.com/login');
  
  console.log('\n' + '='.repeat(60));
  console.log('请在浏览器中完成登录（可以用 Google 或直接用 X 账号）');
  console.log('Please login in the browser (Google or X account)');
  console.log('='.repeat(60));
  console.log('\n💡 提示：如果 Google 登录失败，请直接用 X 用户名+密码登录');
  console.log('💡 Tip: If Google fails, use X username + password instead');
  console.log('\n登录完成后，按 Enter 键保存登录状态...');
  console.log('After logging in, press Enter to save the auth state...\n');
  
  // Wait for user to press Enter
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise(resolve => {
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
  
  // Save storage state
  log('INFO', 'Saving auth state...');
  await context.storageState({ path: STATE_FILE });
  
  log('INFO', `Auth state saved to ${STATE_FILE}`);
  console.log('\n✅ 登录状态已保存！');
  console.log('✅ Auth state saved successfully!');
  console.log(`\n要生成 GitHub Secret，运行:`);
  console.log(`base64 -i ${STATE_FILE} | tr -d '\\n'`);
  
  await context.close();
}

main().catch(err => {
  log('ERROR', 'Login failed', { error: err.message });
  process.exit(1);
});
