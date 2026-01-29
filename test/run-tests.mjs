#!/usr/bin/env node
/**
 * X-Radar Test Runner
 * Runs all tests with proper environment setup
 */

import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

// Load test environment
const envTestPath = join(ROOT_DIR, '.env.test');
if (existsSync(envTestPath)) {
  const envContent = readFileSync(envTestPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        process.env[key.trim()] = value;
      }
    }
  }
}

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Test suites to run
const testSuites = [
  { name: 'Safety Module', file: 'test/safety.test.mjs' },
  { name: 'Select Module', file: 'test/select.test.mjs' },
  { name: 'Commenter Module', file: 'test/commenter.test.mjs' },
  { name: 'Sync Data', file: 'test/sync-data.test.mjs' },
  { name: 'Data Loader', file: 'test/data-loader.test.mjs' },
  { name: 'Feedback Learning', file: 'test/feedback.test.mjs' },
  { name: 'Scrape Module', file: 'test/scrape.test.mjs' },
  { name: 'Performance', file: 'test/performance.test.mjs' }
];

async function runTest(testFile) {
  return new Promise((resolve) => {
    const testPath = join(ROOT_DIR, testFile);
    
    if (!existsSync(testPath)) {
      resolve({ passed: false, skipped: true, error: 'File not found' });
      return;
    }
    
    const proc = spawn('node', ['--test', testPath], {
      cwd: ROOT_DIR,
      env: { ...process.env, FORCE_COLOR: '1' },
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });
    
    proc.on('close', (code) => {
      resolve({
        passed: code === 0,
        stdout,
        stderr,
        exitCode: code
      });
    });
    
    // Timeout after 60 seconds
    setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ passed: false, error: 'Timeout', exitCode: -1 });
    }, 60000);
  });
}

async function main() {
  log('cyan', '\n========================================');
  log('cyan', '  X-Radar Test Suite');
  log('cyan', '========================================\n');
  
  const results = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const suite of testSuites) {
    log('blue', `\n▶ Running: ${suite.name}`);
    log('blue', `  File: ${suite.file}`);
    console.log('');
    
    const result = await runTest(suite.file);
    
    if (result.skipped) {
      log('yellow', `  ⏭  SKIPPED: ${result.error}`);
      skipped++;
    } else if (result.passed) {
      log('green', `  ✓  PASSED`);
      passed++;
    } else {
      log('red', `  ✗  FAILED (exit code: ${result.exitCode})`);
      failed++;
    }
    
    results.push({ ...suite, ...result });
  }
  
  // Summary
  log('cyan', '\n========================================');
  log('cyan', '  Test Summary');
  log('cyan', '========================================');
  console.log('');
  log('green', `  Passed:  ${passed}`);
  log('red', `  Failed:  ${failed}`);
  log('yellow', `  Skipped: ${skipped}`);
  console.log('');
  
  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  log('red', `\nTest runner error: ${err.message}`);
  process.exit(1);
});
