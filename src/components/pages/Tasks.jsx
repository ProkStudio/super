import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ListChecks, RefreshCw, Plus, Play, Archive, Briefcase, Pencil, Trash2, Loader2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import TaskCreateModal from '../tasks/TaskCreateModal';
import { MODE_MAP } from '../../constants/taskModes';
import PageHeader from '../layout/PageHeader';

export default function Tasks() {
  const { t } = useTranslation();
  const { showToast } = useAppStore();
  const [tasks, setTasks] = useState({ active: [], archive: [] });
  const [tab, setTab] = useState('active');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await window.nexusAPI?.getTasks();
    setTasks(res || { active: [], archive: [] });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unsub = window.nexusAPI?.onTasksStatus?.((data) => {
      if (data?.status === 'completed') {
        setRunningId(null);
        load();
        showToast(t('tasks.completed', { ok: data.successCount || 0, fail: data.failCount || 0 }));
      }
    });
    return () => unsub?.();
  }, [load, showToast, t]);

  const saveTask = async (form) => {
    if (editTask) {
      const next = {
        ...tasks,
        active: tasks.active.map((item) => (
          item.id === editTask.id ? { ...item, ...form } : item
        )),
      };
      await window.nexusAPI?.setTasks(next);
      setTasks(next);
      showToast(t('tasks.updated'));
    } else {
      const task = {
        id: `task-${Date.now()}`,
        ...form,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      const next = { ...tasks, active: [...tasks.active, task] };
      await window.nexusAPI?.setTasks(next);
      setTasks(next);
      showToast(t('tasks.created'));
    }
    setEditTask(null);
  };

  const runTask = async (task) => {
    setRunningId(task.id);
    const res = await window.nexusAPI?.runTask(task.id);
    if (!res?.ok) {
      setRunningId(null);
      showToast(res?.error || t('tasks.runFailed'));
      return;
    }
    await load();
    setRunningId(null);
  };

  const deleteTask = async (task) => {
    const next = tab === 'active'
      ? { ...tasks, active: tasks.active.filter((x) => x.id !== task.id) }
      : { ...tasks, archive: tasks.archive.filter((x) => x.id !== task.id) };
    await window.nexusAPI?.setTasks(next);
    setTasks(next);
    showToast(t('tasks.deleted'));
  };

  const openCreate = () => {
    setEditTask(null);
    setModalOpen(true);
  };

  const openEdit = (task) => {
    setEditTask(task);
    setModalOpen(true);
  };

  const list = tab === 'active' ? tasks.active : tasks.archive;

  const chainLabel = (chain) => (chain || [])
    .map((id) => t(`automation.modes.${id}`, { defaultValue: id }))
    .join(' → ');

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <PageHeader
        icon={ListChecks}
        title={t('tasks.title')}
        description={t('tasks.subtitle')}
        className="shrink-0"
        actions={(
          <>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm hover:bg-white/5"
            style={{ borderColor: 'var(--nexus-border)' }}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500"
          >
            <Plus className="w-4 h-4" />
            {t('tasks.createTask')}
          </button>
          </>
        )}
      />

      <div className="flex gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setTab('active')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition ${
            tab === 'active' ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'border-transparent text-nexus-dim hover:bg-white/5'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          {t('tasks.activeTab')}
        </button>
        <button
          type="button"
          onClick={() => setTab('archive')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm border transition ${
            tab === 'archive' ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'border-transparent text-nexus-dim hover:bg-white/5'
          }`}
        >
          <Archive className="w-4 h-4" />
          {t('tasks.archiveTab')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {list.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[240px] text-center">
            <p className="text-lg text-nexus-dim">{t('tasks.empty')}</p>
            <p className="text-sm text-nexus-dim/70 mt-1">{t('tasks.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map((task) => (
              <div key={task.id} className="nexus-card p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{task.name}</div>
                  <div className="text-xs text-nexus-dim mt-0.5 truncate">
                    {chainLabel(task.chain)} · {t('tasks.profileCount', { count: task.profileIds?.length || 0 })}
                  </div>
                  {task.scheduleEnabled && tab === 'active' && (
                    <div className="text-xs text-purple-400/80 mt-0.5">
                      {task.repeatDaily ? t('tasks.scheduledDaily', { time: task.scheduleTime || task.time }) : t('tasks.scheduledOnce', { time: task.scheduleTime || task.time, date: task.scheduleDate })}
                    </div>
                  )}
                  {task.completedAt && (
                    <div className="text-xs mt-1">
                      <span className="text-emerald-400">✓ {task.successCount ?? 0}</span>
                      {' · '}
                      <span className="text-red-400">✗ {task.failCount ?? 0}</span>
                    </div>
                  )}
                  {task.chain?.length > 0 && tab === 'active' && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {task.chain.map((modeId, i) => {
                        const mode = MODE_MAP[modeId];
                        const Icon = mode?.icon;
                        return (
                          <span key={`${modeId}-${i}`} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${mode?.border || ''}`}>
                            {Icon && <Icon className="w-3 h-3" />}
                            {i + 1}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {tab === 'active' && (
                    <>
                      <button
                        type="button"
                        onClick={() => runTask(task)}
                        disabled={runningId === task.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-sm hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {runningId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        {t('tasks.run')}
                      </button>
                      <button type="button" onClick={() => openEdit(task)} className="p-2 rounded-lg hover:bg-white/5 text-nexus-dim">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => deleteTask(task)} className="p-2 rounded-lg hover:bg-red-500/10 text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <TaskCreateModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTask(null); }}
        onSave={saveTask}
        editTask={editTask}
      />
    </div>
  );
}
