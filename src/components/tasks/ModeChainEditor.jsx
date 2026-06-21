import { useTranslation } from 'react-i18next';
import { GripVertical, ChevronUp, ChevronDown, X } from 'lucide-react';
import { MODE_MAP, TASK_MODES } from '../../constants/taskModes';

export default function ModeChainEditor({ chain, onChange }) {
  const { t } = useTranslation();

  const addMode = (modeId) => {
    if (chain.includes(modeId)) return;
    onChange([...chain, modeId]);
  };

  const removeMode = (index) => {
    onChange(chain.filter((_, i) => i !== index));
  };

  const moveMode = (index, dir) => {
    const next = [...chain];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t('tasks.modeChain')}</p>

      <div className="rounded-xl border border-white/10 min-h-[120px] p-2 space-y-1" style={{ borderColor: 'var(--nexus-border)' }}>
        {chain.length === 0 ? (
          <p className="text-xs text-nexus-dim text-center py-8 px-4">{t('tasks.noModes')}</p>
        ) : (
          chain.map((modeId, index) => {
            const mode = MODE_MAP[modeId];
            if (!mode) return null;
            const Icon = mode.icon;
            return (
              <div
                key={`${modeId}-${index}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${mode.border}`}
              >
                <GripVertical className="w-4 h-4 opacity-40 shrink-0" />
                <span className="w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold bg-black/30">{index + 1}</span>
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-sm flex-1">{t(`automation.modes.${modeId}`)}</span>
                <button type="button" onClick={() => moveMode(index, -1)} disabled={index === 0} className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => moveMode(index, 1)} disabled={index === chain.length - 1} className="p-1 rounded hover:bg-white/10 disabled:opacity-30">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => removeMode(index)} className="p-1 rounded hover:bg-red-500/20 text-red-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {TASK_MODES.map(({ id, icon: Icon, border }) => (
          <button
            key={id}
            type="button"
            onClick={() => addMode(id)}
            disabled={chain.includes(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition disabled:opacity-30 ${border}`}
          >
            <span className="text-base leading-none">+</span>
            <Icon className="w-3.5 h-3.5" />
            {t(`automation.modes.${id}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
