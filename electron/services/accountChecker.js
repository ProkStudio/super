const store = require('./store');

const browserProfiles = require('./browserProfiles');

const pythonRunner = require('./pythonRunner');



function resolveProfileId(account, profilesData) {

  if (account.profileId) return account.profileId;

  const meta = profilesData?.meta || {};

  for (const [profileId, m] of Object.entries(meta)) {

    if (m?.linkedAccountId === account.id) return profileId;

  }

  return null;

}



function collectAccounts(accountsData, { accountIds, blockId } = {}) {

  const all = [];

  for (const block of accountsData.blocks || []) {

    if (blockId && block.id !== blockId) continue;

    for (const acc of block.accounts || []) {

      if (accountIds?.length && !accountIds.includes(acc.id)) continue;

      all.push({ ...acc, blockId: block.id });

    }

  }

  return all;

}



function clampThreads(value) {

  const n = Number(value);

  if (!Number.isFinite(n)) return 2;

  return Math.max(1, Math.min(20, Math.round(n)));

}



async function openSession(account, profileId, send) {

  send?.('accounts:checkProgress', {

    login: account.login,

    text: `Открываю профиль для ${account.login}…`,

  });

  const browserType = store.getSettings().browserProvider || 'mostlogin';
  const data = await browserProfiles.openBrowser(profileId, browserType);

  const cdpUrl = data.http || data.cdpUrl || data.ws;

  if (!cdpUrl) throw new Error('Браузер не вернул CDP URL');

  return {

    profileId,

    cdpUrl,

    accountId: account.id,

    login: account.login,

  };

}



async function runBatch(batch, send, batchIndex, totalBatches, doneBefore, totalCheckable) {

  const sessions = [];

  const openedProfiles = [];

  const errors = [];



  await Promise.all(batch.map(async ({ account, profileId }) => {

    try {

      const session = await openSession(account, profileId, send);

      sessions.push(session);

      openedProfiles.push(profileId);

    } catch (e) {

      errors.push({

        accountId: account.id,

        profileId,

        login: account.login,

        status: 'error',

        message: browserProfiles.connector(store.getSettings().browserProvider || 'mostlogin').extractError?.(e) || e.message,

      });

    }

  }));



  let scriptResults = [];

  if (sessions.length) {

    try {

      send?.('accounts:checkProgress', {

        text: `Проверка пакета ${batchIndex}/${totalBatches} (${sessions.length} профилей)…`,

        percent: totalCheckable

          ? Math.round((doneBefore / totalCheckable) * 100)

          : 0,

      });

      const runResult = await pythonRunner.runScript(

        'check_account.py',

        { accounts: batch.map((b) => b.account), sessions },

        (p) => {

          const base = totalCheckable ? (doneBefore / totalCheckable) * 100 : 0;

          const slice = totalCheckable ? (100 / totalCheckable) * sessions.length : 100;

          const inner = typeof p?.percent === 'number' ? (p.percent / 100) * slice : slice * 0.5;

          send?.('accounts:checkProgress', {

            ...p,

            percent: Math.min(99, Math.round(base + inner)),

          });

        },

        (msg) => send?.('accounts:checkLog', typeof msg === 'string' ? { text: msg } : msg),

      );

      scriptResults = runResult?.results || [];

    } finally {

      const browserType = store.getSettings().browserProvider || 'mostlogin';
      await Promise.all(openedProfiles.map(async (profileId) => {
        try {
          await browserProfiles.closeBrowser(profileId, browserType);
        } catch { /* ignore */ }
      }));

    }

  }



  return [...errors, ...scriptResults];

}



async function checkAccounts({ accountIds, blockId, threads } = {}, send) {

  const accountsData = store.getAccounts();

  const profilesData = store.getProfiles();

  const targets = collectAccounts(accountsData, { accountIds, blockId });

  const concurrency = clampThreads(threads);



  if (!targets.length) {

    return { ok: false, error: 'Нет аккаунтов для проверки' };

  }



  const noProfile = [];

  const checkable = [];



  for (const account of targets) {

    const profileId = resolveProfileId(account, profilesData);

    if (!profileId) {

      noProfile.push({

        accountId: account.id,

        login: account.login,

        status: 'no_profile',

        message: 'Привяжите профиль MostLogin на странице Профили',

      });

      continue;

    }

    checkable.push({ account, profileId });

  }



  const allResults = [...noProfile];

  const totalCheckable = checkable.length;

  const totalBatches = Math.max(1, Math.ceil(totalCheckable / concurrency));



  send?.('accounts:checkProgress', {

    text: `Проверка ${totalCheckable} аккаунтов, потоков: ${concurrency}`,

    percent: 0,

  });



  for (let i = 0; i < checkable.length; i += concurrency) {

    const batch = checkable.slice(i, i + concurrency);

    const batchIndex = Math.floor(i / concurrency) + 1;

    const batchResults = await runBatch(batch, send, batchIndex, totalBatches, i, totalCheckable);

    allResults.push(...batchResults);



    send?.('accounts:checkProgress', {

      text: `Готово ${Math.min(i + batch.length, totalCheckable)}/${totalCheckable}`,

      percent: totalCheckable

        ? Math.round((Math.min(i + batch.length, totalCheckable) / totalCheckable) * 100)

        : 100,

    });

  }



  const resultMap = new Map(allResults.map((r) => [r.accountId, r]));

  const now = new Date().toISOString();



  const nextAccounts = {

    ...accountsData,

    blocks: accountsData.blocks.map((block) => ({

      ...block,

      accounts: block.accounts.map((acc) => {

        const hit = resultMap.get(acc.id);

        if (!hit) return acc;

        return {

          ...acc,

          status: hit.status,

          statusMessage: hit.message,

          lastCheckedAt: now,

          profileId: hit.profileId || acc.profileId || resolveProfileId(acc, profilesData),

        };

      }),

    })),

  };

  store.setAccounts(nextAccounts);



  const profiles = store.getProfiles();

  const meta = { ...profiles.meta };

  for (const r of allResults) {

    if (r.profileId && r.status === 'banned') {

      meta[r.profileId] = { ...meta[r.profileId], status: 'ban' };

    } else if (r.profileId && r.status === 'active') {

      const cur = meta[r.profileId]?.status;

      if (cur === 'ban' || cur === 'none') {

        meta[r.profileId] = { ...meta[r.profileId], status: 'uploaded' };

      }

    }

  }

  store.setProfiles({ ...profiles, meta });



  send?.('accounts:checkProgress', { text: 'Готово', percent: 100 });



  return { ok: true, results: allResults, accounts: nextAccounts };

}



module.exports = { checkAccounts, resolveProfileId, clampThreads };

