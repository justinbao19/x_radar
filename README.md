# X Radar

自动抓取 X (Twitter) 上与邮件痛点和 AI 趋势相关的推文，并生成回复建议。

## 功能

- **Pain Track**: 抓取邮件/Gmail/收件箱相关的痛点推文（多语言，包括日语、中文）
- **Reach Track**: 抓取 AI/生产力/自动化等趋势话题
- **KOL 追踪**: 监控指定 KOL 的相关推文
- **智能评分**: 基于互动量和关键词匹配度进行排序
- **评论生成**: 使用 Claude API 为每条推文生成 3 个回复选项（原语言 + 中文解释）

## 项目结构

```
x-radar/
├── package.json           # 依赖和脚本
├── queries.json           # 搜索查询配置
├── influencers.json       # KOL 账号列表
├── src/
│   ├── scrape.mjs         # Playwright 抓取
│   ├── select.mjs         # Top10 筛选
│   ├── format.mjs         # Markdown 格式化
│   ├── commenter.mjs      # Claude 评论生成
│   ├── login.mjs          # 登录助手
│   └── utils.mjs          # 工具函数
├── auth/                  # 登录状态存储
├── out/                   # 输出目录
│   ├── raw.json           # 原始抓取数据
│   ├── top10.json         # 筛选后的 Top10
│   ├── top10.md           # Markdown 报告
│   ├── top10_with_comments.json  # 带评论的结果
│   └── top10_with_comments.md    # 带评论的 Markdown
└── .github/workflows/     # GitHub Actions
```

## 本地运行

### 1. 安装依赖

```bash
npm install
npx playwright install chromium
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入 Claude API Key
```

`.env` 文件内容：

```
LLM_API_URL=https://api.anthropic.com/v1/messages
LLM_API_KEY=sk-ant-api03-xxxx
LLM_MODEL=claude-sonnet-4-20250514
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

## GitHub Actions 配置

### 设置 Secrets

在仓库的 Settings → Secrets and variables → Actions 中添加：

| Secret 名称 | 必需 | 说明 |
|------------|------|------|
| `LLM_API_KEY` | ✅ | Claude API Key |
| `LLM_API_URL` | ❌ | 默认 `https://api.anthropic.com/v1/messages` |
| `LLM_MODEL` | ❌ | 默认 `claude-sonnet-4-20250514` |
| `X_STORAGE_STATE_B64` | ❌ | X 登录状态的 Base64 编码 |

### 生成 X_STORAGE_STATE_B64

```bash
# 本地登录后生成
npm run login

# 编码为 Base64
# macOS:
base64 -i auth/state.json | tr -d '\n'

# Linux:
base64 -w 0 auth/state.json

# 将输出复制到 GitHub Secrets
```

### 运行时间

默认每 6 小时运行一次（UTC 00:00, 06:00, 12:00, 18:00）。

也可以在 Actions 页面手动触发 (Run workflow)。

### 查看结果

运行完成后，在 Actions 页面找到对应的 workflow run，下载 Artifacts 中的 `x-radar-*` 文件。

## 输出说明

### out/top10_with_comments.md

包含 Top10 推文和每条推文的 3 个回复选项：

- **A) Witty**: 短而机智的回复
- **B) Practical**: 务实的产品建设者视角
- **C) Subtle Product**: 微妙的产品角度

每个选项都有中文解释说明意图。

## 故障排查

### 空结果

1. 检查是否有 `auth/state.json`
2. 登录状态可能过期，重新运行 `npm run login`
3. X 可能有 rate limit，等待一段时间再试

### 选择器错误

X 的 DOM 结构可能会变化。如果出现大量 "Failed to extract tweet" 警告：

1. 检查 `src/scrape.mjs` 中的 `SELECTORS`
2. 在浏览器中检查 X 的当前 DOM 结构
3. 更新选择器

### Claude API 错误

1. 检查 `LLM_API_KEY` 是否正确
2. 检查 API 配额是否用完
3. 查看 `out/top10_with_comments.json` 中的 `commentError` 字段

### GitHub Actions 失败

1. 检查 Secrets 是否正确设置
2. 查看 workflow 日志中的错误信息
3. 尝试手动触发 workflow 进行调试

## 自定义

### 修改搜索查询

编辑 `queries.json` 添加或修改搜索查询。

### 修改 KOL 列表

编辑 `influencers.json` 添加或删除 KOL 账号。

### 修改评分权重

编辑 `src/select.mjs` 中的评分公式和配额设置。

### 修改评论生成 Prompt

编辑 `src/commenter.mjs` 中的 `SYSTEM_PROMPT`。

## License

MIT
