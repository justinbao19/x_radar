#!/usr/bin/env node
/**
 * X Radar Notification Module
 * Sends notifications for auth failures, general failures, and successful runs
 * Supports: GitHub Issue, Email (via Resend), Webhook (Slack/Discord/Feishu)
 * 
 * Usage:
 *   node src/notify.mjs                 # Auth failure notification
 *   node src/notify.mjs --success       # Success notification with stats
 *   node src/notify.mjs --failure       # General failure notification (requires FAILURE_STEP env)
 */

import { readFileSync, existsSync } from 'fs';
import 'dotenv/config';

const AUTH_STATUS_FILE = 'out/auth-status.json';
const COMMENTS_FILE = 'out/latest/top10_with_comments.json';
const TOP10_FILE = 'out/latest/top10.json';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://x-radar.vercel.app';

/**
 * Check if today is Monday (Beijing timezone)
 */
function isMondayBeijing() {
  const now = new Date();
  const beijingOffset = 8 * 60; // UTC+8 in minutes
  const localOffset = now.getTimezoneOffset();
  const beijingTime = new Date(now.getTime() + (beijingOffset + localOffset) * 60 * 1000);
  return beijingTime.getDay() === 1;
}

// Telegram Bot API
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

// ============ Telegram Bot ============

/**
 * Escape special characters for Telegram MarkdownV2
 */
function escapeMarkdownV2(text) {
  if (!text) return '';
  return String(text).replace(/([_*\[\]()~`>#+=|{}.!-])/g, '\\$1');
}

/**
 * Send message via Telegram Bot API
 */
async function sendTelegramMessage(text, inlineKeyboard = null) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log('WARN', 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, skipping Telegram');
    return false;
  }

  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true
  };

  if (inlineKeyboard) {
    body.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      log('ERROR', 'Telegram send failed', { status: response.status, error });
      return false;
    }

    log('INFO', 'Telegram message sent');
    return true;
  } catch (e) {
    log('ERROR', 'Telegram sending failed', { error: e.message });
    return false;
  }
}

/**
 * Send success notification via Telegram
 */
async function sendTelegramSuccess(stats) {
  const { byGroup = {}, bySentiment = {}, byInsightType = {}, negativeTweets = [], topTopicsWithCount = [], topTweets = [] } = stats;
  const hasNegative = stats.hasNegativeSentiment;

  const runTime = new Date().toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Build message with MarkdownV2 format
  const aggregatedSuffix = stats.isAggregated ? ' \\(含周末数据\\)' : '';
  const title = hasNegative ? `⚠️ *X Radar 有新舆情*${aggregatedSuffix}` : `✅ *X Radar 扫描完成*${aggregatedSuffix}`;
  
  let message = `${title}\n\n`;
  
  // 热门话题区（新增）
  if (topTopicsWithCount && topTopicsWithCount.length > 0) {
    const topicText = topTopicsWithCount
      .map(({ topic, count }) => `${escapeMarkdownV2(topic)}\\(${count}\\)`)
      .join(' · ');
    message += `🔥 *热门话题:* ${topicText}\n\n`;
  }
  
  // 最高分推文预览（新增）
  if (topTweets && topTweets.length > 0) {
    message += `⭐ *精选推文*\n`;
    for (const tweet of topTweets) {
      const groupLabel = { pain: '痛点', reach: '传播', sentiment: '舆情', insight: '洞察' }[tweet.group] || tweet.group;
      // 优先显示翻译
      const displayText = tweet.translationZh || tweet.text;
      message += `\\[${groupLabel}\\] ${escapeMarkdownV2(tweet.author)}: "${escapeMarkdownV2(displayText)}\\.\\.\\." \\(${Math.round(tweet.score)}分\\)\n`;
    }
    message += `\n`;
  }
  
  // 痛点雷达区
  const painTotal = (byGroup.pain || 0) + (byGroup.reach || 0) + (byGroup.kol || 0);
  if (painTotal > 0) {
    message += `🎯 *痛点雷达*\n`;
    message += `痛点: ${byGroup.pain || 0} \\| 传播: ${byGroup.reach || 0} \\| KOL: ${byGroup.kol || 0}\n\n`;
  }
  
  // Filo舆情区
  message += `📢 *Filo舆情*\n`;
  const sentimentTotal = byGroup.sentiment || 0;
  if (sentimentTotal > 0) {
    const negativeCount = bySentiment.negative || 0;
    const negativeLabel = negativeCount > 0 ? `⚠️ 需关注: ${negativeCount}` : `需关注: 0`;
    message += `✓ 积极: ${bySentiment.positive || 0} \\| ○ 中性: ${bySentiment.neutral || 0} \\| ${escapeMarkdownV2(negativeLabel)}\n`;
    
    // 负面舆情预览
    if (negativeTweets.length > 0) {
      message += `\n`;
      negativeTweets.forEach(t => {
        message += `• ${escapeMarkdownV2(t.author)}: ${escapeMarkdownV2(t.text)}\\.\\.\\.\n`;
      });
    }
  } else {
    message += `暂无品牌提及\n`;
  }
  message += `\n`;
  
  // 用户洞察区
  message += `💡 *用户洞察*\n`;
  const insightTotal = byGroup.insight || 0;
  if (insightTotal > 0) {
    message += `功能需求: ${byInsightType.feature_request || 0} \\| AI需求: ${byInsightType.ai_demand || 0} \\| 竞品好评: ${byInsightType.competitor_praise || 0}\n\n`;
  } else {
    message += `暂无新洞察\n\n`;
  }
  
  // 底部统计
  const aggregatedLabel = stats.isAggregated ? ` \\(${stats.aggregatedDays}天\\)` : '';
  message += `━━━━━━━━━━━━━━━\n`;
  message += `📊 精选推文: *${stats.totalTweets}* 条${aggregatedLabel} \\| 🕐 ${escapeMarkdownV2(runTime)}`;

  // Inline keyboard with button
  const keyboard = [[
    { text: '📊 查看详情', url: DASHBOARD_URL }
  ]];

  return sendTelegramMessage(message, keyboard);
}

/**
 * Send failure notification via Telegram
 */
async function sendTelegramFailure(failureInfo) {
  const runTime = new Date().toLocaleString('zh-CN', { 
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const runUrl = failureInfo.runUrl || 'https://github.com/justinbao19/x_radar/actions';

  let message = `❌ *X Radar 运行失败*\n\n`;
  message += `*失败步骤:* ${escapeMarkdownV2(failureInfo.step || 'Unknown')}\n`;
  message += `*时间:* ${escapeMarkdownV2(runTime)}\n\n`;
  message += `*错误信息:*\n`;
  message += `\`${escapeMarkdownV2(failureInfo.error || '未知错误，请查看 GitHub Actions 日志')}\``;

  const keyboard = [[
    { text: '📋 查看日志', url: runUrl }
  ]];

  return sendTelegramMessage(message, keyboard);
}

/**
 * Send auth failed notification via Telegram
 */
async function sendTelegramAuthFailed(authStatus) {
  let message = `⚠️ *X Radar 登录失效*\n\n`;
  message += `*失败原因:* ${escapeMarkdownV2(authStatus.reason || 'Unknown')}\n`;
  message += `*检查时间:* ${escapeMarkdownV2(authStatus.checkedAt || new Date().toISOString())}\n\n`;
  message += `*修复步骤:*\n`;
  message += `1\\. \`npm run login\`\n`;
  message += `2\\. \`base64 \\-i auth/state\\.json \\| tr \\-d '\\\\n' \\| gh secret set X\\_STORAGE\\_STATE\\_B64\`\n`;
  message += `3\\. \`gh workflow run "X Radar Pipeline"\``;

  return sendTelegramMessage(message);
}

// ============ Failure Notification (Webhook only) ============

async function sendFailureWebhook(failureInfo) {
  const webhookUrl = process.env.WEBHOOK_URL;
  
  if (!webhookUrl) {
    log('WARN', 'WEBHOOK_URL not set, skipping failure webhook');
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

  const runUrl = failureInfo.runUrl || 'https://github.com/justinbao19/x_radar/actions';

  let payload;

  if (isFeishu) {
    payload = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: '❌ X Radar 运行失败' },
          template: 'red'
        },
        elements: [
          {
            tag: 'div',
            fields: [
              { is_short: true, text: { tag: 'lark_md', content: `**失败步骤:** ${failureInfo.step || 'Unknown'}` } },
              { is_short: true, text: { tag: 'lark_md', content: `**时间:** ${runTime}` } }
            ]
          },
          {
            tag: 'div',
            text: { 
              tag: 'lark_md', 
              content: `**错误信息:**\n${failureInfo.error || '未知错误，请查看 GitHub Actions 日志'}` 
            }
          },
          {
            tag: 'action',
            actions: [
              {
                tag: 'button',
                text: { tag: 'plain_text', content: '📋 查看日志' },
                type: 'default',
                url: runUrl
              }
            ]
          }
        ]
      }
    };
  } else if (isSlack) {
    payload = {
      text: '❌ X Radar 运行失败',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '❌ X Radar 运行失败' }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*失败步骤:* ${failureInfo.step || 'Unknown'}` },
            { type: 'mrkdwn', text: `*时间:* ${runTime}` }
          ]
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*错误:* ${failureInfo.error || '未知错误'}` }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '📋 查看日志' },
              url: runUrl
            }
          ]
        }
      ]
    };
  } else if (isDiscord) {
    payload = {
      content: '❌ X Radar 运行失败',
      embeds: [{
        title: '❌ X Radar 运行失败',
        color: 15158332, // Red
        fields: [
          { name: '失败步骤', value: failureInfo.step || 'Unknown', inline: true },
          { name: '时间', value: runTime, inline: true },
          { name: '错误', value: failureInfo.error || '未知错误', inline: false }
        ],
        url: runUrl
      }]
    };
  } else {
    payload = {
      text: `❌ X Radar 运行失败\n步骤: ${failureInfo.step || 'Unknown'}\n错误: ${failureInfo.error || '未知错误'}\n${runUrl}`
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
      log('ERROR', 'Failure webhook failed', { status: response.status, error });
      return false;
    }

    log('INFO', 'Failure webhook sent');
    return true;
  } catch (e) {
    log('ERROR', 'Failure webhook sending failed', { error: e.message });
    return false;
  }
}

// ============ Success Notification (Webhook only) ============

/**
 * Build Feishu card elements for the three-module layout
 */
function buildFeishuCardElements(stats, runTime) {
  const { byGroup = {}, bySentiment = {}, byInsightType = {}, negativeTweets = [], topTopicsWithCount = [], topTweets = [] } = stats;
  
  const elements = [];
  
  // ===== 热门话题区（新增）=====
  if (topTopicsWithCount.length > 0) {
    const topicText = topTopicsWithCount
      .map(({ topic, count }) => `${topic} (${count})`)
      .join(' · ');
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `**🔥 热门话题:** ${topicText}` }
    });
    elements.push({ tag: 'hr' });
  }
  
  // ===== 最高分推文预览（新增）=====
  if (topTweets.length > 0) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: '**⭐ 精选推文**' }
    });
    
    for (const tweet of topTweets) {
      const groupLabel = { pain: '痛点', reach: '传播', sentiment: '舆情', insight: '洞察' }[tweet.group] || tweet.group;
      // 优先显示翻译，否则显示原文
      const displayText = tweet.translationZh || tweet.text;
      elements.push({
        tag: 'note',
        elements: [{ 
          tag: 'plain_text', 
          content: `[${groupLabel}] ${tweet.author}: "${displayText}..." (${Math.round(tweet.score)}分)`
        }]
      });
    }
    elements.push({ tag: 'hr' });
  }
  
  // ===== 痛点雷达区 =====
  const painTotal = (byGroup.pain || 0) + (byGroup.reach || 0) + (byGroup.kol || 0);
  if (painTotal > 0) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: '**🎯 痛点雷达**' }
    });
    elements.push({
      tag: 'div',
      fields: [
        { is_short: true, text: { tag: 'lark_md', content: `痛点: ${byGroup.pain || 0}` } },
        { is_short: true, text: { tag: 'lark_md', content: `传播: ${byGroup.reach || 0}` } },
        { is_short: true, text: { tag: 'lark_md', content: `KOL: ${byGroup.kol || 0}` } }
      ]
    });
    elements.push({ tag: 'hr' });
  }
  
  // ===== Filo舆情区 =====
  const sentimentTotal = (byGroup.sentiment || 0);
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: '**📢 Filo舆情**' }
  });
  
  if (sentimentTotal > 0) {
    // 有舆情数据
    const negativeCount = bySentiment.negative || 0;
    const negativeText = negativeCount > 0 
      ? `⚠️ **需关注: ${negativeCount}**` 
      : `需关注: 0`;
    
    elements.push({
      tag: 'div',
      fields: [
        { is_short: true, text: { tag: 'lark_md', content: `✓ 积极: ${bySentiment.positive || 0}` } },
        { is_short: true, text: { tag: 'lark_md', content: `○ 中性: ${bySentiment.neutral || 0}` } },
        { is_short: true, text: { tag: 'lark_md', content: negativeText } }
      ]
    });
    
    // 如有负面舆情，显示预览
    if (negativeTweets.length > 0) {
      const previewContent = negativeTweets
        .map(t => `• ${t.author}: ${t.text}...`)
        .join('\n');
      elements.push({
        tag: 'note',
        elements: [{ tag: 'plain_text', content: previewContent }]
      });
    }
  } else {
    // 无舆情数据
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: '暂无品牌提及' }
    });
  }
  
  elements.push({ tag: 'hr' });
  
  // ===== 用户洞察区 =====
  const insightTotal = (byGroup.insight || 0);
  elements.push({
    tag: 'div',
    text: { tag: 'lark_md', content: '**💡 用户洞察**' }
  });
  
  if (insightTotal > 0) {
    elements.push({
      tag: 'div',
      fields: [
        { is_short: true, text: { tag: 'lark_md', content: `功能需求: ${byInsightType.feature_request || 0}` } },
        { is_short: true, text: { tag: 'lark_md', content: `AI需求: ${byInsightType.ai_demand || 0}` } },
        { is_short: true, text: { tag: 'lark_md', content: `竞品好评: ${byInsightType.competitor_praise || 0}` } }
      ]
    });
  } else {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: '暂无新洞察' }
    });
  }
  
  elements.push({ tag: 'hr' });
  
  // ===== 底部统计 =====
  const aggregatedLabel = stats.isAggregated ? ` (含${stats.aggregatedDays}天数据)` : '';
  elements.push({
    tag: 'div',
    fields: [
      { is_short: true, text: { tag: 'lark_md', content: `**精选推文:** ${stats.totalTweets} 条${aggregatedLabel}` } },
      { is_short: true, text: { tag: 'lark_md', content: `**更新时间:** ${runTime}` } }
    ]
  });
  
  // ===== 操作按钮 =====
  elements.push({
    tag: 'action',
    actions: [
      {
        tag: 'button',
        text: { tag: 'plain_text', content: '📊 查看详情' },
        type: 'primary',
        url: DASHBOARD_URL
      }
    ]
  });
  
  return elements;
}

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
    // 根据是否有负面舆情决定标题和颜色
    const hasNegative = stats.hasNegativeSentiment;
    const aggregatedSuffix = stats.isAggregated ? ' (含周末数据)' : '';
    const headerTitle = hasNegative ? `⚠️ X Radar 有新舆情${aggregatedSuffix}` : `✅ X Radar 扫描完成${aggregatedSuffix}`;
    const headerTemplate = hasNegative ? 'orange' : 'green';
    
    payload = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: headerTitle },
          template: headerTemplate
        },
        elements: buildFeishuCardElements(stats, runTime)
      }
    };
  } else if (isSlack) {
    // Slack: 保持兼容，增加新统计
    const { byGroup = {}, bySentiment = {}, topTopicsWithCount = [], topTweets = [] } = stats;
    const hasNegative = stats.hasNegativeSentiment;
    const aggregatedSuffix = stats.isAggregated ? ' (含周末数据)' : '';
    
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: hasNegative ? `⚠️ X Radar 有新舆情${aggregatedSuffix}` : `✅ X Radar 扫描完成${aggregatedSuffix}` }
      }
    ];
    
    // 热门话题
    if (topTopicsWithCount.length > 0) {
      const topicText = topTopicsWithCount.map(({ topic, count }) => `${topic}(${count})`).join(' · ');
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*🔥 热门话题:* ${topicText}` }
      });
    }
    
    // 最高分推文
    if (topTweets.length > 0) {
      const tweetPreview = topTweets.map(t => {
        const groupLabel = { pain: '痛点', reach: '传播', sentiment: '舆情', insight: '洞察' }[t.group] || t.group;
        const displayText = t.translationZh || t.text;
        return `[${groupLabel}] ${t.author}: "${displayText}..." (${Math.round(t.score)}分)`;
      }).join('\n');
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*⭐ 精选推文*\n${tweetPreview}` }
      });
    }
    
    blocks.push(
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*🎯 痛点雷达:* 痛点 ${byGroup.pain || 0} | 传播 ${byGroup.reach || 0} | KOL ${byGroup.kol || 0}` }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*📢 Filo舆情:* 积极 ${bySentiment.positive || 0} | 中性 ${bySentiment.neutral || 0} | 需关注 ${bySentiment.negative || 0}` }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*精选推文:* ${stats.totalTweets} 条` },
          { type: 'mrkdwn', text: `*更新时间:* ${runTime}` }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '📊 查看详情' },
            url: DASHBOARD_URL
          }
        ]
      }
    );
    
    payload = {
      text: hasNegative ? `⚠️ X Radar 有新舆情${aggregatedSuffix}` : `✅ X Radar 扫描完成${aggregatedSuffix}`,
      blocks
    };
  } else if (isDiscord) {
    // Discord: 保持兼容，增加新统计
    const { byGroup = {}, bySentiment = {}, topTopicsWithCount = [], topTweets = [] } = stats;
    const hasNegative = stats.hasNegativeSentiment;
    const aggregatedSuffix = stats.isAggregated ? ' (含周末数据)' : '';
    
    const fields = [];
    
    // 热门话题
    if (topTopicsWithCount.length > 0) {
      const topicText = topTopicsWithCount.map(({ topic, count }) => `${topic}(${count})`).join(' · ');
      fields.push({ name: '🔥 热门话题', value: topicText, inline: false });
    }
    
    // 最高分推文
    if (topTweets.length > 0) {
      const tweetPreview = topTweets.map(t => {
        const groupLabel = { pain: '痛点', reach: '传播', sentiment: '舆情', insight: '洞察' }[t.group] || t.group;
        const displayText = t.translationZh || t.text;
        return `[${groupLabel}] ${t.author}: "${displayText}..." (${Math.round(t.score)}分)`;
      }).join('\n');
      fields.push({ name: '⭐ 精选推文', value: tweetPreview, inline: false });
    }
    
    fields.push(
      { name: '🎯 痛点雷达', value: `痛点 ${byGroup.pain || 0} | 传播 ${byGroup.reach || 0} | KOL ${byGroup.kol || 0}`, inline: false },
      { name: '📢 Filo舆情', value: `积极 ${bySentiment.positive || 0} | 中性 ${bySentiment.neutral || 0} | 需关注 ${bySentiment.negative || 0}`, inline: false },
      { name: '精选推文', value: `${stats.totalTweets} 条`, inline: true },
      { name: '更新时间', value: runTime, inline: true }
    );
    
    payload = {
      content: hasNegative ? `⚠️ X Radar 有新舆情${aggregatedSuffix}` : `✅ X Radar 扫描完成${aggregatedSuffix}`,
      embeds: [{
        title: hasNegative ? `⚠️ X Radar 有新舆情${aggregatedSuffix}` : `✅ X Radar 扫描完成${aggregatedSuffix}`,
        color: hasNegative ? 16744192 : 5763719, // Orange or Green
        fields,
        url: DASHBOARD_URL
      }]
    };
  } else {
    // Generic: 简化文本
    const { byGroup = {}, bySentiment = {}, topTopicsWithCount = [] } = stats;
    const topicText = topTopicsWithCount.length > 0 
      ? `🔥 热门: ${topTopicsWithCount.map(({ topic }) => topic).join(', ')}\n` 
      : '';
    payload = {
      text: `✅ X Radar 扫描完成\n${topicText}🎯 痛点: ${byGroup.pain || 0} | 传播: ${byGroup.reach || 0}\n📢 舆情: 积极 ${bySentiment.positive || 0} | 需关注 ${bySentiment.negative || 0}\n精选: ${stats.totalTweets} 条\n${DASHBOARD_URL}`
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
  // Try top10.json first (new format), then fall back to top10_with_comments.json
  let dataFile = TOP10_FILE;
  if (!existsSync(TOP10_FILE)) {
    if (!existsSync(COMMENTS_FILE)) {
      log('WARN', 'No data file found');
      return null;
    }
    dataFile = COMMENTS_FILE;
  }

  try {
    const data = JSON.parse(readFileSync(dataFile, 'utf-8'));
    const stats = data.commentGenerationStats || {};
    const selectionStats = data.selectionStats || {};
    const aggregationInfo = data.aggregationInfo || {};
    
    // 统计各语言数量
    const langStats = stats.byLanguage || {};
    const languages = Object.entries(langStats)
      .map(([lang, count]) => {
        const langNames = { en: '英文', zh: '中文', ja: '日文', ko: '韩文' };
        return `${langNames[lang] || lang} ${count} 条`;
      })
      .join('、');
    
    // 提取主要话题关键词（从sourceQuery字段）- 改进格式
    const topicCounts = {};
    (data.top || []).forEach(item => {
      const query = item.sourceQuery || '';
      // 提取关键词，如 gmail-spam-en -> gmail spam
      let keywords = query.replace(/-/g, ' ').replace(/\s*(en|cn|jp|zh|ja|ko)\s*$/i, '').trim();
      // 首字母大写
      keywords = keywords.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (keywords) {
        topicCounts[keywords] = (topicCounts[keywords] || 0) + 1;
      }
    });
    
    // TOP 3 热门话题，带数量
    const topTopicsWithCount = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic, count]) => ({ topic, count }));
    
    const topTopics = topTopicsWithCount
      .map(({ topic }) => topic)
      .join('、');
    
    // 新增：读取分组、舆情、洞察统计
    const byGroup = selectionStats.byGroup || {};
    const bySentiment = selectionStats.bySentiment || {};
    const byInsightType = selectionStats.byInsightType || {};
    
    // 获取负面舆情预览（如有）
    const negativeTweets = (data.top || [])
      .filter(t => t.sentimentLabel === 'negative')
      .slice(0, 2)  // 最多显示2条
      .map(t => ({ 
        author: t.author || 'Unknown', 
        text: (t.text || '').slice(0, 50) 
      }));
    
    // 获取最高分推文预览（TOP 2）
    const topTweets = (data.top || [])
      .slice(0, 2)  // 已按分数排序，取前2条
      .map(t => ({
        author: t.author || 'Unknown',
        text: (t.text || '').slice(0, 60),
        score: t.finalScore || 0,
        group: t.group,
        // 使用翻译（如果有）
        translationZh: t.translationZh || null
      }));
    
    return {
      totalTweets: data.top?.length || 0,
      totalCandidates: selectionStats.totalCandidates || 0,
      total: stats.total || 0,
      succeeded: stats.succeeded || 0,
      skipped: stats.skipped || 0,
      runAt: data.runAt,
      languages,
      topTopics,
      topTopicsWithCount,  // 带数量的话题列表
      topTweets,           // 最高分推文预览
      // 新增统计
      byGroup,
      bySentiment,
      byInsightType,
      negativeTweets,
      hasNegativeSentiment: (bySentiment.negative || 0) > 0,
      // 聚合信息（周一）- 优先使用 aggregationInfo，否则检测是否周一
      isAggregated: aggregationInfo.isAggregated || isMondayBeijing(),
      aggregatedDays: aggregationInfo.aggregatedDays || (isMondayBeijing() ? 3 : 1),
      loadedDates: aggregationInfo.loadedDates || [],
      isMonday: isMondayBeijing()
    };
  } catch (e) {
    log('ERROR', 'Failed to load stats', { error: e.message });
    return null;
  }
}

// ============ Main ============

async function main() {
  const isSuccessMode = process.argv.includes('--success');
  const isFailureMode = process.argv.includes('--failure');
  
  const mode = isSuccessMode ? 'success' : isFailureMode ? 'failure' : 'auth-failed';
  log('INFO', '=== X Radar Notification Module ===', { mode });

  if (isSuccessMode) {
    // Success notification
    const stats = loadSuccessStats();
    if (!stats) {
      log('WARN', 'No stats available, skipping success notification');
      return;
    }

    log('INFO', 'Sending success notification...', stats);
    const results = await Promise.allSettled([
      sendSuccessWebhook(stats),
      sendTelegramSuccess(stats)
    ]);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    log('INFO', 'Success notification complete', { 
      total: 2, 
      succeeded: successCount,
      results: results.map((r, i) => ({
        channel: ['webhook', 'telegram'][i],
        success: r.status === 'fulfilled' && r.value === true
      }))
    });
    return;
  }

  if (isFailureMode) {
    // General failure notification
    const failureInfo = {
      step: process.env.FAILURE_STEP || 'Unknown',
      error: process.env.FAILURE_ERROR || '',
      runUrl: process.env.GITHUB_RUN_URL || `https://github.com/${process.env.GITHUB_REPOSITORY || 'justinbao19/x_radar'}/actions/runs/${process.env.GITHUB_RUN_ID || ''}`
    };

    log('INFO', 'Sending failure notification...', failureInfo);
    const results = await Promise.allSettled([
      sendFailureWebhook(failureInfo),
      sendTelegramFailure(failureInfo)
    ]);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    log('INFO', 'Failure notification complete', { 
      total: 2, 
      succeeded: successCount,
      results: results.map((r, i) => ({
        channel: ['webhook', 'telegram'][i],
        success: r.status === 'fulfilled' && r.value === true
      }))
    });
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
    sendWebhook(authStatus),
    sendTelegramAuthFailed(authStatus)
  ]);

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  log('INFO', 'Notification complete', { 
    total: 4, 
    succeeded: successCount,
    results: results.map((r, i) => ({
      channel: ['github-issue', 'email', 'webhook', 'telegram'][i],
      success: r.status === 'fulfilled' && r.value === true
    }))
  });
}

main().catch(err => {
  log('ERROR', 'Notification module crashed', { error: err.message });
  process.exit(1);
});
