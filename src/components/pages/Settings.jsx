import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight, Palette, Globe, Key, Send, RefreshCw, Monitor, Database, Keyboard,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import Toggle from '../ui/Toggle';
import AppearanceSettings from '../settings/AppearanceSettings';
import PageHeader from '../layout/PageHeader';
import { HotkeysList } from '../layout/HotkeysModal';
const CATEGORIES = [
  { id: 'appearance', icon: Palette },
  { id: 'browser', icon: Globe },
  { id: 'apiKeys', icon: Key },
  { id: 'notifications', icon: Send },
  { id: 'autochecker', icon: RefreshCw },
  { id: 'system', icon: Monitor },
  { id: 'backup', icon: Database },
  { id: 'hotkeys', icon: Keyboard },
];

function SettingsList({ onSelect }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-2xl">
      <PageHeader
        icon={Key}
        title={t('settings.title')}
        description={t('settings.subtitle')}
        className="mb-6"
      />
      <div className="nexus-card divide-y" style={{ borderColor: 'var(--nexus-border)' }}>
        {CATEGORIES.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-white/[0.02] transition text-left"
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--nexus-accent) 15%, transparent)' }}>
              <Icon className="w-5 h-5" style={{ color: 'var(--nexus-accent)' }} />
            </div>
            <div className="flex-1">
              <div className="font-medium">{t(`settings.${id}`)}</div>
              <div className="text-xs text-nexus-dim">{t(`settings.${id}Desc`)}</div>
            </div>
            <ChevronRight className="w-5 h-5 text-nexus-dim" />
          </button>
        ))}
      </div>
    </div>
  );
}

function AppearanceSettingsWrapper({ settings, onSave }) {
  return (
    <AppearanceSettings
      settings={settings}
      onSave={onSave}
      onBack={() => useAppStore.getState().setSettingsSubPage(null)}
    />
  );
}

function BrowserSettings({ settings, onSave }) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState(settings.browserProvider || 'mostlogin');
  const [url, setUrl] = useState(settings.mostloginUrl || 'http://127.0.0.1:30898');
  const [visionLocal, setVisionLocal] = useState(settings.visionLocalUrl || 'http://127.0.0.1:3030');
  const [zennoUrl, setZennoUrl] = useState(settings.zennoUrl || 'http://127.0.0.1:8160');
  const [key, setKey] = useState('');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setProvider(settings.browserProvider || 'mostlogin');
    setUrl(settings.mostloginUrl || 'http://127.0.0.1:30898');
    setVisionLocal(settings.visionLocalUrl || 'http://127.0.0.1:3030');
    setZennoUrl(settings.zennoUrl || 'http://127.0.0.1:8160');
  }, [settings]);

  const secretKeyFor = (p) => ({ mostlogin: 'mostloginKey', vision: 'visionKey', zenno: 'zennoKey' }[p] || 'mostloginKey');

  const save = async () => {
    if (key.trim()) await window.nexusAPI?.setSecret(secretKeyFor(provider), key.trim());
    await onSave({
      browserProvider: provider,
      mostloginUrl: url.trim(),
      visionLocalUrl: visionLocal.trim(),
      zennoUrl: zennoUrl.trim(),
    });
    useAppStore.getState().showToast(t('common.save'));
  };

  const test = async () => {
    if (!key.trim() && provider === 'mostlogin') {
      setStatus({ ok: false, error: 'Введите API ключ' });
      return;
    }
    if (key.trim()) await window.nexusAPI?.setSecret(secretKeyFor(provider), key.trim());
    await window.nexusAPI?.updateSettings({
      browserProvider: provider,
      mostloginUrl: url.trim(),
      visionLocalUrl: visionLocal.trim(),
      zennoUrl: zennoUrl.trim(),
    });
    const res = await window.nexusAPI?.testBrowser(provider);
    setStatus(res);
    useAppStore.getState().setMostloginOnline(res?.ok);
  };

  return (
    <SettingsPanel title={t('settings.browser')} onBack={() => useAppStore.getState().setSettingsSubPage(null)}>
      <Row label="Anti-detect browser">
        <select className="nexus-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="mostlogin">MostLogin</option>
          <option value="vision">Vision Browser</option>
          <option value="zenno">ZennoBrowser</option>
        </select>
      </Row>
      {provider === 'mostlogin' && (
        <>
          <Row label="MostLogin API URL">
            <input className="nexus-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:30898" />
          </Row>
          <Row label="MostLogin API Key">
            <input className="nexus-input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Authorization token" />
          </Row>
        </>
      )}
      {provider === 'vision' && (
        <>
          <Row label="Vision X-Token">
            <input className="nexus-input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="X-Token из Vision Settings" />
          </Row>
          <Row label="Vision local API">
            <input className="nexus-input" value={visionLocal} onChange={(e) => setVisionLocal(e.target.value)} placeholder="http://127.0.0.1:3030" />
          </Row>
        </>
      )}
      {provider === 'zenno' && (
        <>
          <Row label="Zenno Api-Token">
            <input className="nexus-input" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Api-Token" />
          </Row>
          <Row label="Zenno API URL">
            <input className="nexus-input" value={zennoUrl} onChange={(e) => setZennoUrl(e.target.value)} placeholder="http://127.0.0.1:8160" />
          </Row>
        </>
      )}
      <div className="flex gap-2 mt-2">
        <button type="button" onClick={save} className="px-4 py-2 rounded-lg text-sm text-white" style={{ background: 'var(--nexus-accent)' }}>{t('common.save')}</button>
        <button type="button" onClick={test} className="px-4 py-2 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>{t('common.test')}</button>
      </div>
      {status && <p className={`text-sm mt-2 ${status.ok ? 'text-green-400' : 'text-red-400'}`}>{status.ok ? 'Подключено успешно' : status.error}</p>}
    </SettingsPanel>
  );
}

const AI_PRESETS = [
  { id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
];

function ApiKeysSettings({ settings, onSave }) {
  const { t } = useTranslation();
  const [keys, setKeys] = useState({});
  const [has, setHas] = useState({});
  const [aiBaseUrl, setAiBaseUrl] = useState(settings.aiBaseUrl || 'https://openrouter.ai/api/v1');
  const [aiModel, setAiModel] = useState(settings.aiModel || 'nvidia/nemotron-3-ultra-550b-a55b:free');
  const [aiKey, setAiKey] = useState('');
  const [aiStatus, setAiStatus] = useState(null);

  useEffect(() => {
    window.nexusAPI?.getSettings().then((r) => setHas(r?.secrets || {}));
  }, []);

  useEffect(() => {
    setAiBaseUrl(settings.aiBaseUrl || 'https://openrouter.ai/api/v1');
    setAiModel(settings.aiModel || 'nvidia/nemotron-3-ultra-550b-a55b:free');
  }, [settings]);

  const save = async (name) => {
    if (!keys[name]?.trim()) return;
    await window.nexusAPI?.setSecret(name, keys[name].trim());
    const flag = SECRET_FLAG[name];
    if (flag) setHas((h) => ({ ...h, [flag]: true }));
    useAppStore.getState().showToast(t('common.save'));
  };

  const saveAi = async () => {
    if (aiKey.trim()) {
      await window.nexusAPI?.setSecret('deepseekKey', aiKey.trim());
      setHas((h) => ({ ...h, hasDeepseekKey: true }));
    }
    await onSave({
      aiBaseUrl: aiBaseUrl.trim(),
      aiModel: aiModel.trim(),
    });
    useAppStore.getState().showToast(t('common.save'));
  };

  const testAi = async () => {
    if (aiKey.trim()) await window.nexusAPI?.setSecret('deepseekKey', aiKey.trim());
    await onSave({ aiBaseUrl: aiBaseUrl.trim(), aiModel: aiModel.trim() });
    const res = await window.nexusAPI?.testAi?.();
    setAiStatus(res);
  };

  const applyPreset = (preset) => {
    setAiBaseUrl(preset.baseUrl);
    setAiModel(preset.model);
    setAiStatus(null);
  };

  const SECRET_FLAG = {
    mostloginKey: 'hasMostloginKey',
    visionKey: 'hasVisionKey',
    zennoKey: 'hasZennoKey',
    spaceproxyKey: 'hasSpaceproxyKey',
    youtubeKey: 'hasYoutubeKey',
  };

  const FIELDS = [
    { key: 'mostloginKey', label: 'MostLogin', color: 'bg-purple-500' },
    { key: 'visionKey', label: 'Vision X-Token', color: 'bg-blue-500' },
    { key: 'zennoKey', label: 'Zenno Api-Token', color: 'bg-cyan-500' },
    { key: 'spaceproxyKey', label: 'SpaceProxy', color: 'bg-green-500' },
    { key: 'youtubeKey', label: 'YouTube Data API', color: 'bg-red-500' },
  ];

  return (
    <SettingsPanel title={t('settings.apiKeys')} onBack={() => useAppStore.getState().setSettingsSubPage(null)}>
      <div className="nexus-card p-4 space-y-3 mb-4 border border-purple-500/20">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">{t('settings.aiProvider')}</div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${has.hasDeepseekKey ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-nexus-dim'}`}>
            {has.hasDeepseekKey ? t('settings.keyConfigured') : t('settings.keyMissing')}
          </span>
        </div>
        <p className="text-xs text-nexus-dim">{t('settings.aiProviderDesc')}</p>

        <div className="flex flex-wrap gap-2">
          {AI_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className="px-3 py-1 text-xs rounded border hover:bg-white/5"
              style={{ borderColor: 'var(--nexus-border)' }}
            >
              {t(`settings.aiPreset.${preset.id}`)}
            </button>
          ))}
        </div>

        <label className="block text-xs text-nexus-dim">{t('settings.aiBaseUrl')}</label>
        <input
          className="nexus-input text-sm font-mono"
          value={aiBaseUrl}
          onChange={(e) => setAiBaseUrl(e.target.value)}
          placeholder="https://openrouter.ai/api/v1"
        />

        <label className="block text-xs text-nexus-dim">{t('settings.aiModel')}</label>
        <input
          className="nexus-input text-sm font-mono"
          value={aiModel}
          onChange={(e) => setAiModel(e.target.value)}
          placeholder="nvidia/nemotron-3-ultra-550b-a55b:free"
        />

        <label className="block text-xs text-nexus-dim">{t('settings.aiApiKey')}</label>
        <input
          className="nexus-input text-sm"
          type="password"
          value={aiKey}
          onChange={(e) => setAiKey(e.target.value)}
          placeholder="sk-..."
        />

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={saveAi} className="px-4 py-2 rounded-lg text-sm text-white" style={{ background: 'var(--nexus-accent)' }}>
            {t('common.save')}
          </button>
          <button type="button" onClick={testAi} className="px-4 py-2 rounded-lg text-sm border hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>
            {t('common.test')}
          </button>
        </div>
        {aiStatus && (
          <p className={`text-xs ${aiStatus.valid ? 'text-green-400' : 'text-red-400'}`}>
            {aiStatus.valid ? t('settings.aiTestOk') : (aiStatus.error || t('settings.aiTestFail'))}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, color }) => {
          const configured = has[SECRET_FLAG[key]];
          return (
            <div key={key} className="nexus-card p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${color}`} />
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${configured ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-nexus-dim'}`}>
                  {configured ? t('settings.keyConfigured') : t('settings.keyMissing')}
                </span>
              </div>
              <input
                className="nexus-input text-sm"
                type="password"
                placeholder="••••••••"
                value={keys[key] || ''}
                onChange={(e) => setKeys({ ...keys, [key]: e.target.value })}
              />
              <button type="button" onClick={() => save(key)} className="text-xs text-nexus-dim hover:text-white">{t('common.save')}</button>
            </div>
          );
        })}
      </div>
    </SettingsPanel>
  );
}
function NotificationsSettings() {
  const [token, setToken] = useState('');
  const [userId, setUserId] = useState('');

  const save = async () => {
    await window.nexusAPI?.setSecret('telegramBotToken', token);
    await window.nexusAPI?.setSecret('telegramUserId', userId);
  };

  const test = async () => {
    await save();
    const res = await window.nexusAPI?.testTelegram();
    useAppStore.getState().showToast(res.ok ? 'Message sent' : res.error);
  };

  return (
    <SettingsPanel title="Telegram" onBack={() => useAppStore.getState().setSettingsSubPage(null)}>
      <Row label="Bot token"><input className="nexus-input" value={token} onChange={(e) => setToken(e.target.value)} /></Row>
      <Row label="User ID"><input className="nexus-input" value={userId} onChange={(e) => setUserId(e.target.value)} /></Row>
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={save} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--nexus-border)' }}>Save</button>
        <button type="button" onClick={test} className="px-4 py-2 rounded-lg text-sm text-white" style={{ background: 'var(--nexus-accent)' }}>Test</button>
      </div>
    </SettingsPanel>
  );
}

function AutocheckerSettings({ settings, onSave }) {
  const { t } = useTranslation();
  const [local, setLocal] = useState({
    ...(settings.autoChecker || {}),
    statsCollector: settings.statsCollector || {},
  });

  return (
    <SettingsPanel title={t('settings.autochecker')} onBack={() => useAppStore.getState().setSettingsSubPage(null)}>
      <Row label="Auto video check" desc="Check via YouTube API on schedule">
        <Toggle checked={local.enabled} onChange={(v) => setLocal({ ...local, enabled: v })} />
      </Row>
      <Row label="Interval">
        <select className="nexus-input" value={local.intervalHours} onChange={(e) => setLocal({ ...local, intervalHours: +e.target.value })}>
          <option value={6}>Every 6 hours</option>
          <option value={12}>Every 12 hours</option>
          <option value={24}>Every 24 hours</option>
        </select>
      </Row>
      <Row label="Telegram notifications"><Toggle checked={local.telegramNotify} onChange={(v) => setLocal({ ...local, telegramNotify: v })} /></Row>
      <Row label="Notify bans only"><Toggle checked={local.notifyBansOnly} onChange={(v) => setLocal({ ...local, notifyBansOnly: v })} /></Row>
      <Row label="Check blocks">
        <select className="nexus-input" value={local.blockScope} onChange={(e) => setLocal({ ...local, blockScope: e.target.value })}>
          <option value="all">All blocks</option>
          <option value="last">Last block</option>
        </select>
      </Row>
      <div className="pt-4 mt-2 border-t" style={{ borderColor: 'var(--nexus-border)' }}>
        <div className="text-sm font-medium mb-3">Stats Collector (hourly)</div>
        <Row label="Enable stats snapshot">
          <Toggle checked={local.statsCollector?.enabled} onChange={(v) => setLocal({ ...local, statsCollector: { ...(local.statsCollector || {}), enabled: v } })} />
        </Row>
        <Row label="Telegram on snapshot">
          <Toggle checked={local.statsCollector?.telegramNotify} onChange={(v) => setLocal({ ...local, statsCollector: { ...(local.statsCollector || {}), telegramNotify: v } })} />
        </Row>
      </div>
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={() => onSave({ autoChecker: local, statsCollector: local.statsCollector })} className="px-4 py-2 rounded-lg text-sm text-white" style={{ background: 'var(--nexus-accent)' }}>{t('common.save')}</button>
        <button type="button" onClick={() => window.nexusAPI?.runCheckerNow()} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--nexus-border)' }}>Run check now</button>
        <button type="button" onClick={() => window.nexusAPI?.collectStatsNow()} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--nexus-border)' }}>Stats snapshot</button>
      </div>
    </SettingsPanel>
  );
}

function SystemSettings({ settings, onSave }) {
  const { t } = useTranslation();
  const [sys, setSys] = useState({});
  const [ffmpeg, setFfmpeg] = useState(settings.ffmpegPath || '');
  const [ytStatus, setYtStatus] = useState(null);

  useEffect(() => {
    window.nexusAPI?.getSystemStatus().then(setSys);
    setFfmpeg(settings.ffmpegPath || '');
  }, [settings]);

  const pickFfmpeg = async () => {
    const path = await window.nexusAPI?.openFile?.([{ name: 'FFmpeg', extensions: ['exe', '*'] }]);
    if (path) setFfmpeg(path);
  };

  const saveFfmpeg = async () => {
    await onSave({ ffmpegPath: ffmpeg.trim() });
    window.nexusAPI?.getSystemStatus().then(setSys);
    useAppStore.getState().showToast(t('common.save'));
  };

  const validateYoutube = async () => {
    const res = await window.nexusAPI?.validateYoutube?.();
    setYtStatus(res);
  };

  return (
    <SettingsPanel title={t('settings.system')} onBack={() => useAppStore.getState().setSettingsSubPage(null)}>
      {['python', 'ffmpeg', 'playwright'].map((k) => (
        <Row key={k} label={k}>
          <span className={`text-sm ${sys[k] ? 'text-green-400' : 'text-red-400'}`}>
            {sys[k] ? t('settings.installed') : t('settings.notFound')}
          </span>
        </Row>
      ))}
      <Row label={t('settings.ffmpegPath')} desc={t('settings.ffmpegPathDesc')}>
        <div className="flex flex-col gap-2 items-end">
          <input className="nexus-input text-xs w-64" value={ffmpeg} onChange={(e) => setFfmpeg(e.target.value)} placeholder="ffmpeg.exe" />
          <div className="flex gap-2">
            <button type="button" onClick={pickFfmpeg} className="px-3 py-1 text-xs rounded border" style={{ borderColor: 'var(--nexus-border)' }}>{t('settings.browse')}</button>
            <button type="button" onClick={saveFfmpeg} className="px-3 py-1 text-xs rounded text-white" style={{ background: 'var(--nexus-accent)' }}>{t('common.save')}</button>
          </div>
        </div>
      </Row>
      <Row label={t('settings.validateYoutube')}>
        <div className="flex flex-col items-end gap-1">
          <button type="button" onClick={validateYoutube} className="px-3 py-1.5 text-xs rounded border" style={{ borderColor: 'var(--nexus-border)' }}>{t('common.test')}</button>
          {ytStatus && (
            <span className={`text-xs ${ytStatus.valid ? 'text-green-400' : 'text-red-400'}`}>
              {ytStatus.valid ? t('settings.youtubeOk') : (ytStatus.error || t('settings.youtubeFail'))}
            </span>
          )}
        </div>
      </Row>
    </SettingsPanel>
  );
}
function BackupSettings({ settings, onSave }) {
  const { t } = useTranslation();
  const { showToast } = useAppStore();
  const [local, setLocal] = useState(settings.autoBackup || {});

  useEffect(() => {
    setLocal(settings.autoBackup || {});
  }, [settings]);

  const exportResults = async () => {
    const res = await window.nexusAPI?.exportResultsCsv?.({ allBlocks: true });
    if (res?.path) showToast(res.path);
    else if (res?.error) showToast(res.error, 'error');
  };

  const pickFolder = async () => {
    const folder = await window.nexusAPI?.openFolder?.({ title: t('settings.backupFolder') });
    if (folder) setLocal({ ...local, folder });
  };

  const saveAuto = async () => {
    await onSave({ autoBackup: local });
    showToast(t('common.save'));
  };

  return (
    <SettingsPanel title={t('settings.backup')} onBack={() => useAppStore.getState().setSettingsSubPage(null)}>
      <Row label={t('settings.exportResultsCsv')}>
        <button type="button" onClick={exportResults} className="px-3 py-1.5 text-xs rounded border" style={{ borderColor: 'var(--nexus-border)' }}>{t('common.export')}</button>
      </Row>
      <Row label={t('settings.fullBackup')}>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.nexusAPI?.createBackup()} className="px-3 py-1.5 text-xs rounded border" style={{ borderColor: 'var(--nexus-border)' }}>{t('settings.createBackup')}</button>
          <button type="button" onClick={() => window.nexusAPI?.restoreBackup()} className="px-3 py-1.5 text-xs rounded border" style={{ borderColor: 'var(--nexus-border)' }}>{t('settings.restoreBackup')}</button>
        </div>
      </Row>
      <Row label={t('settings.resetSettings')}>
        <button type="button" onClick={() => window.nexusAPI?.resetSettings()} className="px-3 py-1.5 text-xs rounded bg-red-600 text-white">{t('settings.reset')}</button>
      </Row>
      <Row label={t('settings.autoBackup')} desc={t('settings.autoBackupDesc')}>
        <Toggle checked={!!local.enabled} onChange={(v) => setLocal({ ...local, enabled: v })} />
      </Row>
      {local.enabled && (
        <>
          <Row label={t('settings.backupInterval')}>
            <select className="nexus-input text-sm" value={local.intervalDays || 7} onChange={(e) => setLocal({ ...local, intervalDays: +e.target.value })}>
              <option value={1}>1 {t('settings.days')}</option>
              <option value={3}>3 {t('settings.days')}</option>
              <option value={7}>7 {t('settings.days')}</option>
              <option value={14}>14 {t('settings.days')}</option>
            </select>
          </Row>
          <Row label={t('settings.backupFolder')}>
            <div className="flex flex-col gap-2 items-end">
              <span className="text-xs text-nexus-dim max-w-[200px] truncate">{local.folder || '—'}</span>
              <button type="button" onClick={pickFolder} className="px-3 py-1 text-xs rounded border" style={{ borderColor: 'var(--nexus-border)' }}>{t('settings.browse')}</button>
            </div>
          </Row>
          {local.lastBackup && (
            <Row label={t('settings.lastBackup')}>
              <span className="text-xs text-nexus-dim">{new Date(local.lastBackup).toLocaleString()}</span>
            </Row>
          )}
        </>
      )}
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={saveAuto} className="px-4 py-2 rounded-lg text-sm text-white" style={{ background: 'var(--nexus-accent)' }}>{t('common.save')}</button>
      </div>
      <div className="mt-4 p-3 rounded-lg border border-yellow-500/30 text-yellow-400 text-xs">
        {t('settings.restoreWarning')}
      </div>
    </SettingsPanel>
  );
}
function HotkeysSettings() {
  const { t } = useTranslation();
  return (
    <SettingsPanel title={t('settings.hotkeys')} onBack={() => useAppStore.getState().setSettingsSubPage(null)}>
      <p className="text-nexus-dim text-sm mb-4">{t('settings.hotkeysHint')}</p>
      <HotkeysList />
    </SettingsPanel>
  );
}
function Row({ label, desc, children }) {
  return (
    <div className="flex items-center justify-between py-4 border-b gap-4" style={{ borderColor: 'var(--nexus-border)' }}>
      <div>
        <div className="text-sm">{label}</div>
        {desc && <div className="text-xs text-nexus-dim">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function SettingsPanel({ title, onBack, children }) {
  const { t } = useTranslation();
  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm text-nexus-dim hover:text-white mb-4 flex items-center gap-1">← {t('common.back')}</button>
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      <div className="nexus-card p-4">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { settingsSubPage, setSettingsSubPage } = useAppStore();
  const [settings, setSettings] = useState({});

  useEffect(() => {
    window.nexusAPI?.getSettings().then((r) => setSettings(r.settings || {}));
  }, []);

  const saveSettings = async (partial) => {
    const next = await window.nexusAPI?.updateSettings(partial);
    setSettings(next || { ...settings, ...partial });
  };

  if (!settingsSubPage) {
    return <SettingsList onSelect={setSettingsSubPage} />;
  }

  const pages = {
    appearance: <AppearanceSettingsWrapper settings={settings} onSave={saveSettings} />,
    browser: <BrowserSettings settings={settings} onSave={saveSettings} />,
    apiKeys: <ApiKeysSettings settings={settings} onSave={saveSettings} />,
    notifications: <NotificationsSettings />,
    autochecker: <AutocheckerSettings settings={settings} onSave={saveSettings} />,
    system: <SystemSettings settings={settings} onSave={saveSettings} />,
    backup: <BackupSettings settings={settings} onSave={saveSettings} />,
    hotkeys: <HotkeysSettings />,
  };

  return pages[settingsSubPage] || <SettingsList onSelect={setSettingsSubPage} />;
}
