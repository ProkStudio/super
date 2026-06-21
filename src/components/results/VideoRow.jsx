import {
  Eye, ThumbsUp, MessageCircle, ExternalLink, MoreHorizontal,
} from 'lucide-react';
import { formatNumber } from '../../lib/formatters';

function ProfileTag({ label, num, variant = 'default' }) {
  if (!label && num == null) return null;
  const colors = {
    default: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
    warning: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
    danger: 'text-red-400 border-red-500/30 bg-red-500/10',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${colors[variant]}`}>
      {label && <span>{label}</span>}
      {num != null && <span className="font-mono">{num}</span>}
    </span>
  );
}

export default function VideoRow({
  video,
  index,
  dimmed,
  statusLabel,
  statusColor,
  onOpen,
}) {
  const inactive = dimmed || video.status === 'unavailable' || video.status === 'ban';
  const tagVariant = video.status === 'ban' ? 'danger' : video.status === 'unavailable' ? 'warning' : 'default';

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-t text-sm ${inactive ? 'opacity-60' : ''}`} style={{ borderColor: 'var(--nexus-border)' }}>
      {index != null && (
        <span className="w-6 text-xs text-nexus-dim font-mono shrink-0">{index}</span>
      )}
      {video.thumbnail ? (
        <img src={video.thumbnail} alt="" className="w-14 h-10 rounded object-cover shrink-0 bg-zinc-800" />
      ) : (
        <div className="w-14 h-10 rounded bg-zinc-800 flex items-center justify-center shrink-0">
          <MoreHorizontal className="w-5 h-5 text-zinc-600" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${inactive ? 'line-through text-nexus-dim' : ''}`}>
          {video.title || '—'}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <ProfileTag label={video.profileLabel} num={video.profileNum} variant={tagVariant} />
          {video.url && (
            <a
              href={video.url}
              onClick={(e) => { e.preventDefault(); onOpen?.(video.url); }}
              className="text-[11px] text-nexus-dim hover:text-purple-400 truncate max-w-[280px]"
            >
              {video.url}
            </a>
          )}
        </div>
      </div>
      {statusLabel ? (
        <span className={`text-xs shrink-0 ${statusColor}`}>{statusLabel}</span>
      ) : (
        <div className="flex items-center gap-3 text-xs text-nexus-dim shrink-0">
          <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{formatNumber(video.views)}</span>
          <span className="flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" />{formatNumber(video.likes)}</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{formatNumber(video.comments)}</span>
        </div>
      )}
      {video.url && (
        <button type="button" onClick={() => onOpen?.(video.url)} className="p-1.5 rounded hover:bg-white/5 text-nexus-dim shrink-0">
          <ExternalLink className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
