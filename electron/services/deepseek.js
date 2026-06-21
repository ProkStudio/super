const axios = require('axios');
const store = require('./store');

const DEFAULT_BASE = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';

function getAiConfig() {
  const settings = store.getSettings();
  const baseUrl = (settings.aiBaseUrl || DEFAULT_BASE).replace(/\/$/, '');
  const model = (settings.aiModel || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const apiKey = (store.getSecret('deepseekKey') || '').trim();
  return { baseUrl, model, apiKey };
}

function buildHeaders(apiKey, baseUrl) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (baseUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://techpro.app';
    headers['X-Title'] = 'TechPro';
  }
  return headers;
}

function providerLabel(baseUrl) {
  if (String(baseUrl || '').includes('openrouter.ai')) return 'OpenRouter';
  if (String(baseUrl || '').includes('deepseek')) return 'DeepSeek';
  return 'AI API';
}

function parseApiError(err, baseUrl = '') {
  const data = err?.response?.data;
  const code = err?.code || '';
  const raw = data?.error?.message || data?.message || data?.detail || err?.message || code || 'AI request failed';
  const provider = providerLabel(baseUrl || getAiConfig().baseUrl);

  if (/ECONNRESET|ETIMEDOUT|ECONNABORTED|socket hang up|EAI_AGAIN/i.test(`${code} ${raw}`)) {
    return `Соединение с ${provider} оборвалось (${code || 'network'}). Проверьте интернет/VPN, в Настройках → AI нажмите «Тест» или повторите через минуту.`;
  }
  if (/missing authentication/i.test(raw)) {
    return `Нет API-ключа. Настройки → API ключи → AI → вставьте ключ ${provider} и нажмите «Сохранить».`;
  }
  if (/user not found/i.test(raw)) {
    return 'Ключ OpenRouter не подходит для AI-запросов. Нужен обычный API Key: openrouter.ai/settings/keys → Create Key (не Management Keys).';
  }
  return raw;
}

function isRetryableNetworkError(err) {
  const blob = `${err?.code || ''} ${err?.message || ''}`;
  return /ECONNRESET|ETIMEDOUT|ECONNABORTED|socket hang up|EAI_AGAIN|ENOTFOUND/i.test(blob);
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function parseLines(content, count) {
  return content.split('\n').map((l) => l.replace(/^[\d\.\-\*]+\s*/, '').trim()).filter(Boolean).slice(0, count);
}

function stripMarkdownFence(text) {
  let t = String(text).trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '');
    t = t.replace(/\n?```[\s\S]*$/, '');
  }
  return t.trim();
}

function parseJsonFromAiContent(text, { expectArray = false } = {}) {
  let raw = stripMarkdownFence(text);
  if (!raw) throw new Error('Пустой ответ от AI');

  const tryParse = (candidate) => {
    const parsed = JSON.parse(candidate);
    if (expectArray && !Array.isArray(parsed)) {
      throw new Error('Invalid AI response format');
    }
    return parsed;
  };

  try {
    return tryParse(raw);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
  }

  const opener = expectArray ? '[' : '{';
  const closer = expectArray ? ']' : '}';
  const start = raw.indexOf(opener);
  if (start < 0) throw new Error('Invalid AI response format');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) {
        return tryParse(raw.slice(start, i + 1));
      }
    }
  }

  throw new Error('Invalid AI response format');
}

async function generate(prompt, { maxTokens = 500, count = 1 } = {}) {
  const { baseUrl, model, apiKey } = getAiConfig();
  if (!apiKey) {
    throw new Error('AI API ключ не задан. Настройки → API ключи → вставьте ключ и нажмите «Сохранить».');
  }

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { data } = await axios.post(`${baseUrl}/chat/completions`, {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        n: 1,
        temperature: 0.9,
      }, {
        headers: buildHeaders(apiKey, baseUrl),
        timeout: 180000,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      const content = data.choices?.[0]?.message?.content || '';
      if (count <= 1) return content.trim();
      return parseLines(content, count);
    } catch (err) {
      lastErr = err;
      if (attempt < 2 && isRetryableNetworkError(err)) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw new Error(parseApiError(err, baseUrl));
    }
  }
  throw new Error(parseApiError(lastErr, baseUrl));
}

async function testConnection() {
  const { apiKey } = getAiConfig();
  if (!apiKey) return { valid: false, error: 'No API key' };
  try {
    const reply = await generate('Reply with exactly: OK', { maxTokens: 16, count: 1 });
    return { valid: true, reply: String(reply).slice(0, 80) };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

async function generateChannelNames(topic, count, examples = []) {
  const sample = examples.length
    ? `\nExisting examples:\n${examples.slice(-5).join('\n')}\nGenerate NEW unique names in the same style.\n`
    : '';
  return generate(
    `Generate ${count} unique YouTube channel names about "${topic || 'shorts content'}".${sample} One name per line, no numbering, no quotes.`,
    { count, maxTokens: 1024 },
  );
}

async function generateChannelDescriptions(topic, count, examples = []) {
  const sample = examples.length
    ? `\nExamples:\n${examples.slice(-3).join('\n')}\n`
    : '';
  return generate(
    `Generate ${count} unique YouTube channel descriptions (1-2 sentences each) about "${topic || 'shorts'}".${sample} One per line.`,
    { count, maxTokens: 1500 },
  );
}

async function generateVideoTitles(examples, count) {
  const sample = examples.length
    ? `\nExisting titles:\n${examples.slice(-8).join('\n')}\nCreate ${count} NEW unique titles in the same language and style.\n`
    : '';
  return generate(
    `Generate ${count} catchy YouTube Shorts video titles.${sample} One title per line, no numbering.`,
    { count, maxTokens: 1500 },
  );
}

async function generateVideoTags(title, count = 10) {
  const result = await generate(
    `Generate ${count} YouTube tags for a Shorts video titled "${title}". Comma-separated, no hashtags.`,
    { maxTokens: 200 },
  );
  return typeof result === 'string' ? result.split(',').map((t) => t.trim()).filter(Boolean) : result;
}

async function generateOverlayPairs(count, examples = []) {
  const sample = examples.length
    ? `\nExamples:\n${JSON.stringify(examples.slice(-3))}\n`
    : '';
  const raw = await generate(
    `Generate ${count} pairs of short Russian joke overlay texts for video.${sample} Reply ONLY with a JSON array, no markdown and no text before or after: [{"top":"...","bottom":"..."}]`,
    { maxTokens: 2048 },
  );
  const parsed = parseJsonFromAiContent(raw, { expectArray: true });
  return parsed.map((item) => ({
    top: item.top || '',
    bottom: item.bottom || '',
  })).filter((p) => p.top || p.bottom);
}

module.exports = {
  generate,
  testConnection,
  generateChannelNames,
  generateChannelDescriptions,
  generateVideoTitles,
  generateVideoTags,
  generateOverlayPairs,
};
