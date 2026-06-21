import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Moon, Minus, Plus } from 'lucide-react';
import Modal from '../ui/Modal';
import Toggle from '../ui/Toggle';
import TaskProfilePicker from './TaskProfilePicker';
import ModeChainEditor from './ModeChainEditor';
import { DEFAULT_TASK_FORM } from '../../constants/taskModes';

export default function TaskCreateModal({ open, onClose, onSave, editTask }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(DEFAULT_TASK_FORM);
  const [profiles, setProfiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editTask) {
      setForm({
        name: editTask.name || '',
        threads: editTask.threads || 1,
        scheduleEnabled: editTask.scheduleEnabled ?? false,
        scheduleTime: editTask.scheduleTime || editTask.time || '12:00',
        scheduleDate: editTask.scheduleDate || '',
        repeatDaily: editTask.repeatDaily ?? editTask.schedule === 'daily',
        sleepAfter: editTask.sleepAfter ?? false,
        profileIds: editTask.profileIds || [],
        chain: editTask.chain || [],
        automationConfig: editTask.automationConfig || {},
      });
    } else {
      setForm({ ...DEFAULT_TASK_FORM });
    }
  }, [open, editTask]);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      window.nexusAPI?.listProfiles(),
      window.nexusAPI?.listFolders(),
    ]).then(([profRes, foldRes]) => {
      if (profRes?.ok) setProfiles(profRes.profiles || []);
      if (foldRes?.ok) setFolders(foldRes.folders || []);
    });
  }, [open]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (!form.chain.length) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editTask ? t('tasks.editTask') : t('tasks.createTask')}
      wide
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs text-nexus-dim block mb-1">{t('tasks.taskName')}</label>
          <input
            className="nexus-input w-full"
            placeholder={t('tasks.taskNamePlaceholder')}
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-nexus-dim">{t('automation.threads')}</span>
          <button type="button" onClick={() => setField('threads', Math.max(1, form.threads - 1))} className="p-1.5 rounded-lg border hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-8 text-center font-mono text-sm">{form.threads}</span>
          <button type="button" onClick={() => setField('threads', form.threads + 1)} className="p-1.5 rounded-lg border hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: 'var(--nexus-border)' }}>
          <div className="flex items-center gap-3">
            <Toggle checked={form.scheduleEnabled} onChange={(v) => setField('scheduleEnabled', v)} />
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="text-sm">{t('tasks.onSchedule')}</span>
          </div>
          {form.scheduleEnabled && (
            <div className="grid grid-cols-2 gap-3 pl-1">
              <div>
                <label className="text-xs text-nexus-dim block mb-1">{t('tasks.time')}</label>
                <input type="time" className="nexus-input w-full" value={form.scheduleTime} onChange={(e) => setField('scheduleTime', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-nexus-dim block mb-1">{t('tasks.date')}</label>
                <input
                  className="nexus-input w-full"
                  placeholder={t('tasks.datePlaceholder')}
                  value={form.scheduleDate}
                  onChange={(e) => setField('scheduleDate', e.target.value)}
                />
              </div>
              <label className="col-span-2 flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={form.repeatDaily} onChange={(e) => setField('repeatDaily', e.target.checked)} />
                {t('tasks.repeatDaily')}
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Toggle checked={form.sleepAfter} onChange={(v) => setField('sleepAfter', v)} />
          <Moon className="w-4 h-4 text-purple-400" />
          <span className="text-sm">{t('tasks.sleepAfter')}</span>
        </div>

        <TaskProfilePicker
          profiles={profiles}
          folders={folders}
          selectedIds={form.profileIds}
          onChange={(ids) => setField('profileIds', ids)}
        />

        <ModeChainEditor chain={form.chain} onChange={(chain) => setField('chain', chain)} />

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border text-sm hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !form.name.trim() || !form.chain.length}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40"
          >
            {editTask ? t('common.save') : t('tasks.createTaskBtn')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
