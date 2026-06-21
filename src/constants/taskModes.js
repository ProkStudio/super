import { QrCode, LogIn, Flame, Settings2, Upload } from 'lucide-react';

export const TASK_MODES = [
  { id: 'scan_qr', icon: QrCode, color: 'cyan', border: 'border-cyan-500/50 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20' },
  { id: 'login', icon: LogIn, color: 'blue', border: 'border-blue-500/50 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20' },
  { id: 'warmup', icon: Flame, color: 'orange', border: 'border-orange-500/50 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20' },
  { id: 'channel_setup', icon: Settings2, color: 'purple', border: 'border-purple-500/50 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20' },
  { id: 'upload_video', icon: Upload, color: 'green', border: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20' },
];

export const MODE_MAP = Object.fromEntries(TASK_MODES.map((m) => [m.id, m]));

export const DEFAULT_TASK_FORM = {
  name: '',
  threads: 1,
  scheduleEnabled: false,
  scheduleTime: '12:00',
  scheduleDate: '',
  repeatDaily: false,
  sleepAfter: false,
  profileIds: [],
  chain: [],
  automationConfig: {},
};
