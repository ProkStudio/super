const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('nexusAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (partial) => ipcRenderer.invoke('settings:update', partial),
  setSecret: (key, value) => ipcRenderer.invoke('settings:setSecret', { key, value }),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  validateYoutube: () => ipcRenderer.invoke('settings:validateYoutube'),
  testAi: () => ipcRenderer.invoke('settings:testAi'),
  testTiktokComment: (opts) => ipcRenderer.invoke('settings:testTiktokComment', opts),

  getSystemStatus: () => ipcRenderer.invoke('system:status'),

  testMostlogin: () => ipcRenderer.invoke('mostlogin:test'),
  listProfiles: (browserType) => ipcRenderer.invoke('browser:listProfiles', { browserType }),
  openProfile: (id, browserType) => ipcRenderer.invoke('browser:open', { profileId: id, browserType }),
  closeProfile: (id, browserType) => ipcRenderer.invoke('browser:close', { profileId: id, browserType }),
  deleteProfiles: (ids, browserType) => ipcRenderer.invoke('browser:delete', { profileIds: ids, browserType }),
  createProfilesBulk: (opts) => ipcRenderer.invoke('browser:createBulk', opts),
  cancelCreateProfiles: () => ipcRenderer.invoke('mostlogin:cancelCreate'),
  replaceProxies: (opts) => ipcRenderer.invoke('mostlogin:replaceProxies', opts),
  assignProxies: (opts) => ipcRenderer.invoke('browser:assignProxies', opts),
  listFolders: (browserType) => ipcRenderer.invoke('browser:listFolders', { browserType }),
  createFolder: (payload, browserType) => ipcRenderer.invoke('browser:createFolder', { payload, browserType }),
  moveProfilesToFolder: (opts) => ipcRenderer.invoke('browser:moveToFolder', opts),

  testBrowser: (browserType) => ipcRenderer.invoke('browser:test', { browserType }),
  getAutomationStatus: () => ipcRenderer.invoke('automation:status'),
  getAutomationLogs: (limit) => ipcRenderer.invoke('automation:logs', limit),
  collectStatsNow: () => ipcRenderer.invoke('stats:collectNow'),

  getProfilesMeta: () => ipcRenderer.invoke('profiles:get'),
  setProfilesMeta: (data) => ipcRenderer.invoke('profiles:set', data),
  updateProfileSelection: (selectedIds) => ipcRenderer.invoke('profiles:updateSelection', { selectedIds }),
  updateProfileStatus: (opts) => ipcRenderer.invoke('profiles:updateStatus', opts),
  linkProfileAccount: (opts) => ipcRenderer.invoke('profiles:linkAccount', opts),
  getDeadProxies: () => ipcRenderer.invoke('profiles:deadProxies'),
  setDeadProxies: (list) => ipcRenderer.invoke('profiles:setDeadProxies', list),
  getDeadProxyProfiles: () => ipcRenderer.invoke('profiles:getDeadProxyProfiles'),
  replaceDeadProxies: (opts) => ipcRenderer.invoke('profiles:replaceDeadProxies', opts),
  replaceBanProfiles: (opts) => ipcRenderer.invoke('profiles:replaceBans', opts),
  onProfilesReplaceProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('profiles:replaceProgress', h);
    return () => ipcRenderer.removeListener('profiles:replaceProgress', h);
  },

  fetchSpaceProxies: (count, opts) => ipcRenderer.invoke('spaceproxy:fetch', count, opts || {}),
  parseProxyFile: () => ipcRenderer.invoke('spaceproxy:parseFile'),

  getAccounts: () => ipcRenderer.invoke('accounts:get'),
  setAccounts: (data) => ipcRenderer.invoke('accounts:set', data),
  parseAccountsImport: (text) => ipcRenderer.invoke('accounts:parseImport', text),
  exportAccountsCsv: (opts) => ipcRenderer.invoke('accounts:exportCsv', opts),
  checkAccounts: (opts) => ipcRenderer.invoke('accounts:check', opts),
  generateTotp: (secret) => ipcRenderer.invoke('totp:generate', secret),
  autofillTotp: (accountId) => ipcRenderer.invoke('totp:autofill', { accountId }),
  onAccountsCheckProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('accounts:checkProgress', h);
    return () => ipcRenderer.removeListener('accounts:checkProgress', h);
  },
  onAccountsCheckLog: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('accounts:checkLog', h);
    return () => ipcRenderer.removeListener('accounts:checkLog', h);
  },
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:copy', text),

  getAutomationPresets: () => ipcRenderer.invoke('automation:presets'),
  saveAutomationPreset: (p) => ipcRenderer.invoke('automation:savePreset', p),
  deleteAutomationPreset: (id) => ipcRenderer.invoke('automation:deletePreset', id),
  getAutomationDraft: (module) => ipcRenderer.invoke('automation:draft:get', { module }),
  updateAutomationDraft: (module, partial) => ipcRenderer.invoke('automation:draft:update', { module, partial }),
  runAutomation: (opts) => ipcRenderer.invoke('automation:run', opts),
  debugStudioDom: (opts) => ipcRenderer.invoke('automation:debugStudio', opts),
  cancelAutomation: () => ipcRenderer.invoke('automation:cancel'),
  onAutomationProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('automation:progress', h);
    return () => ipcRenderer.removeListener('automation:progress', h);
  },
  onAutomationLog: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('automation:log', h);
    return () => ipcRenderer.removeListener('automation:log', h);
  },
  onProfilesCreateProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('profiles:createProgress', h);
    return () => ipcRenderer.removeListener('profiles:createProgress', h);
  },

  getTasks: () => ipcRenderer.invoke('tasks:get'),
  setTasks: (data) => ipcRenderer.invoke('tasks:set', data),
  runTask: (taskId) => ipcRenderer.invoke('tasks:run', taskId),
  onTasksStatus: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('tasks:status', h);
    return () => ipcRenderer.removeListener('tasks:status', h);
  },
  onTasksLog: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('tasks:log', h);
    return () => ipcRenderer.removeListener('tasks:log', h);
  },

  generateJokes: (config) => ipcRenderer.invoke('jokes:generate', config),
  onJokesProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('jokes:progress', h);
    return () => ipcRenderer.removeListener('jokes:progress', h);
  },
  onJokesLog: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('jokes:log', h);
    return () => ipcRenderer.removeListener('jokes:log', h);
  },

  runUniqueizer: (opts) => ipcRenderer.invoke('uniqueizer:process', opts),
  cancelUniqueizer: () => ipcRenderer.invoke('uniqueizer:cancel'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  selectUniqueizerVideo: () => ipcRenderer.invoke('uniqueizer:openVideo'),
  selectUniqueizerVideos: () => ipcRenderer.invoke('uniqueizer:openVideos'),
  probeUniqueizerMedia: (filePath) => ipcRenderer.invoke('uniqueizer:probe', filePath),
  selectUniqueizerOutputDir: () => ipcRenderer.invoke('uniqueizer:openOutputDir'),
  listUniqueizerPresets: () => ipcRenderer.invoke('uniqueizer:presetList'),
  saveUniqueizerPreset: (name, data) => ipcRenderer.invoke('uniqueizer:presetSave', { name, data }),
  loadUniqueizerPreset: (name) => ipcRenderer.invoke('uniqueizer:presetLoad', name),
  deleteUniqueizerPreset: (name) => ipcRenderer.invoke('uniqueizer:presetDelete', name),
  getUniqueizerCatalog: () => ipcRenderer.invoke('uniqueizer:getCatalog'),
  getUniqueizerRecommended: (maxMode) => ipcRenderer.invoke('uniqueizer:getRecommended', maxMode),
  getUniqueizerDefaults: (maxMode) => ipcRenderer.invoke('uniqueizer:getDefaults', maxMode),
  getUniqueizerPythonStatus: () => ipcRenderer.invoke('uniqueizer:pythonStatus'),
  installUniqueizerPythonDeps: () => ipcRenderer.invoke('uniqueizer:installPythonDeps'),
  openPath: (dir) => ipcRenderer.invoke('shell:openPath', dir),
  onUniqueizerLog: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('uniqueizer:log', h);
    return () => ipcRenderer.removeListener('uniqueizer:log', h);
  },
  onUniqueizerCopyProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('uniqueizer:copyProgress', h);
    return () => ipcRenderer.removeListener('uniqueizer:copyProgress', h);
  },
  onUniqueizerTotalProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('uniqueizer:totalProgress', h);
    return () => ipcRenderer.removeListener('uniqueizer:totalProgress', h);
  },
  onUniqueizerCopyDone: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('uniqueizer:copyDone', h);
    return () => ipcRenderer.removeListener('uniqueizer:copyDone', h);
  },
  onUniqueizerAllDone: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('uniqueizer:allDone', h);
    return () => ipcRenderer.removeListener('uniqueizer:allDone', h);
  },
  onUniqueizerError: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('uniqueizer:error', h);
    return () => ipcRenderer.removeListener('uniqueizer:error', h);
  },
  onUniqueizerStarted: (cb) => {
    const h = () => cb();
    ipcRenderer.on('uniqueizer:started', h);
    return () => ipcRenderer.removeListener('uniqueizer:started', h);
  },
  onUniqueizerStopped: (cb) => {
    const h = () => cb();
    ipcRenderer.on('uniqueizer:stopped', h);
    return () => ipcRenderer.removeListener('uniqueizer:stopped', h);
  },

  runChecker: (opts) => ipcRenderer.invoke('checker:run', opts),
  runCheckerBlocks: (opts) => ipcRenderer.invoke('checker:runBlocks', opts),
  cancelChecker: () => ipcRenderer.invoke('checker:cancel'),
  runCheckerNow: () => ipcRenderer.invoke('checker:runNow'),
  onCheckerProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('checker:progress', h);
    return () => ipcRenderer.removeListener('checker:progress', h);
  },

  getResults: () => ipcRenderer.invoke('results:get'),
  setResults: (data) => ipcRenderer.invoke('results:set', data),
  exportResultsCsv: (opts) => ipcRenderer.invoke('results:exportCsv', opts),
  onResultsUpdated: (cb) => {
    const h = (_, data) => cb(data);
    ipcRenderer.on('results:updated', h);
    return () => ipcRenderer.removeListener('results:updated', h);
  },

  getAnalytics: (daysRange) => ipcRenderer.invoke('analytics:get', daysRange),
  getAnalyticsCache: () => ipcRenderer.invoke('analytics:getCache'),
  refreshAnalytics: (daysRange) => ipcRenderer.invoke('analytics:refresh', daysRange),
  exportAnalyticsCsv: (opts) => ipcRenderer.invoke('analytics:exportCsv', opts),

  testTelegram: () => ipcRenderer.invoke('telegram:test'),
  generateNames: (opts) => ipcRenderer.invoke('ai:generateNames', opts),
  generateDescriptions: (opts) => ipcRenderer.invoke('ai:generateDescriptions', opts),
  generateTitles: (opts) => ipcRenderer.invoke('ai:generateTitles', opts),
  generateTags: (opts) => ipcRenderer.invoke('ai:generateTags', opts),
  generateOverlayPairs: (opts) => ipcRenderer.invoke('ai:generateOverlayPairs', opts),

  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
  exportCsv: (rows, name) => ipcRenderer.invoke('backup:export', rows, name),

  openFolder: (options) => ipcRenderer.invoke('dialog:folder', options),
  openImages: (options) => ipcRenderer.invoke('dialog:images', options),
  openVideos: (options) => ipcRenderer.invoke('dialog:videos', options),
  openFile: (filters) => ipcRenderer.invoke('dialog:file', filters),
  importTxt: () => ipcRenderer.invoke('dialog:importTxt'),
  countFiles: (opts) => ipcRenderer.invoke('fs:countFiles', opts),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  getTiktok: () => ipcRenderer.invoke('tiktok:get'),
  setTiktok: (data) => ipcRenderer.invoke('tiktok:set', data),
  getTiktokCommentStats: () => ipcRenderer.invoke('tiktok:commentStats'),
  getTiktokAutomationStatus: () => ipcRenderer.invoke('tiktok:automation:status'),
  getTiktokAutomationLogs: (limit) => ipcRenderer.invoke('tiktok:automation:logs', limit),
  runTiktokAutomation: (opts) => ipcRenderer.invoke('tiktok:automation:run', opts),
  stopTiktokAutomation: () => ipcRenderer.invoke('tiktok:automation:stop'),
  updateTiktokMeta: (opts) => ipcRenderer.invoke('profiles:updateTiktokMeta', opts),
  detectTiktokLogin: (opts) => ipcRenderer.invoke('tiktok:detectLogin', opts),
  cancelTiktokDetect: () => ipcRenderer.invoke('tiktok:detectLogin:cancel'),
  onTiktokDetectLog: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('tiktok:detectLog', h);
    return () => ipcRenderer.removeListener('tiktok:detectLog', h);
  },
  onTiktokDetectProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('tiktok:detectProgress', h);
    return () => ipcRenderer.removeListener('tiktok:detectProgress', h);
  },
  onTiktokAutomationLog: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('tiktok:automation:log', h);
    return () => ipcRenderer.removeListener('tiktok:automation:log', h);
  },
  onTiktokAutomationProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('tiktok:automation:progress', h);
    return () => ipcRenderer.removeListener('tiktok:automation:progress', h);
  },

  getUpdaterStatus: () => ipcRenderer.invoke('updater:status'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  dismissUpdate: (version) => ipcRenderer.invoke('updater:dismiss', version),
  dismissChangelog: (version) => ipcRenderer.invoke('changelog:dismiss', version),
  setAutoUpdateEnabled: (enabled) => ipcRenderer.invoke('updater:setAutoEnabled', enabled),
  onUpdaterStatus: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('updater:status', h);
    return () => ipcRenderer.removeListener('updater:status', h);
  },
  onUpdaterNotify: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('updater:notify', h);
    return () => ipcRenderer.removeListener('updater:notify', h);
  },
  onUpdaterProgress: (cb) => {
    const h = (_, d) => cb(d);
    ipcRenderer.on('updater:progress', h);
    return () => ipcRenderer.removeListener('updater:progress', h);
  },
});
