import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { callLLMJson, llmConfigured } from './llm.mjs';
import { FILOMAIL_OPPORTUNITY_BRIEF, QUERY_PLANNER_GUIDE } from './filomail-context.mjs';
import { ensureOutputDirs, getOutputPath, copyToLatest, getOutputDir, log } from './utils.mjs';

const MANIFEST_FILE = join('web', 'public', 'data', 'manifest.json');
const DATA_DIR = join('web', 'public', 'data');
const LOOKBACK_FILES = 12;
const OUT_DIR = 'out';

const DEFAULT_GROUP_LIMITS = {
  pain: 4,
  insight: 3,
  reach: 3,
  sentiment: 4,
  kol: 4
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadRecentRadarFiles(limit = LOOKBACK_FILES) {
  if (!existsSync(MANIFEST_FILE)) return [];
  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_FILE, 'utf-8'));
    return (manifest.files || []).slice(0, limit).map((entry) => join(DATA_DIR, entry.filename));
  } catch (error) {
    log('WARN', 'Failed to load manifest for query planner history', { error: error.message });
    return [];
  }
}

function loadRecentEnrichedFiles(limit = LOOKBACK_FILES) {
  if (!existsSync(OUT_DIR)) return [];
  try {
    return readdirSync(OUT_DIR)
      .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, limit)
      .map((entry) => join(OUT_DIR, entry, 'candidates_enriched.json'))
      .filter((file) => existsSync(file));
  } catch (error) {
    log('WARN', 'Failed to scan local enriched candidate history', { error: error.message });
    return [];
  }
}

function loadHistoricalOutcomes() {
  const stats = new Map();
  const seenFiles = new Set();
  const files = [...loadRecentEnrichedFiles(), ...loadRecentRadarFiles()].filter((file) => {
    if (seenFiles.has(file)) return false;
    seenFiles.add(file);
    return true;
  });

  for (const file of files) {
    if (!existsSync(file)) continue;
    try {
      const data = JSON.parse(readFileSync(file, 'utf-8'));
      if (Array.isArray(data.items)) {
        for (const tweet of data.items) {
          const key = tweet.sourceQuery;
          if (!key) continue;
          const current = stats.get(key) || {
            appearances: 0,
            replyNow: 0,
            watchOnly: 0,
            discard: 0,
            aiPicked: 0
          };
          current.appearances += 1;
          if (tweet.triageDecision === 'reply_now') current.replyNow += 1;
          if (tweet.triageDecision === 'watch_only') current.watchOnly += 1;
          if (tweet.triageDecision === 'discard') current.discard += 1;
          if (tweet.triageDecision === 'reply_now' || tweet.aiPicked !== false) current.aiPicked += 1;
          stats.set(key, current);
        }
        continue;
      }

      for (const tweet of data.top || []) {
        const key = tweet.sourceQuery;
        if (!key) continue;
        const current = stats.get(key) || {
          appearances: 0,
          replyNow: 0,
          watchOnly: 0,
          discard: 0,
          aiPicked: 0
        };
        current.appearances += 1;
        if (tweet.triageDecision === 'reply_now') current.replyNow += 1;
        if (tweet.triageDecision === 'watch_only') current.watchOnly += 1;
        if (tweet.triageDecision === 'discard') current.discard += 1;
        if (tweet.aiPicked !== false) current.aiPicked += 1;
        stats.set(key, current);
      }
      for (const tweet of data.watch || []) {
        const key = tweet.sourceQuery;
        if (!key) continue;
        const current = stats.get(key) || {
          appearances: 0,
          replyNow: 0,
          watchOnly: 0,
          discard: 0,
          aiPicked: 0
        };
        current.appearances += 1;
        current.watchOnly += 1;
        stats.set(key, current);
      }
    } catch (error) {
      log('DEBUG', 'Skipping unreadable historical radar file', { file, error: error.message });
    }
  }

  return stats;
}

function flattenQueries(catalog) {
  const rows = [];
  for (const [group, entries] of Object.entries(catalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      rows.push({
        group,
        name: entry.name,
        query: entry.query,
        max: entry.max || 20,
        intentType: entry.intent_type || 'reply_opportunity',
        strictness: entry.strictness || 'medium',
        enabled: entry.enabled !== false,
        language: entry.language || 'multi',
        priority: entry.priority || 50
      });
    }
  }
  return rows;
}

function summarizeHistoryForPrompt(historyMap, rows) {
  return rows.map((row) => {
    const history = historyMap.get(row.name);
    return {
      name: row.name,
      group: row.group,
      intentType: row.intentType,
      strictness: row.strictness,
      language: row.language,
      priority: row.priority,
      appearances: history?.appearances || 0,
      replyNow: history?.replyNow || 0,
      watchOnly: history?.watchOnly || 0,
      aiPicked: history?.aiPicked || 0
    };
  });
}

function computeHeuristicScore(row, historyMap) {
  const history = historyMap.get(row.name);
  const historyAppearances = history?.appearances || 0;
  const replyYield = historyAppearances ? (history.replyNow || 0) / historyAppearances : 0;
  const aiPickedYield = historyAppearances ? (history.aiPicked || 0) / historyAppearances : 0;
  const strictnessBonus = row.strictness === 'high' ? 18 : row.strictness === 'medium' ? 8 : 0;
  const intentBonus =
    row.intentType === 'reply_opportunity' ? 20 :
    row.intentType === 'competitor_displacement' ? 16 :
    row.intentType === 'feature_request' ? 12 :
    row.intentType === 'brand_sentiment' ? 10 : 0;
  const historyBonus = historyAppearances === 0 ? 6 : Math.round(replyYield * 40 + aiPickedYield * 12);
  return row.priority + strictnessBonus + intentBonus + historyBonus;
}

function heuristicPlan(catalog) {
  const rows = flattenQueries(catalog).filter((row) => row.enabled);
  const historyMap = loadHistoricalOutcomes();
  const selected = [];

  for (const [group, limit] of Object.entries(DEFAULT_GROUP_LIMITS)) {
    const topRows = rows
      .filter((row) => row.group === group)
      .map((row) => ({
        ...row,
        heuristicScore: computeHeuristicScore(row, historyMap)
      }))
      .sort((a, b) => b.heuristicScore - a.heuristicScore)
      .slice(0, limit)
      .map((row, index) => ({
        name: row.name,
        group: row.group,
        query: row.query,
        max: row.max,
        intentType: row.intentType,
        strictness: row.strictness,
        language: row.language,
        priority: row.priority,
        enabled: true,
        plannerReason: index === 0
          ? 'heuristic_top_choice'
          : 'heuristic_high_precision_backfill'
      }));
    selected.push(...topRows);
  }

  return {
    mode: 'heuristic',
    generatedAt: new Date().toISOString(),
    notes: 'Fallback high-precision query plan selected without LLM assistance.',
    selectedQueries: selected,
    historySummary: summarizeHistoryForPrompt(historyMap, rows)
  };
}

async function llmPlan(catalog) {
  const rows = flattenQueries(catalog).filter((row) => row.enabled);
  const historyMap = loadHistoricalOutcomes();
  const promptData = summarizeHistoryForPrompt(historyMap, rows);
  const groupLimits = DEFAULT_GROUP_LIMITS;

  const systemPrompt = `${FILOMAIL_OPPORTUNITY_BRIEF}\n\n${QUERY_PLANNER_GUIDE}\n\nYou are planning high-precision X search queries for a Twitter/X radar pipeline. Return strict JSON only.`;
  const userPrompt = `Given the candidate query catalog and historical outcomes below, choose the best high-precision query set for the next run.

Rules:
- Do not invent brand new queries.
- Only choose from the provided catalog.
- Prefer precision over recall.
- Keep roughly these per-group limits: ${JSON.stringify(groupLimits)}.
- Mark low-quality queries as disabled if they look too broad.

Return JSON:
{
  "notes": "short string",
  "selectedQueries": [
    {
      "name": "catalog name",
      "enabled": true,
      "plannerReason": "short reason",
      "strictness": "high|medium|low",
      "priority": 0
    }
  ],
  "disabledQueries": [
    {
      "name": "catalog name",
      "reason": "short reason"
    }
  ]
}

Catalog:
${JSON.stringify(promptData, null, 2)}`;

  const json = await callLLMJson(systemPrompt, userPrompt, { maxTokens: 2500 });
  const selectedByName = new Map((json.selectedQueries || []).map((row) => [row.name, row]));

  const selectedQueries = rows
    .filter((row) => selectedByName.has(row.name))
    .map((row) => {
      const override = selectedByName.get(row.name);
      return {
        ...row,
        strictness: override.strictness || row.strictness,
        priority: clamp(Number(override.priority || row.priority), 1, 100),
        plannerReason: override.plannerReason || 'llm_selected',
        enabled: override.enabled !== false
      };
    })
    .sort((a, b) => b.priority - a.priority);

  if (!selectedQueries.length) {
    throw new Error('LLM planner returned no selected queries');
  }

  return {
    mode: 'llm',
    generatedAt: new Date().toISOString(),
    notes: json.notes || 'LLM-selected high-precision query plan.',
    selectedQueries,
    disabledQueries: json.disabledQueries || [],
    historySummary: promptData
  };
}

export async function planQueries(catalog) {
  if (llmConfigured()) {
    try {
      return await llmPlan(catalog);
    } catch (error) {
      log('WARN', 'LLM query planner failed, falling back to heuristic planner', { error: error.message });
    }
  }
  return heuristicPlan(catalog);
}

export function persistPlannerArtifact(plan, runDate) {
  ensureOutputDirs(runDate);
  const outputPath = getOutputPath('planner.json', runDate);
  writeFileSync(outputPath, JSON.stringify(plan, null, 2));
  copyToLatest(getOutputDir(runDate));
  return outputPath;
}
