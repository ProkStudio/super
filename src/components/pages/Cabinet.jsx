import { useEffect, useState } from 'react';
import { Shield, Users, Mail, BarChart3, Youtube, RefreshCw, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageHeader from '../layout/PageHeader';
import Toggle from '../ui/Toggle';
import { useAppStore } from '../../store/useAppStore';

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--nexus-accent) 15%, transparent)' }}>
        <Icon className="w-5 h-5" style={{ color: 'var(--nexus-accent)' }} />
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function Cabinet() {
  const { t } = useTranslation();
  const { showToast } = useAppStore();
  const [stats, setStats] = useState({
    profiles: 0,
    accounts: 0,
    resultBlocks: 0,
    videos: 0,
  });
  const [appVersion, setAppVersion] = useState('');
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    window.nexusAPI?.getUpdaterStatus?.().then((res) => {
      if (res?.currentVersion) setAppVersion(res.currentVersion);
      if (res?.autoUpdate) setAutoUpdate(!!res.autoUpdate.enabled);
    });
  }, []);

  useEffect(() => {
    Promise.all([
      window.nexusAPI?.getProfilesMeta?.(),
      window.nexusAPI?.getAccounts?.(),
      window.nexusAPI?.getResults?.(),
      window.nexusAPI?.getAnalyticsCache?.(),
    ]).then(([profilesMeta, accounts, results, cache]) => {
      const blocks = accounts?.blocks || [];
      const accountCount = blocks.reduce((n, b) => n + (b.accounts?.length || 0), 0)
        + (accounts?.temp?.length || 0);
      const resultBlocks = results?.blocks || [];
      const videoCount = resultBlocks.reduce((n, b) => n + (b.videos?.length || 0), 0);
      const profileCount = Object.keys(profilesMeta?.meta || {}).length
        || (cache?.totals?.profilesCount ?? 0);

      setStats({
        profiles: profileCount,
        accounts: accountCount,
        resultBlocks: resultBlocks.length,
        videos: cache?.totals?.totalVideos ?? videoCount,
      });
    }).catch(() => {});
  }, []);

  const checkUpdates = async () => {
    setChecking(true);
    const res = await window.nexusAPI?.checkForUpdates?.();
    setChecking(false);
    if (res?.reason === 'dev') {
      showToast(t('updater.devOnly'), 'error');
      return;
    }
    if (res?.ok === false && res?.error) showToast(res.error, 'error');
  };

  const toggleAutoUpdate = async (enabled) => {
    setAutoUpdate(enabled);
    await window.nexusAPI?.setAutoUpdateEnabled?.(enabled);
    showToast(enabled ? t('updater.autoEnabledToast') : t('updater.autoDisabledToast'));
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <PageHeader
        icon={Shield}
        title={t('nav.cabinet')}
        description={t('cabinet.subtitle')}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl">
        <StatCard icon={Users} label={t('cabinet.profiles')} value={stats.profiles} />
        <StatCard icon={Mail} label={t('cabinet.accounts')} value={stats.accounts} />
        <StatCard icon={BarChart3} label={t('cabinet.sessions')} value={stats.resultBlocks} />
        <StatCard icon={Youtube} label={t('cabinet.videos')} value={stats.videos} />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 max-w-md space-y-4">
        <div>
          <p className="text-muted-foreground text-sm">
            {t('app.name')}
            {' '}
            {appVersion || t('app.version')}
          </p>
          <p className="mt-2 text-sm text-foreground">{t('cabinet.activation')}</p>
        </div>

        <div className="pt-4 border-t border-border space-y-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t('updater.section')}</p>
          <div className="flex items-center gap-3">
            <Toggle checked={autoUpdate} onChange={toggleAutoUpdate} />
            <div>
              <p className="text-sm">{t('updater.autoLabel')}</p>
              <p className="text-xs text-muted-foreground">{t('updater.autoHintShort')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={checkUpdates}
            disabled={checking}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: 'var(--nexus-border)' }}
          >
            {checking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {checking ? t('updater.checking') : t('updater.checkNow')}
          </button>
        </div>

        <div className="pt-4 border-t border-border text-xs text-muted-foreground">
          {t('cabinet.hint')}
        </div>
      </div>
    </div>
  );
}
