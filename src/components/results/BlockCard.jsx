import { useTranslation } from 'react-i18next';
import {
  ChevronDown, Folder, Eye, ThumbsUp, MessageCircle,
  Pencil, Link2, Copy, Trash2, Calendar,
} from 'lucide-react';
import { formatNumber } from '../../lib/formatters';
import { computeBlockStats } from '../../lib/blockStats';
import VideoRow from './VideoRow';

export default function BlockCard({
  block,
  expanded,
  selected,
  onToggleExpand,
  onToggleSelect,
  onEdit,
  onCopyLinks,
  onDuplicate,
  onDelete,
  onOpenUrl,
}) {
  const { t } = useTranslation();
  const stats = computeBlockStats(block.videos);

  return (
    <div className="nexus-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-3 hover:bg-white/[0.02]">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="shrink-0"
        />
        <button type="button" onClick={onToggleExpand} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <ChevronDown className={`w-4 h-4 shrink-0 transition ${expanded ? '' : '-rotate-90'}`} />
          <Folder className="w-4 h-4 shrink-0 text-purple-400" />
          <span className="font-medium truncate">{block.name}</span>
          <span className="text-xs text-nexus-dim shrink-0">{t('results.videoCount', { count: block.videos?.length || 0 })}</span>
          <div className="hidden md:flex items-center gap-3 text-xs text-nexus-dim ml-2">
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(stats.totalViews)}</span>
            <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{formatNumber(stats.totalLikes)}</span>
            <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{formatNumber(stats.totalComments)}</span>
          </div>
          {block.lastChecked && (
            <span className="hidden lg:flex items-center gap-1 text-[10px] text-nexus-dim ml-auto shrink-0">
              <Calendar className="w-3 h-3" />
              {new Date(block.lastChecked).toLocaleString()}
            </span>
          )}
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={onEdit} className="p-2 rounded hover:bg-white/5 text-nexus-dim" title={t('results.editBlock')}>
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onCopyLinks} className="p-2 rounded hover:bg-white/5 text-nexus-dim" title={t('results.copyLinks')}>
            <Link2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onDuplicate} className="p-2 rounded hover:bg-white/5 text-nexus-dim" title={t('results.duplicateBlock')}>
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onDelete} className="p-2 rounded hover:bg-red-500/10 text-red-400" title={t('common.delete')}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {expanded && block.videos?.length > 0 && (
        <div className="bg-black/20">
          {block.videos.map((v, i) => (
            <VideoRow key={v.id || i} video={v} index={i + 1} onOpen={onOpenUrl} />
          ))}
        </div>
      )}
    </div>
  );
}
