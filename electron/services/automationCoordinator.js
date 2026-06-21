/**
 * Global automation run state + log ring buffer (TruwasNexus-style status/logs)
 */
const MAX_LOGS = 500;

const state = {
  active: false,
  mode: null,
  startedAt: null,
  stats: { active: 0, success: 0, errors: 0 },
  logs: [],
};

function pushLog(entry) {
  const line = {
    time: new Date().toISOString(),
    level: entry.level || 'info',
    text: entry.text || String(entry.message || entry),
    ...entry,
  };
  state.logs.push(line);
  if (state.logs.length > MAX_LOGS) {
    state.logs.splice(0, state.logs.length - MAX_LOGS);
  }
  return line;
}

function setRunning(active, mode = null) {
  state.active = active;
  state.mode = active ? mode : null;
  state.startedAt = active ? new Date().toISOString() : null;
  if (!active) state.stats.active = 0;
}

function bumpStat(key, delta = 1) {
  state.stats[key] = (state.stats[key] || 0) + delta;
}

function resetStats() {
  state.stats = { active: 0, success: 0, errors: 0 };
}

function getStatus() {
  return {
    active: state.active,
    mode: state.mode,
    startedAt: state.startedAt,
    stats: { ...state.stats },
  };
}

function getLogs(limit = 200) {
  return state.logs.slice(-limit);
}

function clearLogs() {
  state.logs = [];
}

module.exports = {
  pushLog,
  setRunning,
  bumpStat,
  resetStats,
  getStatus,
  getLogs,
  clearLogs,
};
