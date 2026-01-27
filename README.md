# X Radar

自动抓取 X (Twitter) 上与邮件痛点和 AI 趋势相关的推文，并生成回复建议。

## 功能

- **Pain Track**: 抓取邮件/Gmail/收件箱相关的痛点推文（多语言）
- **Reach Track**: 抓取 AI/生产力/自动化等趋势话题
- **KOL 追踪**: 监控指定 KOL 的相关推文（带主题过滤）
- **Brand Safety**: 三级过滤系统确保内容安全
- **智能评分**: 基于互动量和关键词匹配度进行排序
- **评论生成**: 使用 Claude API 为每条推文生成 3 个回复选项

## 设计原则

**低风险抓取策略** - 我们不使用任何反检测或指纹伪装技术：
- ❌ 不隐藏 `navigator.webdriver`
- ❌ 不注入假的 `chrome` 对象
- ❌ 不伪造浏览器插件
- ❌ 不模拟人类鼠标移动

**我们依赖的是：**
- ✅ 低频率抓取（每次只抓 8 个源）
- ✅ 充足的等待时间（页面加载 4-8s，查询间 15-30s）
- ✅ 有限的滚动深度（3-5 轮，每轮 600-1200px）
- ✅ 优雅的失败处理（单次重试后跳过，不激进）

## 项目结构

```
x-radar/
├── package.json           # 依赖和脚本
├── queries.json           # 搜索查询配置
├── influencers.json       # KOL 账号列表 + 过滤规则
├── denylist.json          # 三级品牌安全过滤词库
├── src/
│   ├── scrape.mjs         # Playwright 抓取（低风险模式）
│   ├── select.mjs         # Top10 筛选 + Brand Safety Gate
│   ├── format.mjs         # Markdown 格式化
│   ├── commenter.mjs      # Claude 评论生成 + SKIP 机制
│   ├── safety.mjs         # 品牌安全检查模块
│   ├── login.mjs          # 登录助手
│   └── utils.mjs          # 工具函数
├── auth/                  # 登录状态存储 (gitignored)
├── out/                   # 输出目录 (gitignored)
└── .github/workflows/     # GitHub Actions
```

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `LLM_API_KEY` | ✅ | - | Claude API Key |
| `LLM_API_URL` | ❌ | `https://api.anthropic.com/v1/messages` | LLM API 端点 |
| `LLM_MODEL` | ❌ | `claude-sonnet-4-20250514` | 模型名称 |
| `MAX_SOURCES` | ❌ | `8` | 每次运行抓取的源数量 |
| `SAMPLING_MODE` | ❌ | `random` | 抽样模式：`random` 或 `all` |
| `MIN_FILO_FIT` | ❌ | `2` | 最低 FiloFit 关键词匹配数 |
| `PLAYWRIGHT_HEADLESS` | ❌ | `false` | 是否无头模式运行 |
| `X_STORAGE_STATE_B64` | ❌ | - | X 登录状态的 Base64 编码 (GitHub Actions) |

## 本地运行

### 1. 安装依赖

```bash
npm install
npx playwright install chromium
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件
```

### 3. 生成登录状态（推荐）

```bash
npm run login
```

这会打开浏览器，手动登录 X 账号后按 Enter 保存登录状态。

### 4. 运行完整流水线

```bash
npm run run
```

或分步运行：

```bash
npm run scrape   # 抓取 → out/raw.json
npm run select   # 筛选 → out/top10.json
npm run format   # 格式化 → out/top10.md
npm run comment  # 生成评论 → out/top10_with_comments.*
```

## Brand Safety 系统

### 三级过滤 (denylist.json)

| 级别 | 处理方式 | 包含类别 |
|------|----------|----------|
| **hard** | 立即丢弃 | 政治、战争/军事、恐怖主义、暴力/犯罪、仇恨言论、成人内容、毒品、诈骗、隐私泄露 |
| **soft** | 除非 FiloFit ≥ 3 否则丢弃 | 宗教、执法/诉讼、灾难/受害者、加密货币投机 |
| **low_signal** | 分数惩罚 ×0.2 | 体育、名人八卦、病毒梗、广告 |

### 过滤流程

```
raw.json
  ↓
[Brand Safety Gate] → hard 命中 → 丢弃
  ↓                 → soft 命中 + FiloFit < 3 → 丢弃
  ↓                 → low_signal 命中 → 分数 ×0.2
  ↓
[FiloFit Threshold] → 关键词匹配 < MIN_FILO_FIT → 丢弃
  ↓
[Relevance Check] → Pain: 需邮件相关词
  ↓               → Reach: 需 AI + 生产力组合
  ↓
top10.json
  ↓
[Commenter Safety] → 再次检查 → SKIP 或生成评论
  ↓
top10_with_comments.json
```

## Dashboard 网页

项目包含一个 Next.js 构建的 Dashboard，用于浏览抓取的推文和生成的评论建议。

### 功能

- **日期选择**: 今天、昨天、最近 3/7 天，或指定日期
- **视图切换**: 卡片视图、列表视图、时间线视图
- **分类筛选**: Pain / Reach / KOL
- **AI 精选**: 只显示 AI 精选的推文
- **登录状态**: 显示 X 登录状态和修复指南

### 本地运行

```bash
cd web
npm install
npm run dev
```

### 部署到 Vercel

1. Fork 或连接仓库到 Vercel
2. 设置 Root Directory 为 `web/`
3. 自动部署（main 分支推送触发）

## GitHub Actions 配置

### 设置 Secrets

| Secret | 必需 | 说明 |
|--------|------|------|
| `LLM_API_KEY` | ✅ | Claude API Key |
| `LLM_API_URL` | ❌ | API 端点 |
| `LLM_MODEL` | ❌ | 模型名称 |
| `X_STORAGE_STATE_B64` | ✅ | X 登录状态 Base64 |
| `NOTIFY_EMAIL` | ❌ | 登录失效通知邮件 |
| `WEBHOOK_URL` | ❌ | Slack/Discord/飞书 Webhook |
| `RESEND_API_KEY` | ❌ | Resend 邮件服务 API Key |

### 生成 X_STORAGE_STATE_B64

```bash
npm run login

# macOS:
base64 -i auth/state.json | tr -d '\n' | gh secret set X_STORAGE_STATE_B64

# Linux:
base64 -w 0 auth/state.json | gh secret set X_STORAGE_STATE_B64
```

### 运行时间

默认每 6 小时运行一次（北京时间 08:00, 14:00, 20:00, 02:00）。也可手动触发。

### 登录失效通知

当 X 登录状态失效时，系统会自动发送通知：
- **GitHub Issue**: 自动创建 Issue，包含修复步骤
- **Email**: 发送邮件到 `NOTIFY_EMAIL`
- **Webhook**: 发送到 Slack/Discord/飞书

## 输出说明

### out/top10_with_comments.md

包含 Top10 推文和每条的 3 个回复选项：

- **A) Witty**: 短而机智的回复
- **B) Practical**: 务实的产品建设者视角
- **C) Subtle Product**: 微妙的产品角度

被 SKIP 的推文会显示原因（英文 + 中文解释）。

## 故障排查

### 空结果 / 部分失败

这是预期行为。系统会：
1. 对失败的查询最多重试 1 次（等待 30s）
2. 跳过持续失败的源继续处理其他
3. 仍然输出 top10.json（可能少于 10 条）

检查 raw.json 中各 source 的 `errors` 字段了解失败原因。

### 登录状态过期

```bash
npm run login  # 重新登录
```

### Claude API 错误

1. 检查 `LLM_API_KEY` 是否正确
2. 检查 API 配额
3. 查看 `top10_with_comments.json` 中的 `commentError`

## 自定义

### 修改搜索查询

编辑 `queries.json`

### 修改 KOL 列表

编辑 `influencers.json`（包含 `allowedQuery` 和 `denyTerms`）

### 修改安全过滤词

编辑 `denylist.json`

### 修改评分权重

编辑 `src/select.mjs`

### 修改评论生成 Prompt

编辑 `src/commenter.mjs` 中的 `SYSTEM_PROMPT`

## License

MIT
