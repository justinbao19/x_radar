/**
 * HTML Report Generator for X Radar
 * Modern, minimal design with clear visual hierarchy
 */

// ============ Helper Functions ============

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ============ Styles ============

function getStyles() {
  return `
  <style>
    :root {
      --bg-primary: #f8fafc;
      --bg-card: #ffffff;
      --bg-muted: #f1f5f9;
      --bg-hover: #e2e8f0;
      --border: #e2e8f0;
      --border-strong: #cbd5e1;
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #94a3b8;
      --accent: #0f172a;
      --accent-foreground: #ffffff;
      --blue: #3b82f6;
      --blue-light: #dbeafe;
      --pink: #ec4899;
      --pink-light: #fce7f3;
      --green: #10b981;
      --green-light: #d1fae5;
      --yellow: #f59e0b;
      --yellow-light: #fef3c7;
      --red: #ef4444;
      --red-light: #fee2e2;
      --purple: #8b5cf6;
      --purple-light: #ede9fe;
      --radius: 16px;
      --radius-sm: 10px;
      --radius-xs: 6px;
      --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
      --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    }

    * { box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }

    /* Header */
    .header {
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .header-inner {
      max-width: 800px;
      margin: 0 auto;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      font-size: 15px;
    }

    .logo-icon {
      width: 36px;
      height: 36px;
      background: var(--accent);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-icon svg {
      width: 20px;
      height: 20px;
      fill: var(--accent-foreground);
    }

    .header-meta {
      font-size: 13px;
      color: var(--text-muted);
    }

    /* Stats Bar */
    .stats-bar {
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
    }

    .stats-inner {
      max-width: 800px;
      margin: 0 auto;
      padding: 14px 24px;
      display: flex;
      gap: 32px;
    }

    .stat-item {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .stat-value {
      font-size: 18px;
      font-weight: 600;
    }

    .stat-label {
      font-size: 13px;
      color: var(--text-muted);
    }

    /* View Toggle */
    .view-toggle-wrapper {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .toggle-switch {
      position: relative;
      width: 44px;
      height: 24px;
    }

    .toggle-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--border-strong);
      transition: 0.3s;
      border-radius: 24px;
    }

    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }

    .toggle-switch input:checked + .toggle-slider {
      background-color: var(--purple);
    }

    .toggle-switch input:checked + .toggle-slider:before {
      transform: translateX(20px);
    }

    .toggle-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .toggle-label.active {
      color: var(--purple);
    }

    /* AI Picked Badge */
    .ai-picked-badge {
      position: absolute;
      top: -1px;
      right: 32px;
      background: var(--purple);
      color: white;
      font-size: 10px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 0 0 10px 10px;
      display: flex;
      align-items: center;
      gap: 4px;
      letter-spacing: 0.3px;
    }

    .ai-picked-badge svg {
      width: 12px;
      height: 12px;
    }

    /* Not AI-picked cards (hidden by default in AI view) */
    .tweet-card.not-ai-picked {
      display: none;
    }

    body.show-all .tweet-card.not-ai-picked {
      display: block;
      opacity: 0.85;
    }

    body.show-all .tweet-card.not-ai-picked .card-number {
      background: var(--text-muted);
    }

    /* Main */
    .main {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
    }

    /* Tweet Card */
    .tweet-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 32px;
      overflow: hidden;
      transition: all 0.2s ease;
      position: relative;
    }

    .tweet-card:hover {
      border-color: var(--border-strong);
      box-shadow: var(--shadow-lg);
    }

    /* Card Number Indicator */
    .card-number {
      position: absolute;
      top: -1px;
      left: 32px;
      background: var(--accent);
      color: var(--accent-foreground);
      font-size: 12px;
      font-weight: 700;
      padding: 6px 16px;
      border-radius: 0 0 10px 10px;
      letter-spacing: 0.5px;
    }

    .tweet-header {
      padding: 32px 28px 20px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .tweet-author {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .author-avatar {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--bg-muted) 0%, var(--border) 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 18px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .author-info {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .author-name {
      font-weight: 600;
      font-size: 16px;
      color: var(--text-primary);
      text-decoration: none;
    }

    .author-name:hover {
      color: var(--blue);
    }

    .author-tags {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tag {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: var(--radius-xs);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .tag-reach {
      background: var(--blue-light);
      color: #1d4ed8;
    }

    .tag-pain {
      background: var(--pink-light);
      color: #be185d;
    }

    .tag-lang {
      background: var(--bg-muted);
      color: var(--text-secondary);
    }

    .tag-relevance-high {
      background: var(--green-light);
      color: #047857;
    }

    .tag-relevance-medium {
      background: var(--yellow-light);
      color: #b45309;
    }

    .tag-relevance-low {
      background: var(--bg-muted);
      color: var(--text-muted);
    }

    .tweet-score {
      text-align: right;
    }

    .score-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .score-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Tweet Content */
    .tweet-content {
      padding: 0 28px 24px;
    }

    .tweet-text {
      font-size: 15px;
      line-height: 1.75;
      color: var(--text-primary);
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--bg-muted);
      padding: 16px 20px;
      border-radius: var(--radius-sm);
      border-left: 4px solid var(--border-strong);
    }

    .tweet-translation {
      margin-top: 12px;
      padding: 14px 18px;
      background: linear-gradient(135deg, var(--blue-light) 0%, #e0f2fe 100%);
      border-radius: var(--radius-sm);
      border-left: 4px solid var(--blue);
    }

    .translation-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }

    .translation-label {
      font-size: 11px;
      font-weight: 600;
      color: #1d4ed8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .translation-label svg {
      width: 14px;
      height: 14px;
    }

    .translation-text {
      font-size: 14px;
      line-height: 1.7;
      color: var(--text-secondary);
      white-space: pre-wrap;
    }

    .tweet-metrics {
      display: flex;
      align-items: center;
      gap: 24px;
      margin-top: 20px;
    }

    .metric {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      color: var(--text-secondary);
    }

    .metric svg {
      width: 18px;
      height: 18px;
      opacity: 0.5;
    }

    .tweet-actions {
      margin-top: 20px;
    }

    .btn-view {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: var(--accent);
      color: var(--accent-foreground);
      font-size: 14px;
      font-weight: 500;
      border-radius: var(--radius-sm);
      text-decoration: none;
      transition: all 0.15s ease;
    }

    .btn-view:hover {
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }

    .btn-view svg {
      width: 16px;
      height: 16px;
    }

    /* Reply Section */
    .reply-section {
      background: var(--bg-muted);
      padding: 24px 28px;
      border-top: 1px solid var(--border);
    }

    .reply-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 20px;
    }

    .reply-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      padding: 3px 8px;
      background: linear-gradient(135deg, var(--purple-light) 0%, #ddd6fe 100%);
      color: var(--purple);
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .ai-badge svg {
      width: 12px;
      height: 12px;
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 6px;
      margin-bottom: 20px;
      background: var(--bg-card);
      padding: 5px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
    }

    .tab-btn {
      flex: 1;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      background: transparent;
      border: none;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .tab-btn:hover {
      color: var(--text-primary);
      background: var(--bg-muted);
    }

    .tab-btn.active {
      color: var(--text-primary);
      background: var(--bg-card);
      box-shadow: var(--shadow);
    }

    .tab-btn .ai-star {
      width: 14px;
      height: 14px;
      color: var(--purple);
    }

    .tab-btn:has(.ai-star) {
      background: var(--purple-light);
      color: var(--purple);
    }

    .tab-btn:has(.ai-star).active {
      background: var(--purple);
      color: white;
    }

    .tab-btn:has(.ai-star).active .ai-star {
      color: white;
    }

    /* Tab Content */
    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    .reply-box {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 20px;
      position: relative;
    }

    .reply-box.recommended {
      border-color: var(--purple);
      border-width: 2px;
    }

    .reply-ai-indicator {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      color: var(--text-muted);
    }

    .reply-ai-indicator.recommended {
      background: var(--purple);
      color: white;
      padding: 4px 10px;
      border-radius: 20px;
      top: -12px;
      right: 16px;
    }

    .reply-ai-indicator svg {
      width: 14px;
      height: 14px;
    }

    .reply-text {
      font-size: 15px;
      line-height: 1.7;
      color: var(--text-primary);
      margin-bottom: 16px;
      padding-right: 60px;
    }

    .reply-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }

    .reply-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .reply-chars {
      font-size: 12px;
      color: var(--text-muted);
    }

    .risk-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: var(--radius-xs);
    }

    .risk-low {
      background: var(--green-light);
      color: #047857;
    }

    .risk-medium {
      background: var(--yellow-light);
      color: #b45309;
    }

    .risk-high {
      background: var(--red-light);
      color: #b91c1c;
    }

    .btn-copy {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      background: var(--bg-muted);
      border: 1px solid var(--border);
      border-radius: var(--radius-xs);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-copy:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
      border-color: var(--border-strong);
    }

    .btn-copy.copied {
      color: var(--green);
      border-color: var(--green);
      background: var(--green-light);
    }

    .btn-copy svg {
      width: 15px;
      height: 15px;
    }

    /* Explain */
    .explain-section {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }

    .explain-btn {
      font-size: 13px;
      color: var(--text-muted);
      background: none;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0;
      transition: color 0.15s ease;
    }

    .explain-btn:hover {
      color: var(--text-secondary);
    }

    .explain-btn svg {
      width: 14px;
      height: 14px;
      transition: transform 0.2s ease;
    }

    .explain-btn.open svg {
      transform: rotate(90deg);
    }

    .explain-text {
      display: none;
      margin-top: 12px;
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.7;
      padding-left: 20px;
      border-left: 2px solid var(--border);
    }

    .explain-text.open {
      display: block;
    }

    /* State Boxes */
    .state-box {
      padding: 20px;
      border-radius: var(--radius-sm);
      font-size: 14px;
    }

    .state-skip {
      background: var(--yellow-light);
      border: 1px solid #fde68a;
      color: #92400e;
    }

    .state-error {
      background: var(--red-light);
      border: 1px solid #fecaca;
      color: #991b1b;
    }

    .state-empty {
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-muted);
      text-align: center;
    }

    /* Toast */
    .toast {
      position: fixed;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      padding: 14px 24px;
      background: var(--accent);
      color: var(--accent-foreground);
      font-size: 14px;
      font-weight: 500;
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-lg);
      opacity: 0;
      transition: all 0.3s ease;
      z-index: 100;
    }

    .toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    /* Footer */
    .footer {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
      text-align: center;
      font-size: 13px;
      color: var(--text-muted);
    }

    /* Responsive */
    @media (max-width: 640px) {
      .main { padding: 24px 16px; }
      .tweet-header, .tweet-content, .reply-section { padding-left: 20px; padding-right: 20px; }
      .tweet-card { margin-bottom: 24px; }
      .card-number { left: 20px; }
      .tabs { flex-direction: column; }
      .reply-meta { flex-direction: column; align-items: stretch; }
      .btn-copy { justify-content: center; }
    }

    @media print {
      .header { position: static; }
      .tab-content { display: block !important; }
      .tabs { display: none; }
    }
  </style>`;
}

// ============ Scripts ============

function getScripts() {
  return `
  <script>
    function switchTab(cardIndex, tabIndex) {
      const card = document.getElementById('card-' + cardIndex);
      if (!card) return;
      
      const tabs = card.querySelectorAll('.tab-btn');
      const contents = card.querySelectorAll('.tab-content');
      
      tabs.forEach((tab, i) => {
        tab.classList.toggle('active', i === tabIndex);
      });
      
      contents.forEach((content, i) => {
        content.classList.toggle('active', i === tabIndex);
      });
    }

    function toggleExplain(btn) {
      const isOpen = btn.classList.toggle('open');
      const text = btn.nextElementSibling;
      text.classList.toggle('open', isOpen);
    }

    function copyText(text, btn) {
      navigator.clipboard.writeText(text).then(() => {
        btn.classList.add('copied');
        btn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg> 已复制';
        showToast('已复制到剪贴板');
        
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg> 复制';
        }, 2000);
      }).catch(() => {
        showToast('复制失败');
      });
    }

    function showToast(message) {
      let toast = document.getElementById('toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
      }
      
      toast.textContent = message;
      toast.classList.add('show');
      
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2000);
    }

    function toggleView() {
      const toggle = document.getElementById('viewToggle');
      const showAll = !toggle.checked;
      document.body.classList.toggle('show-all', showAll);
      
      // Update label
      const labels = document.querySelectorAll('.toggle-label');
      labels[0].classList.toggle('active', !showAll);
      labels[1].classList.toggle('active', showAll);
      
      // Update stats display
      const aiPickedStat = document.getElementById('stat-ai-picked');
      const allStat = document.getElementById('stat-all');
      if (aiPickedStat && allStat) {
        aiPickedStat.style.display = showAll ? 'none' : 'flex';
        allStat.style.display = showAll ? 'flex' : 'none';
      }
    }
  </script>`;
}

// ============ Components ============

function renderHeader(data) {
  return `
  <header class="header">
    <div class="header-inner">
      <div class="logo">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </div>
        X Radar
      </div>
      <div class="header-meta">${formatDate(data.runAt)}</div>
    </div>
  </header>`;
}

function renderStats(data) {
  const stats = data.commentGenerationStats || {};
  const selectionStats = data.selectionStats || {};
  const langs = stats.byLanguage 
    ? Object.entries(stats.byLanguage).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(' / ')
    : '';
  
  const aiPickedCount = selectionStats.aiPicked || data.top?.filter(t => t.aiPicked).length || 0;
  const totalCount = selectionStats.qualified || data.top?.length || 0;

  return `
  <div class="stats-bar">
    <div class="stats-inner">
      <div class="stat-item" id="stat-ai-picked">
        <span class="stat-value">${aiPickedCount}</span>
        <span class="stat-label">AI 精选</span>
      </div>
      <div class="stat-item" id="stat-all" style="display: none;">
        <span class="stat-value">${totalCount}</span>
        <span class="stat-label">全部推文</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${stats.succeeded || totalCount}</span>
        <span class="stat-label">已生成</span>
      </div>
      ${langs ? `
      <div class="stat-item">
        <span class="stat-value" style="font-size: 14px;">${langs}</span>
        <span class="stat-label">语言</span>
      </div>
      ` : ''}
      <div class="view-toggle-wrapper">
        <span class="toggle-label active">AI 精选</span>
        <label class="toggle-switch">
          <input type="checkbox" id="viewToggle" checked onchange="toggleView()">
          <span class="toggle-slider"></span>
        </label>
        <span class="toggle-label">全部</span>
      </div>
    </div>
  </div>`;
}

// Translation icon
const translateIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 19l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/></svg>`;

// AI Sparkle icon
const aiSparkleIcon = `<svg class="ai-star" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/></svg>`;

const aiSparkleSmall = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z"/></svg>`;

function renderTranslation(tweet) {
  // Only show translation for non-Chinese tweets that have a translation
  const translation = tweet.comments?.tweetTranslationZh;
  const lang = tweet.detectedLanguage || tweet.comments?.language;
  
  // Don't show translation for Chinese tweets
  if (lang === 'zh' || !translation || translation.trim() === '') {
    return '';
  }
  
  return `
  <div class="tweet-translation">
    <div class="translation-header">
      ${translateIcon}
      <span class="translation-label">中文翻译</span>
    </div>
    <div class="translation-text">${escapeHtml(translation)}</div>
  </div>`;
}

function renderReplyOption(opt, cardIndex, tabIndex, isRecommended = false) {
  const riskClass = opt.risk === 'low' ? 'risk-low' : opt.risk === 'medium' ? 'risk-medium' : 'risk-high';
  const riskLabel = opt.risk === 'low' ? '低风险' : opt.risk === 'medium' ? '中风险' : '高风险';
  const escapedComment = escapeHtml(opt.comment).replace(/'/g, "\\'").replace(/\n/g, '\\n');

  return `
  <div class="tab-content ${isRecommended ? 'active' : ''}" data-tab="${tabIndex}">
    <div class="reply-box ${isRecommended ? 'recommended' : ''}">
      ${isRecommended ? `
      <div class="reply-ai-indicator recommended">
        ${aiSparkleSmall}
        AI 推荐
      </div>
      ` : ''}
      <div class="reply-text">${escapeHtml(opt.comment)}</div>
      <div class="reply-meta">
        <div class="reply-info">
          <span class="reply-chars">${opt.charCount} 字符</span>
          <span class="risk-badge ${riskClass}">${riskLabel}</span>
        </div>
        <button class="btn-copy" onclick="copyText('${escapedComment}', this)">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
          复制
        </button>
      </div>
      ${opt.zh_explain ? `
      <div class="explain-section">
        <button class="explain-btn" onclick="toggleExplain(this)">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
          查看策略解释
        </button>
        <div class="explain-text">${escapeHtml(opt.zh_explain)}</div>
      </div>
      ` : ''}
    </div>
  </div>`;
}

function renderReplySection(tweet, cardIndex) {
  if (tweet.commentSkipped) {
    return `
    <div class="reply-section">
      <div class="state-box state-skip">
        <strong>已跳过：</strong>${escapeHtml(tweet.skipReason || '未知原因')}
        ${tweet.skipReasonZh ? `<br><span style="opacity: 0.8">${escapeHtml(tweet.skipReasonZh)}</span>` : ''}
      </div>
    </div>`;
  }

  if (tweet.commentError) {
    return `
    <div class="reply-section">
      <div class="state-box state-error">
        <strong>生成失败：</strong>${escapeHtml(tweet.commentError)}
      </div>
    </div>`;
  }

  if (!tweet.comments?.options?.length) {
    return `
    <div class="reply-section">
      <div class="state-box state-empty">暂无回复建议</div>
    </div>`;
  }

  const tabLabels = {
    witty: '机智风格',
    practical: '务实风格',
    subtle_product: '产品植入'
  };

  // Sort options in fixed order: witty -> practical -> subtle_product
  const angleOrder = ['witty', 'practical', 'subtle_product'];
  const sortedOptions = [...tweet.comments.options].sort((a, b) => {
    return angleOrder.indexOf(a.angle) - angleOrder.indexOf(b.angle);
  });

  // Find AI recommended option from sorted data
  // Fallback to first option if no recommendation found (for old data compatibility)
  let bestIndex = sortedOptions.findIndex(opt => opt.recommended === true);
  if (bestIndex === -1) bestIndex = 0;

  const tabs = sortedOptions.map((opt, i) => {
    const isRecommended = i === bestIndex;
    const icon = isRecommended ? aiSparkleIcon : '';
    return `<button class="tab-btn ${isRecommended ? 'active' : ''}" onclick="switchTab(${cardIndex}, ${i})">${icon} ${tabLabels[opt.angle] || opt.angle}</button>`;
  }).join('');

  const contents = sortedOptions.map((opt, i) => 
    renderReplyOption(opt, cardIndex, i, i === bestIndex)
  ).join('');

  return `
  <div class="reply-section">
    <div class="reply-header">
      <span class="reply-title">回复建议</span>
    </div>
    <div class="tabs">${tabs}</div>
    ${contents}
  </div>`;
}

function renderTweetCard(tweet, index) {
  const groupLabel = tweet.originalGroup === 'kol' ? 'reach' : tweet.group;
  const groupClass = groupLabel === 'pain' ? 'tag-pain' : 'tag-reach';
  const authorHandle = tweet.author || 'Unknown';
  const authorUrl = authorHandle.startsWith('@') 
    ? `https://x.com/${authorHandle.slice(1)}` 
    : `https://x.com/${authorHandle}`;
  const initial = authorHandle.replace('@', '').charAt(0).toUpperCase();
  
  // Product relevance tag
  const relevance = tweet.comments?.productRelevance || 'medium';
  const relevanceClass = `tag-relevance-${relevance}`;
  const relevanceLabels = { high: '高相关', medium: '中相关', low: '低相关' };
  const relevanceLabel = relevanceLabels[relevance] || relevance;
  
  // AI picked status
  const isAiPicked = tweet.aiPicked !== false; // Default to true for backward compatibility
  const cardClass = isAiPicked ? '' : 'not-ai-picked';
  const aiPickedBadge = isAiPicked ? `
    <div class="ai-picked-badge">
      ${aiSparkleSmall}
      AI 精选
    </div>
  ` : '';

  return `
  <article class="tweet-card ${cardClass}" id="card-${index}">
    <div class="card-number"># ${tweet.rank}</div>
    ${aiPickedBadge}
    <div class="tweet-header">
      <div class="tweet-author">
        <div class="author-avatar">${initial}</div>
        <div class="author-info">
          <a href="${authorUrl}" target="_blank" rel="noopener" class="author-name">${escapeHtml(authorHandle)}</a>
          <div class="author-tags">
            <span class="tag ${groupClass}">${groupLabel}</span>
            <span class="tag tag-lang">${tweet.detectedLanguage?.toUpperCase() || 'N/A'}</span>
            <span class="tag ${relevanceClass}">${relevanceLabel}</span>
          </div>
        </div>
      </div>
      <div class="tweet-score">
        <div class="score-value">${formatNumber(tweet.finalScore)}</div>
        <div class="score-label">Score</div>
      </div>
    </div>
    
    <div class="tweet-content">
      <div class="tweet-text">${escapeHtml(tweet.text || '无内容')}</div>
      ${renderTranslation(tweet)}
      
      <div class="tweet-metrics">
        <div class="metric">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          ${formatNumber(tweet.likes)}
        </div>
        <div class="metric">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.77 15.67c-.292-.293-.767-.293-1.06 0l-2.22 2.22V7.65c0-2.068-1.683-3.75-3.75-3.75h-5.85c-.414 0-.75.336-.75.75s.336.75.75.75h5.85c1.24 0 2.25 1.01 2.25 2.25v10.24l-2.22-2.22c-.293-.293-.768-.293-1.06 0s-.294.768 0 1.06l3.5 3.5c.145.147.337.22.53.22s.383-.072.53-.22l3.5-3.5c.294-.292.294-.767 0-1.06zm-10.66 3.28H7.26c-1.24 0-2.25-1.01-2.25-2.25V6.46l2.22 2.22c.148.147.34.22.532.22s.384-.073.53-.22c.293-.293.293-.768 0-1.06l-3.5-3.5c-.293-.294-.768-.294-1.06 0l-3.5 3.5c-.294.292-.294.767 0 1.06s.767.293 1.06 0l2.22-2.22V16.7c0 2.068 1.683 3.75 3.75 3.75h5.85c.414 0 .75-.336.75-.75s-.337-.75-.75-.75z"/>
          </svg>
          ${formatNumber(tweet.retweets)}
        </div>
        <div class="metric">
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.046 2.242l-4.148-.01h-.002c-4.374 0-7.8 3.427-7.8 7.802 0 4.098 3.186 7.206 7.465 7.37v3.828c0 .108.044.286.12.403.142.225.384.347.632.347.138 0 .277-.038.402-.118.264-.168 6.473-4.14 8.088-5.506 1.902-1.61 3.04-3.97 3.043-6.312v-.017c-.006-4.367-3.43-7.787-7.8-7.788zm3.787 12.972c-1.134.96-4.862 3.405-6.772 4.643V16.67c0-.414-.335-.75-.75-.75h-.396c-3.66 0-6.318-2.476-6.318-5.886 0-3.534 2.768-6.302 6.3-6.302l4.147.01h.002c3.532 0 6.3 2.766 6.302 6.296-.003 1.91-.942 3.844-2.514 5.176z"/>
          </svg>
          ${formatNumber(tweet.replies)}
        </div>
      </div>
      
      <div class="tweet-actions">
        <a href="${tweet.url}" target="_blank" rel="noopener" class="btn-view">
          查看原推文
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
        </a>
      </div>
    </div>
    
    ${renderReplySection(tweet, index)}
  </article>`;
}

function renderCards(tweets) {
  if (!tweets?.length) {
    return `
    <main class="main">
      <div class="state-box state-empty">暂无数据</div>
    </main>`;
  }

  return `
  <main class="main">
    ${tweets.map((tweet, i) => renderTweetCard(tweet, i)).join('')}
  </main>`;
}

function renderFooter() {
  return `
  <footer class="footer">
    Generated by X Radar
  </footer>`;
}

// ============ Main Export ============

export function generateHTMLReport(data) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>X Radar - ${new Date(data.runAt).toLocaleDateString('zh-CN')}</title>
  ${getStyles()}
</head>
<body>
  ${renderHeader(data)}
  ${renderStats(data)}
  ${renderCards(data.top)}
  ${renderFooter()}
  ${getScripts()}
</body>
</html>`;
}
