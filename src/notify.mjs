#!/usr/bin/env node
/**
 * X Radar Notification Module
 * Sends notifications for auth failures and successful runs
 * Supports: GitHub Issue, Email (via Resend), Webhook (Slack/Discord/Feishu)
 * 
 * Usage:
 *   node src/notify.mjs                 # Auth failure notification
 *   node src/notify.mjs --success       # Success notification with stats
 */

import { readFileSync, existsSync } from 'fs';
import 'dotenv/config';

const AUTH_STATUS_FILE = 'out/auth-status.json';
const COMMENTS_FILE = 'out/latest/top10_with_comments.json';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://x-radar.vercel.app';

// ============ Logging ============

function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({ timestamp, level, message, ...data }));
}

// ============ GitHub Issue ============

async function createGitHubIssue(authStatus) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    log('WARN', 'GITHUB_TOKEN not set, skipping GitHub Issue');
    return false;
  }

  // Get repo info from env or git remote
  const repo = process.env.GITHUB_REPOSITORY || 'justinbao19/X-radar';
  const [owner, repoName] = repo.split('/');

  const issueTitle = '⚠️ X Radar: 登录状态已失效';
  const issueBody = `## 问题描述

X 登录状态已过期或失效，无法继续抓取推文。

**失败原因:** ${authStatus.reason || 'Unknown'}
**检查时间:** ${authStatus.checkedAt || new Date().toISOString()}

## 解决步骤

1. **本地重新登录**
   \`\`\`bash
   cd /path/to/X-radar
   npm run login
   \`\`\`
   在打开的浏览器中登录你的 X 账号，然后按 Enter 保存。

2. **更新 GitHub Secret**
   \`\`\`bash
   # macOS:
   base64 -i auth/state.json | tr -d '\\n' | gh secret set X_STORAGE_STATE_B64
   
   # Linux:
   base64 -w 0 auth/state.json | gh secret set X_STORAGE_STATE_B64
   \`\`\`

3. **手动触发 Pipeline**
   \`\`\`bash
   gh workflow run "X Radar Pipeline"
   \`\`\`

## 注意事项

- X 登录状态通常有效期为 30-90 天
- 如果频繁失效，请检查账号是否有异常活动
- 建议在失效前主动更新登录状态

---
*此 Issue 由 X Radar 自动创建*
`;

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ['auth-expired', 'automated']
      })
    });

    if (!response.ok) {
      const error = await response.text();
      log('ERROR', 'Failed to create GitHub Issue', { status: response.status, error });
      return false;
    }

    const issue = await response.json();
    log('INFO', 'GitHub Issue created', { url: issue.html_url, number: issue.number });
    return true;
  } catch (e) {
    log('ERROR', 'GitHub Issue creation failed', { error: e.message });
    return false;
  }
}

// ============ Email (via Resend) ============

async function sendEmail(authStatus) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.NOTIFY_EMAIL;
  
  if (!apiKey) {
    log('WARN', 'RESEND_API_KEY not set, skipping email');
    return false;
  }
  
  if (!toEmail) {
    log('WARN', 'NOTIFY_EMAIL not set, skipping email');
    return false;
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ef4444; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
    .code { background: #1f2937; color: #10b981; padding: 12px 16px; border-radius: 6px; font-family: monospace; font-size: 14px; overflow-x: auto; }
    .step { margin: 16px 0; padding: 12px; background: white; border-radius: 6px; border-left: 4px solid #3b82f6; }
    .footer { margin-top: 20px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">⚠️ X Radar 登录失效</h1>
    </div>
    <div class="content">
      <p><strong>失败原因:</strong> ${authStatus.reason || 'Unknown'}</p>
      <p><strong>检查时间:</strong> ${authStatus.checkedAt || new Date().toISOString()}</p>
      
      <h3>解决步骤</h3>
      
      <div class="step">
        <strong>1. 本地重新登录</strong>
        <div class="code">npm run login</div>
      </div>
      
      <div class="step">
        <strong>2. 更新 GitHub Secret</strong>
        <div class="code">base64 -i auth/state.json | tr -d '\\n' | gh secret set X_STORAGE_STATE_B64</div>
      </div>
      
      <div class="step">
        <strong>3. 手动触发 Pipeline</strong>
        <div class="code">gh workflow run "X Radar Pipeline"</div>
      </div>
      
      <div class="footer">
        此邮件由 X Radar 自动发送
      </div>
    </div>
  </div>
</body>
</html>
`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'X Radar <notifications@resend.dev>',
        to: [toEmail],
        subject: '⚠️ X Radar: 登录状态已失效',
        html
      })
    });

    if (!response.ok) {
      const error = await response.text();
      log('ERROR', 'Failed to send email', { status: response.status, error });
      return false;
    }

    const result = await response.json();
    log('INFO', 'Email sent', { id: result.id });
    return true;
  } catch (e) {
    log('ERROR', 'Email sending failed', { error: e.message });
    return false;
  }
}

// ============ Webhook (Slack/Discord/Feishu) ============

async function sendWebhook(authStatus) {
  const webhookUrl = process.env.WEBHOOK_URL;
  
  if (!webhookUrl) {
    log('WARN', 'WEBHOOK_URL not set, skipping webhook');
    return false;
  }

  // Detect webhook type and format message accordingly
  const isSlack = webhookUrl.includes('slack.com');
  const isDiscord = webhookUrl.includes('discord.com');
  const isFeishu = webhookUrl.includes('feishu.cn') || webhookUrl.includes('larksuite.com');

  let payload;

  if (isSlack) {
    payload = {
      text: '⚠️ X Radar: 登录状态已失效',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '⚠️ X Radar 登录失效' }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*原因:*\n${authStatus.reason || 'Unknown'}` },
            { type: 'mrkdwn', text: `*时间:*\n${authStatus.checkedAt || new Date().toISOString()}` }
          ]
        },
        {
          type: 'section',
          text: { 
            type: 'mrkdwn', 
            text: '请执行以下命令修复:\n```npm run login\nbase64 -i auth/state.json | tr -d \'\\n\' | gh secret set X_STORAGE_STATE_B64\ngh workflow run "X Radar Pipeline"```' 
          }
        }
      ]
    };
  } else if (isDiscord) {
    payload = {
      content: '⚠️ X Radar: 登录状态已失效',
      embeds: [{
        title: '⚠️ X Radar 登录失效',
        color: 15158332, // Red
        fields: [
          { name: '原因', value: authStatus.reason || 'Unknown', inline: true },
          { name: '时间', value: authStatus.checkedAt || new Date().toISOString(), inline: true }
        ],
        description: '请执行以下命令修复:\n```bash\nnpm run login\nbase64 -i auth/state.json | tr -d \'\\n\' | gh secret set X_STORAGE_STATE_B64\ngh workflow run "X Radar Pipeline"\n```'
      }]
    };
  } else if (isFeishu) {
    payload = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: '⚠️ X Radar 登录失效' },
          template: 'red'
        },
        elements: [
          {
            tag: 'div',
            fields: [
              { is_short: true, text: { tag: 'lark_md', content: `**原因:** ${authStatus.reason || 'Unknown'}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**时间:** ${authStatus.checkedAt || new Date().toISOString()}` } }
            ]
          },
          {
            tag: 'div',
            text: { 
              tag: 'lark_md', 
              content: '**修复步骤:**\n1. `npm run login`\n2. `base64 -i auth/state.json | tr -d \'\\n\' | gh secret set X_STORAGE_STATE_B64`\n3. `gh workflow run "X Radar Pipeline"`' 
            }
          }
        ]
      }
    };
  } else {
    // Generic JSON payload
    payload = {
      text: `⚠️ X Radar 登录失效\n原因: ${authStatus.reason || 'Unknown'}\n时间: ${authStatus.checkedAt || new Date().toISOString()}`
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      log('ERROR', 'Webhook failed', { status: response.status, error });
      return false;
    }

    log('INFO', 'Webhook sent', { type: isSlack ? 'slack' : isDiscord ? 'discord' : isFeishu ? 'feishu' : 'generic' });
    return true;
  } catch (e) {
    log('ERROR', 'Webhook sending failed', { error: e.message });
    return false;
  }
}

// ============ Success Notification (Webhook only) ============

async function sendSuccessWebhook(stats) {
  const webhookUrl = process.env.WEBHOOK_URL;
  
  if (!webhookUrl) {
    log('WARN', 'WEBHOOK_URL not set, skipping success webhook');
    return false;
  }

  const isFeishu = webhookUrl.includes('feishu.cn') || webhookUrl.includes('larksuite.com');
  const isSlack = webhookUrl.includes('slack.com');
  const isDiscord = webhookUrl.includes('discord.com');

  const runTime = new Date().toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  let payload;

  if (isFeishu) {
    payload = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: '✅ X Radar 更新完成' },
          template: 'green'
        },
        elements: [
          {
            tag: 'div',
            fields: [
              { is_short: true, text: { tag: 'lark_md', content: `**抓取推文:** ${stats.totalTweets} 条` } },
              { is_short: true, text: { tag: 'lark_md', content: `**生成评论:** ${stats.succeeded}/${stats.total}` } }
            ]
          },
          {
            tag: 'div',
            fields: [
              { is_short: true, text: { tag: 'lark_md', content: `**Pain:** ${stats.pain} | **Reach:** ${stats.reach}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**时间:** ${runTime}` } }
            ]
          },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: { tag: 'plain_text', content: '📊 查看 Dashboard' },
                type: 'primary',
                url: DASHBOARD_URL
              }
            ]
          }
        ]
      }
    };
  } else if (isSlack) {
    payload = {
      text: '✅ X Radar 更新完成',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '✅ X Radar 更新完成' }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*抓取推文:* ${stats.totalTweets} 条` },
            { type: 'mrkdwn', text: `*生成评论:* ${stats.succeeded}/${stats.total}` },
            { type: 'mrkdwn', text: `*Pain:* ${stats.pain} | *Reach:* ${stats.reach}` },
            { type: 'mrkdwn', text: `*时间:* ${runTime}` }
          ]
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '📊 查看 Dashboard' },
              url: DASHBOARD_URL
            }
          ]
        }
      ]
    };
  } else if (isDiscord) {
    payload = {
      content: '✅ X Radar 更新完成',
      embeds: [{
        title: '✅ X Radar 更新完成',
        color: 5763719, // Green
        fields: [
          { name: '抓取推文', value: `${stats.totalTweets} 条`, inline: true },
          { name: '生成评论', value: `${stats.succeeded}/${stats.total}`, inline: true },
          { name: '分类', value: `Pain: ${stats.pain} | Reach: ${stats.reach}`, inline: false },
          { name: '时间', value: runTime, inline: true }
        ],
        url: DASHBOARD_URL
      }]
    };
  } else {
    payload = {
      text: `✅ X Radar 更新完成\n抓取: ${stats.totalTweets} 条 | 评论: ${stats.succeeded}/${stats.total}\n${DASHBOARD_URL}`
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      log('ERROR', 'Success webhook failed', { status: response.status, error });
      return false;
    }

    log('INFO', 'Success webhook sent');
    return true;
  } catch (e) {
    log('ERROR', 'Success webhook sending failed', { error: e.message });
    return false;
  }
}

function loadSuccessStats() {
  if (!existsSync(COMMENTS_FILE)) {
    log('WARN', 'Comments file not found');
    return null;
  }

  try {
    const data = JSON.parse(readFileSync(COMMENTS_FILE, 'utf-8'));
    const stats = data.commentGenerationStats || {};
    const selectionStats = data.selectionStats || {};
    
    return {
      totalTweets: data.top?.length || 0,
      total: stats.total || 0,
      succeeded: stats.succeeded || 0,
      skipped: stats.skipped || 0,
      pain: selectionStats.painSelected || 0,
      reach: selectionStats.reachSelected || 0,
      runAt: data.runAt
    };
  } catch (e) {
    log('ERROR', 'Failed to load stats', { error: e.message });
    return null;
  }
}

// ============ Main ============

async function main() {
  const isSuccessMode = process.argv.includes('--success');
  
  log('INFO', '=== X Radar Notification Module ===', { mode: isSuccessMode ? 'success' : 'auth-failed' });

  if (isSuccessMode) {
    // Success notification
    const stats = loadSuccessStats();
    if (!stats) {
      log('WARN', 'No stats available, skipping success notification');
      return;
    }

    log('INFO', 'Sending success notification...', stats);
    const result = await sendSuccessWebhook(stats);
    log('INFO', 'Success notification complete', { sent: result });
    return;
  }

  // Auth failure notification
  let authStatus = { valid: false, reason: 'UNKNOWN' };
  
  if (existsSync(AUTH_STATUS_FILE)) {
    try {
      authStatus = JSON.parse(readFileSync(AUTH_STATUS_FILE, 'utf-8'));
    } catch (e) {
      log('WARN', 'Failed to load auth status file', { error: e.message });
    }
  }

  // If auth is valid, no need to notify
  if (authStatus.valid) {
    log('INFO', 'Auth status is valid, no notification needed');
    return;
  }

  log('INFO', 'Auth failed, sending notifications...', { reason: authStatus.reason });

  // Send all notifications in parallel
  const results = await Promise.allSettled([
    createGitHubIssue(authStatus),
    sendEmail(authStatus),
    sendWebhook(authStatus)
  ]);

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  log('INFO', 'Notification complete', { 
    total: 3, 
    succeeded: successCount,
    results: results.map((r, i) => ({
      channel: ['github-issue', 'email', 'webhook'][i],
      success: r.status === 'fulfilled' && r.value === true
    }))
  });
}

main().catch(err => {
  log('ERROR', 'Notification module crashed', { error: err.message });
  process.exit(1);
});
