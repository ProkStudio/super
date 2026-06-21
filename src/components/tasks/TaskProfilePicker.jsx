import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { getProfileName } from '../automation/ProfileSelector';

function getProfileFolderId(p) {
  return p.profileFolder?.id || p.folderId || null;
}

export default function TaskProfilePicker({
  profiles,
  folders,
  selectedIds,
  onChange,
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [folderId, setFolderId] = useState('all');

  const visible = useMemo(() => {
    if (folderId === 'all') return profiles;
    return profiles.filter((p) => getProfileFolderId(p) === folderId);
  }, [profiles, folderId]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedInVisible = visible.filter((p) => selectedSet.has(p.id)).length;
  const allVisibleSelected = visible.length > 0 && selectedInVisible === visible.length;

  const toggle = (id) => {
    if (selectedSet.has(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  const toggleAll = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(visible.map((p) => p.id));
      onChange(selectedIds.filter((id) => !visibleIds.has(id)));
    } else {
      const merged = new Set([...selectedIds, ...visible.map((p) => p.id)]);
      onChange([...merged]);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden" style={{ borderColor: 'var(--nexus-border)' }}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] text-left"
      >
        <ChevronDown className={`w-4 h-4 text-nexus-dim transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        <span className="text-sm font-medium">{t('tasks.linkedProfiles', { count: selectedIds.length })}</span>
        <select
          className="nexus-input text-xs py-1 ml-auto max-w-[140px]"
          value={folderId}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setFolderId(e.target.value)}
        >
          <option value="all">{t('tasks.allFolders')}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.folderName}</option>
          ))}
        </select>
      </button>

      {!collapsed && (
        <div className="border-t px-3 py-2 space-y-2 max-h-40 overflow-y-auto custom-scrollbar" style={{ borderColor: 'var(--nexus-border)' }}>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} />
            {t('tasks.selectAll', { count: selectedInVisible })}
          </label>

          {selectedIds.length === 0 && visible.length === 0 && (
            <p className="text-xs text-nexus-dim py-4 text-center">{t('tasks.noProfilesLinked')}</p>
          )}

          {selectedIds.length === 0 && visible.length > 0 && (
            <p className="text-xs text-nexus-dim py-2">{t('tasks.noProfilesHint')}</p>
          )}

          {visible.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5 hover:bg-white/[0.02] rounded px-1">
              <input type="checkbox" checked={selectedSet.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="truncate flex-1">{getProfileName(p)}</span>
              <span className="text-nexus-dim truncate max-w-[80px]">{p.profileFolder?.folderName || '—'}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
