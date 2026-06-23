const axios = require('axios');
const store = require('./store');

const DEFAULT_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'meta-llama/llama-3.2-3b-instruct:free';

const SERVICE_OFFER_RE = /научу|обучу|обуча|дам\s+схем|скину\s+схем|кидайте?\s+юз|кидай\s+юз|пиши\s+в\s+лс|пишите\s+в\s+лс|\bв\s+лс\b|напиши\s+мне|мой\s+тг|телеграм|telegram|раскруч|продам|продаю|услуг|консульт|заработ|зарабатыв|схем|курс\b|ментор|арбитраж/i;

function applyHomoglyphs(text) {
  return String(text || '').replace(/[оОаАуУеЕ]/g, (ch) => ({
    о: 'o', О: 'O', а: 'a', А: 'A', у: 'y', У: 'Y', е: 'e', Е: 'E',
  }[ch] || ch));
}

function parentOffersService(text) {
  const blob = String(text || '').replace(/\s+/g, ' ').trim();
  if (!blob) return false;
  return SERVICE_OFFER_RE.test(blob);
}

function humanizeTiktokComment(text) {
  return String(text || '')
    .trim()
    .replace(/^(ответ|reply|comment)\s*:\s*/i, '')
    .replace(/[—–‐‑‒−\-]+/g, ' ')
    .replace(/[,;:]/g, ' ')
    .replace(/[«»"'`]/g, '')
    .replace(/\.{2,}/g, ' ')
    .replace(/\.$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const META_LEAK_RE = /the user|constraints|tiktok style|comment reply|you are a|as an ai|language model|верни только|правила:|стиль \(обязательно\)|single tiktok|age 18|conversational/i;

function isValidTiktokComment(text) {
  const t = String(text || '').trim();
  if (t.length < 8 || t.length > 160) return false;
  if (META_LEAK_RE.test(t)) return false;
  const cyrillic = (t.match(/[а-яёА-ЯЁ]/g) || []).length;
  if (cyrillic < 8) return false;
  if ((t.match(/\b[a-zA-Z]{4,}\b/g) || []).length >= 2) return false;
  return true;
}

function buildTiktokAiMessages(parentText, caption, serviceTemplate, { strict = false } = {}) {
  const system = [
    'Пиши ТОЛЬКО текст комментария TikTok на русском языке.',
    'Никакого английского. Никаких пояснений, списков и пересказа задания.',
  ].join(' ');
  const parent = String(parentText || '').trim().slice(0, 400) || 'привет всем';
  const cap = String(caption || '').trim().slice(0, 300) || 'видео про деньги';
  const offer = String(serviceTemplate || '').trim().slice(0, 500) || 'ютуб Спредофил';
  const extra = strict
    ? '\n\nВажно: одна строка на русском. Без слов The user, Constraints, Reply, English.'
    : '';
  const user = [
    `Коммент под видео: ${parent}`,
    `О чём видео: ${cap}`,
    `Вплети смысл оффера: ${offer}`,
    '',
    'Стиль: как обычный юзер TikTok 18-25 ща норм кста типа без запятых и без тире',
    '',
    'Пример ответа:',
    'ага норм тема кста глянь в ютубе Спредофил за пару вечеров реально выйти можно',
    '',
    `Твой ответ одной строкой:${extra}`,
  ].join('\n');
  return { system, user };
}

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

async function chatCompletion(messages, { maxTokens = 500, temperature = 0.88 } = {}) {
  const { baseUrl, model, apiKey } = getAiConfig();
  if (!apiKey) {
    throw new Error('AI API ключ не задан. Настройки → API ключи → вставьте ключ и нажмите «Сохранить».');
  }

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { data } = await axios.post(`${baseUrl}/chat/completions`, {
        model,
        messages,
        max_tokens: maxTokens,
        n: 1,
        temperature,
      }, {
        headers: buildHeaders(apiKey, baseUrl),
        timeout: 180000,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      return (data.choices?.[0]?.message?.content || '').trim();
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

async function generate(prompt, { maxTokens = 500, count = 1 } = {}) {
  const content = await chatCompletion([{ role: 'user', content: prompt }], { maxTokens, temperature: 0.9 });
  if (count <= 1) return content;
  return parseLines(content, count);
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

async function generateTiktokCommentReply({ parentText = '', caption = '', serviceTemplate = '' } = {}) {
  if (parentOffersService(parentText)) {
    return { ok: true, skipped: true, reason: 'competitor', reply: '' };
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { system, user } = buildTiktokAiMessages(parentText, caption, serviceTemplate, {
      strict: attempt > 0,
    });
    const raw = await chatCompletion(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      { maxTokens: 160, temperature: attempt === 0 ? 0.92 : 0.75 },
    );
    const cleaned = humanizeTiktokComment(
      String(raw || '').replace(/^["«]|["»]$/g, '').trim().slice(0, 150),
    );
    if (cleaned && isValidTiktokComment(cleaned)) {
      return {
        ok: true,
        skipped: false,
        reply: applyHomoglyphs(cleaned),
        raw: cleaned,
      };
    }
  }
  return { ok: false, error: 'Модель вернула не комментарий (попробуйте другую модель в настройках AI)' };
}

async function testTiktokComment(opts = {}) {
  try {
    const result = await generateTiktokCommentReply(opts);
    if (!result.ok) return { valid: false, error: result.error };
    if (result.skipped) {
      return {
        valid: true,
        skipped: true,
        reason: result.reason,
        reply: '',
        message: 'Пропуск: автор уже предлагает услугу',
      };
    }
    return { valid: true, reply: result.reply, raw: result.raw };
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
  chatCompletion,
  testConnection,
  testTiktokComment,
  generateTiktokCommentReply,
  applyHomoglyphs,
  parentOffersService,
  generateChannelNames,
  generateChannelDescriptions,
  generateVideoTitles,
  generateVideoTags,
  generateOverlayPairs,
};
