const browserProfiles = require('./browserProfiles');
const pythonRunner = require('./pythonRunner');
const { generateTotp, isTotpSecret } = require('./totp');
const store = require('./store');

function resolveProfileId(account, profilesData) {
  if (account?.profileId) return account.profileId;
  const meta = profilesData?.meta || {};
  for (const [profileId, m] of Object.entries(meta)) {
    if (m?.linkedAccountId === account.id) return profileId;
  }
  return null;
}

async function autofillTotp({ profileId, secret, accountId }, send) {
  if (!profileId) {
    return { ok: false, error: 'Профиль не привязан к аккаунту. Привяжите на странице Профили.' };
  }
  if (!secret || !isTotpSecret(secret)) {
    return { ok: false, error: 'Укажите секрет 2FA (base32 ключ из Google Authenticator), а не готовый 6-значный код' };
  }

  const browserType = store.getSettings().browserProvider || 'mostlogin';
  const totp = generateTotp(secret);
  send?.('totp:log', { text: `Код: ${totp.code} (${totp.remaining}с)` });

  let openedHere = false;
  try {
    const data = await browserProfiles.openBrowser(profileId, browserType);
    const cdpUrl = data.http || data.cdpUrl || data.ws;
    if (!cdpUrl) throw new Error('Браузер не вернул CDP URL');
    openedHere = true;

    const runResult = await pythonRunner.runScript(
      'fill_totp.py',
      { cdpUrl, secret, code: totp.code, accountId },
      (p) => send?.('totp:progress', p),
      (msg) => send?.('totp:log', typeof msg === 'string' ? { text: msg } : msg),
    );

    return {
      ok: Boolean(runResult?.ok),
      code: runResult?.code || totp.code,
      message: runResult?.message || runResult?.error,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    if (openedHere) {
      try {
        await browserProfiles.closeBrowser(profileId, browserType);
      } catch {
        /* browser may stay open if user needs it */
      }
    }
  }
}

function findAccount(accountId) {
  if (!accountId) return null;
  const data = store.getAccounts();
  for (const block of data.blocks || []) {
    for (const acc of block.accounts || []) {
      if (acc.id === accountId) return acc;
    }
  }
  return null;
}

async function autofillTotpForAccount(accountId, send) {
  const account = findAccount(accountId);
  if (!account) return { ok: false, error: 'Аккаунт не найден' };
  const profiles = store.getProfiles();
  const profileId = resolveProfileId(account, profiles);
  return autofillTotp({
    profileId,
    secret: account.totp,
    accountId: account.id,
  }, send);
}

module.exports = { autofillTotp, autofillTotpForAccount, resolveProfileId };
