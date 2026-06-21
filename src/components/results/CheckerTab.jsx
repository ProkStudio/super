import { useTranslation } from 'react-i18next';
import {
  BarChart3, Eye, ThumbsUp, MessageCircle, Youtube, ShieldAlert, Check,
  AlertTriangle, Ban, Loader2,
} from 'lucide-react';
import { formatNumber } from '../../lib/formatters';
import { computeBlockStats, groupVideos } from '../../lib/blockStats';
import VideoRow from './VideoRow';

function StatCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="nexus-card px-4 py-3 min-w-[100px]">
      <div className="text-[10px] uppercase tracking-wide text-nexus-dim mb-1">{label}</div>
      <div className={`text-xl font-bold font-mono flex items-center gap-2 ${accent || ''}`}>
        {Icon && <Icon className="w-4 h-4 opacity-70" />}
        {value}
      </div>
    </div>
  );
}

function VideoSection({ title, icon: Icon, color, videos, statusLabel, statusColor, onOpenUrl }) {
  if (!videos.length) return null;
  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-2 px-1 py-2 text-sm font-medium ${color}`}>
        <Icon className="w-4 h-4" />
        {title}
      </div>
      <div className="nexus-card overflow-hidden">
        {videos.map((v, i) => (
          <VideoRow
            key={v.id || i}
            video={v}
            dimmed={!!statusLabel}
            statusLabel={statusLabel}
            statusColor={statusColor}
            onOpen={onOpenUrl}
          />
        ))}
      </div>
    </div>
  );
}

export default function CheckerTab({
  blocks,
  selectedBlockId,
  onSelectBlock,
  onRunChecker,
  onRunAllChecker,
  onCancelChecker,
  checking,
  progress,
  onOpenUrl,
}) {
  const { t } = useTranslation();
  const block = blocks.find((b) => b.id === selectedBlockId);
  const videos = block?.videos || [];
  const stats = computeBlockStats(videos);
  const groups = groupVideos(videos);

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
      <div className="nexus-card p-4 flex items-end gap-3 shrink-0 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-nexus-dim block mb-1">{t('results.selectBlock')}</label>
          <select
            className="nexus-input w-full"
            value={selectedBlockId}
            onChange={(e) => onSelectBlock(e.target.value)}
          >
            <option value="">{t('results.selectBlockPlaceholder')}</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({t('results.videoCount', { count: b.videos?.length || 0 })})
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={onRunChecker}
          disabled={checking || !selectedBlockId || !videos.length}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-40 shadow-[0_0_20px_rgba(147,51,234,0.25)]"
        >
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
          {t('results.runChecker')}
        </button>
        <button
          type="button"
          onClick={onRunAllChecker}
          disabled={checking || !blocks.length}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border hover:bg-white/5 disabled:opacity-40"
          style={{ borderColor: 'var(--nexus-border)' }}
        >
          {t('results.checkAllBlocks')}
        </button>
        {checking && (
          <>
            <div className="w-full sm:w-32 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <button
              type="button"
              onClick={onCancelChecker}
              className="px-3 py-2 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              {t('results.cancelChecker')}
            </button>
          </>
        )}
      </div>

      {block && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 shrink-0">
            <StatCard label={t('results.totalLinks')} value={stats.totalLinks} />
            <StatCard label={t('results.checked')} value={stats.checked} accent="text-emerald-400" />
            <StatCard label={t('results.totalViews')} value={formatNumber(stats.totalViews)} icon={Eye} />
            <StatCard label={t('results.totalLikes')} value={formatNumber(stats.totalLikes)} icon={ThumbsUp} />
            <StatCard label={t('results.totalComments')} value={formatNumber(stats.totalComments)} icon={MessageCircle} />
            <StatCard label={t('results.zeroViews')} value={stats.zeroViews} icon={Youtube} accent="text-red-400" />
            <StatCard label={t('results.ageRestricted')} value={stats.ageRestricted} icon={ShieldAlert} accent="text-orange-400" />
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 min-h-0">
            <VideoSection
              title={t('results.activeVideos', { count: groups.active.length })}
              icon={Check}
              color="text-emerald-400"
              videos={groups.active}
              onOpenUrl={onOpenUrl}
            />
            <VideoSection
              title={t('results.unavailableVideos', { count: groups.unavailable.length })}
              icon={AlertTriangle}
              color="text-yellow-400"
              videos={groups.unavailable}
              statusLabel={t('results.statusUnavailable')}
              statusColor="text-yellow-400"
              onOpenUrl={onOpenUrl}
            />
            <VideoSection
              title={t('results.bannedVideos', { count: groups.banned.length })}
              icon={Ban}
              color="text-red-400"
              videos={groups.banned}
              statusLabel={t('results.statusBanned')}
              statusColor="text-red-400"
              onOpenUrl={onOpenUrl}
            />
            {groups.pending.length > 0 && (
              <VideoSection
                title={t('results.pendingVideos', { count: groups.pending.length })}
                icon={Loader2}
                color="text-nexus-dim"
                videos={groups.pending}
                statusLabel={t('results.statusPending')}
                statusColor="text-nexus-dim"
                onOpenUrl={onOpenUrl}
              />
            )}
            {!videos.length && (
              <p className="text-center text-nexus-dim py-12">{t('results.noVideosInBlock')}</p>
            )}
          </div>
        </>
      )}

      {!block && selectedBlockId && (
        <p className="text-center text-nexus-dim py-12">{t('results.blockNotFound')}</p>
      )}
      {!selectedBlockId && (
        <p className="text-center text-nexus-dim py-12">{t('results.selectBlockHint')}</p>
      )}
    </div>
  );
}
