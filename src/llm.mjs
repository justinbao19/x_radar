import { extractJSON } from './utils.mjs';

function isPlaceholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === '-' || normalized === 'null' || normalized === 'undefined' || normalized === 'placeholder';
}

function resolveModel(apiUrl, model) {
  const normalized = String(model || '').trim().toLowerCase();
  if (apiUrl.includes('llm-proxy.tapsvc.com') && (normalized === 'sonnet-4.6' || normalized === 'sonnet 4.6')) {
    return 'claude-sonnet-4-6';
  }
  return model;
}

function buildRequest(systemPrompt, userPrompt, { apiUrl, apiKey, model, maxTokens = 2000 }) {
  const resolvedModel = resolveModel(apiUrl, model);
  const isAnthropicAPI = apiUrl.includes('/v1/messages') || apiUrl.includes('anthropic');
  const headers = {
    'Content-Type': 'application/json'
  };
  let body;

  if (isAnthropicAPI) {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: resolvedModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    };
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
    body = {
      model: resolvedModel,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
  }

  return { headers, body };
}

export function llmConfigured() {
  return !isPlaceholder(process.env.LLM_API_KEY);
}

export async function callLLMText(systemPrompt, userPrompt, options = {}) {
  const apiUrl = isPlaceholder(process.env.LLM_API_URL)
    ? 'https://llm-proxy.tapsvc.com/v1/chat/completions'
    : process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = isPlaceholder(process.env.LLM_MODEL)
    ? 'claude-sonnet-4-6'
    : process.env.LLM_MODEL;

  if (isPlaceholder(apiKey)) {
    throw new Error('LLM_API_KEY not set');
  }

  const { headers, body } = buildRequest(systemPrompt, userPrompt, {
    apiUrl,
    apiKey,
    model,
    maxTokens: options.maxTokens || 2000
  });

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content in LLM response');
  }
  return content.trim();
}

export async function callLLMJson(systemPrompt, userPrompt, options = {}) {
  const text = await callLLMText(systemPrompt, userPrompt, options);
  const json = extractJSON(text);
  if (!json) {
    throw new Error('Failed to extract JSON from LLM response');
  }
  return json;
}
