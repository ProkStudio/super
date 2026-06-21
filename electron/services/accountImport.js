const EMAIL_RE = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/;
const TOTP_RE = /^[A-Z2-7]{14,52}$/i;
const URL_RE = /^https?:\/\//i;

function isTotpToken(token) {
  return token && TOTP_RE.test(token.replace(/\s/g, ''));
}

function tokenizeRest(text) {
  return text.split(/[:;|,\t\s]+/).map((s) => s.trim()).filter(Boolean);
}

function parseAccountLine(line, index, idPrefix = 'acc') {
  const trimmed = (line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return { skip: true };
  }

  const emailMatch = trimmed.match(EMAIL_RE);
  if (!emailMatch) {
    return { skip: true, reason: 'no_email' };
  }

  const email = emailMatch[0].toLowerCase();
  const afterEmail = trimmed.slice(trimmed.indexOf(emailMatch[0]) + emailMatch[0].length);
  const tokens = tokenizeRest(afterEmail).filter((t) => !URL_RE.test(t));

  let password = '';
  let totp = '';

  for (const token of tokens) {
    const clean = token.replace(/\s/g, '');
    if (isTotpToken(clean)) {
      if (!totp) totp = clean.toUpperCase();
      continue;
    }
    if (!password) {
      password = token;
    }
  }

  if (!password) {
    const parts = trimmed.split(/[,;\t|]/).map((s) => s.trim()).filter(Boolean);
    const emailIdx = parts.findIndex((p) => EMAIL_RE.test(p));
    if (emailIdx >= 0) {
      const restParts = parts.slice(emailIdx + 1);
      for (const part of restParts) {
        const clean = part.replace(/\s/g, '');
        if (isTotpToken(clean)) {
          if (!totp) totp = clean.toUpperCase();
        } else if (!password && !URL_RE.test(part)) {
          password = part;
        }
      }
    }
  }

  if (!password) {
    return { skip: true, reason: 'no_password' };
  }

  return {
    account: {
      id: `${idPrefix}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      login: email,
      password,
      totp,
      ready: false,
      status: 'unknown',
    },
  };
}

function parseAccountText(text) {
  const lines = (text || '').split(/\r?\n/);
  const accounts = [];
  let skipped = 0;
  const idPrefix = `acc-${Date.now()}`;

  lines.forEach((line, i) => {
    const result = parseAccountLine(line, i, idPrefix);
    if (result.skip) {
      if (line.trim()) skipped += 1;
    } else if (result.account) {
      accounts.push(result.account);
    }
  });

  return { accounts, skipped, imported: accounts.length };
}

function buildExportRows(accountsData, { blockId, maskSecrets = true } = {}) {
  const rows = [];
  for (const block of accountsData.blocks || []) {
    if (blockId && blockId !== 'all' && block.id !== blockId) continue;
    for (const acc of block.accounts || []) {
      rows.push({
        Email: acc.login || '',
        Password: maskSecrets ? '***' : (acc.password || ''),
        TOTP: maskSecrets ? (acc.totp ? '***' : '') : (acc.totp || ''),
        Status: acc.status || 'unknown',
        Block: block.name || '',
        Ready: acc.ready ? 'yes' : 'no',
      });
    }
  }
  return rows;
}

module.exports = {
  EMAIL_RE,
  TOTP_RE,
  parseAccountLine,
  parseAccountText,
  buildExportRows,
};
