import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTranslation } from 'react-i18next';

import {

  BarChart3, RefreshCw, Download, Video, Eye, Heart, MessageCircle,

  Users, Layers, Ban, ExternalLink, CheckCircle,

} from 'lucide-react';

import { useAppStore } from '../../store/useAppStore';

import { computeAnalytics } from '../../lib/analyticsData';

import { formatNumber } from '../../lib/formatters';

import StatCard from '../analytics/StatCard';

import SimpleAreaChart, { SimpleBarChart } from '../analytics/Charts';

import PageHeader from '../layout/PageHeader';



const DAY_RANGES = [7, 30, 90];



export default function Analytics() {

  const { t } = useTranslation();

  const { showToast } = useAppStore();

  const [blocks, setBlocks] = useState([]);

  const [daysRange, setDaysRange] = useState(30);

  const [loading, setLoading] = useState(false);

  const [progress, setProgress] = useState(0);

  const [lastRefreshed, setLastRefreshed] = useState(null);

  const [refreshedData, setRefreshedData] = useState(null);



  const load = useCallback(async () => {

    const results = await window.nexusAPI?.getResults();

    setBlocks(results?.blocks || []);



    const cache = await window.nexusAPI?.getAnalyticsCache?.();

    if (cache?.totals) {

      setRefreshedData({

        totals: cache.totals,

        topVideos: cache.topVideos || [],

        viewsSeries: cache.viewsSeries,

        videosSeries: cache.videosSeries,

        computedAt: cache.computedAt || cache.lastUpdated,

        daysRange: cache.daysRange || 30,

      });

      if (cache.lastUpdated || cache.computedAt) {

        setLastRefreshed(cache.lastUpdated || cache.computedAt);

      }

    }

  }, []);



  useEffect(() => { load(); }, [load]);



  useEffect(() => {

    const unsubResults = window.nexusAPI?.onResultsUpdated?.(() => load());

    const unsubProgress = window.nexusAPI?.onCheckerProgress?.((p) => {

      if (p?.total) setProgress(Math.round((p.current / p.total) * 100));

    });

    return () => {

      unsubResults?.();

      unsubProgress?.();

    };

  }, [load]);



  const data = useMemo(() => {

    if (refreshedData?.daysRange === daysRange && refreshedData.totals) return refreshedData;

    return computeAnalytics(blocks, daysRange);

  }, [blocks, daysRange, refreshedData]);



  const refresh = async () => {

    setLoading(true);

    setProgress(0);

    const res = await window.nexusAPI?.refreshAnalytics(daysRange);

    setLoading(false);

    setProgress(0);

    if (res?.ok) {

      setRefreshedData({ ...res, daysRange });

      setLastRefreshed(res.computedAt || res.lastUpdated || new Date().toISOString());

      await load();

      showToast(t('analytics.updated'));

    } else {

      showToast(res?.error || t('analytics.refreshFailed'), 'error');

    }

  };



  const exportTopCsv = async () => {

    const res = await window.nexusAPI?.exportAnalyticsCsv?.({ mode: 'top', daysRange });

    if (res?.ok) showToast(t('analytics.exported'));

    else if (!res?.cancelled) showToast(res?.error || t('analytics.noData'), 'error');

  };



  const exportSnapshotCsv = async () => {

    const res = await window.nexusAPI?.exportAnalyticsCsv?.({ mode: 'snapshot', daysRange });

    if (res?.ok) showToast(t('analytics.exported'));

    else if (!res?.cancelled) showToast(res?.error || t('analytics.noData'), 'error');

  };



  const openUrl = (url) => {

    if (url) window.nexusAPI?.openExternal?.(url);

  };



  const { totals } = data;



  return (

    <div className="h-full flex flex-col gap-4 overflow-hidden">

      <PageHeader

        icon={BarChart3}

        title={t('analytics.title')}

        description={t('analytics.subtitle')}

        actions={(

        <div className="flex items-center gap-2 flex-wrap">

          <button

            type="button"

            onClick={exportTopCsv}

            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-white/5"

            style={{ borderColor: 'var(--nexus-border)' }}

          >

            <Download className="w-4 h-4" />

            {t('analytics.exportCsv')}

          </button>

          <button

            type="button"

            onClick={exportSnapshotCsv}

            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-white/5"

            style={{ borderColor: 'var(--nexus-border)' }}

          >

            <Download className="w-4 h-4" />

            {t('analytics.exportSnapshot')}

          </button>

          <button

            type="button"

            onClick={refresh}

            disabled={loading}

            className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm hover:bg-white/5 disabled:opacity-40"

            style={{ borderColor: 'var(--nexus-border)' }}

            title={t('analytics.refreshAll')}

          >

            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />

            {loading ? `${t('analytics.refresh')} ${progress}%` : t('analytics.refreshAll')}

          </button>

        </div>

        )}

      />



      {loading && (

        <div className="w-full h-1 rounded-full bg-zinc-800 overflow-hidden shrink-0">

          <div className="h-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />

        </div>

      )}



      {lastRefreshed && (

        <p className="text-[10px] text-nexus-dim shrink-0">

          {t('analytics.lastUpdated')}: {new Date(lastRefreshed).toLocaleString()}

          {' · '}

          {t('analytics.manualExcluded')}

        </p>

      )}

      {!lastRefreshed && (

        <p className="text-[10px] text-nexus-dim shrink-0">{t('analytics.manualExcluded')}</p>

      )}



      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3 shrink-0">

        <StatCard label={t('analytics.totalVideos')} value={totals.videoCount} icon={Video} iconBg="bg-blue-500/15" iconColor="text-blue-400" />

        <StatCard label={t('analytics.activeVideos')} value={totals.activeCount} icon={CheckCircle} iconBg="bg-emerald-500/15" iconColor="text-emerald-400" />

        <StatCard label={t('analytics.totalViews')} value={totals.totalViews} icon={Eye} iconBg="bg-emerald-500/15" iconColor="text-emerald-400" />

        <StatCard label={t('analytics.totalLikes')} value={totals.totalLikes} icon={Heart} iconBg="bg-pink-500/15" iconColor="text-pink-400" />

        <StatCard label={t('analytics.totalComments')} value={totals.totalComments} icon={MessageCircle} iconBg="bg-orange-500/15" iconColor="text-orange-400" />

        <StatCard label={t('analytics.profiles')} value={totals.profileCount} icon={Users} iconBg="bg-purple-500/15" iconColor="text-purple-400" />

        <StatCard label={t('analytics.sessions')} value={totals.sessionCount} icon={Layers} iconBg="bg-cyan-500/15" iconColor="text-cyan-400" />

        <StatCard label={t('analytics.banned')} value={totals.bannedCount} icon={Ban} iconBg="bg-red-500/15" iconColor="text-red-400" />

      </div>



      <div className="flex gap-2 shrink-0">

        {DAY_RANGES.map((d) => (

          <button

            key={d}

            type="button"

            onClick={() => { setDaysRange(d); setRefreshedData(null); }}

            className={`px-4 py-1.5 rounded-full text-sm border transition ${

              daysRange === d

                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'

                : 'border-transparent text-nexus-dim hover:bg-white/5'

            }`}

          >

            {t('analytics.days', { count: d })}

          </button>

        ))}

      </div>



      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">

        <div className="nexus-card p-4">

          <h3 className="text-sm font-medium mb-3">{t('analytics.viewsChart')}</h3>

          <SimpleAreaChart data={data.viewsSeries} height={180} />

        </div>

        <div className="nexus-card p-4">

          <h3 className="text-sm font-medium mb-3">{t('analytics.newVideosChart')}</h3>

          <SimpleBarChart data={data.videosSeries} height={180} />

        </div>

      </div>



      <div className="flex-1 nexus-card overflow-hidden flex flex-col min-h-0">

        <div className="px-4 py-3 border-b font-medium shrink-0" style={{ borderColor: 'var(--nexus-border)' }}>

          {t('analytics.topVideos')}

        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">

          {data.topVideos.length === 0 ? (

            <p className="text-center text-nexus-dim py-12 text-sm">{t('analytics.noData')}</p>

          ) : (

            data.topVideos.map((v, i) => (

              <div

                key={v.id}

                className="flex items-center gap-3 px-4 py-3 border-b hover:bg-white/[0.02]"

                style={{ borderColor: 'var(--nexus-border)' }}

              >

                <span className="text-nexus-dim w-6 text-sm font-mono shrink-0">{i + 1}</span>

                {v.thumbnail ? (

                  <img src={v.thumbnail} alt="" className="w-14 h-10 rounded object-cover shrink-0 bg-zinc-800" />

                ) : (

                  <div className="w-14 h-10 rounded bg-zinc-800 shrink-0" />

                )}

                <div className="flex-1 min-w-0">

                  <div className="text-sm font-medium truncate">{v.title}</div>

                  {v.profileLabel && (

                    <span className="text-[10px] text-purple-400">{v.profileLabel}{v.profileNum != null ? ` ${v.profileNum}` : ''}</span>

                  )}

                </div>

                <div className="flex items-center gap-3 text-xs text-nexus-dim shrink-0">

                  <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{formatNumber(v.views)}</span>

                  <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />{formatNumber(v.likes)}</span>

                  <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{formatNumber(v.comments)}</span>

                </div>

                {v.url && (

                  <button type="button" onClick={() => openUrl(v.url)} className="p-1.5 rounded hover:bg-white/5 text-nexus-dim shrink-0">

                    <ExternalLink className="w-4 h-4" />

                  </button>

                )}

              </div>

            ))

          )}

        </div>

      </div>

    </div>

  );

}


