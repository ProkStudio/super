/**
 * Хук уникализатора — связь UI с IPC Nexus Toolkit.
 */
import { useState, useEffect, useCallback } from 'react';
import { fireConfetti } from '../components/uniqueizer/Confetti';

let logIdCounter = 0;

const LS_KEY = 'nexus_uniqueizer_output';

function getElectronAPI() {
  const n = window.nexusAPI;
  if (!n) return null;
  return {
    getPathForFile: (file) => n.getPathForFile?.(file),
    selectVideoFile: () => n.selectUniqueizerVideo?.(),
    selectVideoFiles: () => n.selectUniqueizerVideos?.(),
    probeVideo: (path) => n.probeUniqueizerMedia?.(path),
    startProcessing: (opts) => n.runUniqueizer?.(opts),
    cancelProcessing: () => n.cancelUniqueizer?.(),
    openPath: (dir) => n.openPath?.(dir),
    selectOutputDir: () => n.selectUniqueizerOutputDir?.(),
    listUserPresets: () => n.listUniqueizerPresets?.(),
    saveUserPreset: (name, data) => n.saveUniqueizerPreset?.(name, data),
    loadUserPreset: (name) => n.loadUniqueizerPreset?.(name),
    deleteUserPreset: (name) => n.deleteUniqueizerPreset?.(name),
    getMethodCatalog: () => n.getUniqueizerCatalog?.(),
    getRecommendedDefaults: (maxMode) => n.getUniqueizerRecommended?.(maxMode),
    getPresetDefaults: (maxMode) => n.getUniqueizerDefaults?.(maxMode),
    getPythonStatus: () => n.getUniqueizerPythonStatus?.(),
    installPythonDeps: () => n.installUniqueizerPythonDeps?.(),
    onLog: (cb) => n.onUniqueizerLog?.(cb),
    onCopyProgress: (cb) => n.onUniqueizerCopyProgress?.(cb),
    onTotalProgress: (cb) => n.onUniqueizerTotalProgress?.(cb),
    onCopyDone: (cb) => n.onUniqueizerCopyDone?.(cb),
    onAllDone: (cb) => n.onUniqueizerAllDone?.(cb),
    onError: (cb) => n.onUniqueizerError?.(cb),
    onProcessingStarted: (cb) => n.onUniqueizerStarted?.(cb),
    onProcessingStopped: (cb) => n.onUniqueizerStopped?.(cb),
  };
}

function loadOutputSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    useCustomOutputDir: false,
    customOutputDir: '',
    subfolderPerVideo: false,
    filenamePattern: 'unique_n',
    filenamePrefix: 'уник',
  };
}

function emptyCustomPreset() {
  return { enabledMethods: {} };
}

export default function useUniqueizerProcessing() {
  const [videos, setVideos] = useState([]);
  const [batchMode, setBatchMode] = useState(false);
  const [numCopies, setNumCopies] = useState(3);
  const [maxMode, setMaxMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [totalProgress, setTotalProgress] = useState(0);
  const [copyProgress, setCopyProgress] = useState(0);
  const [currentLabel, setCurrentLabel] = useState('');
  const [logs, setLogs] = useState([]);
  const [toast, setToast] = useState({ visible: false, message: '', outputDir: '' });
  const [lastOutputDir, setLastOutputDir] = useState('');

  const [outputSettings, setOutputSettings] = useState(loadOutputSettings);
  const [savedPresets, setSavedPresets] = useState([]);
  const [presetName, setPresetName] = useState('');

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [adversarial, setAdversarial] = useState(false);
  const [adversarialLevel, setAdversarialLevel] = useState('medium');
  const [faceEnhance, setFaceEnhance] = useState(false);
  const [movingOverlayMode, setMovingOverlayMode] = useState('auto');
  const [fpsJitterMode, setFpsJitterMode] = useState('auto');
  const [manualMode, setManualMode] = useState(false);
  const [customPreset, setCustomPreset] = useState(emptyCustomPreset);
  const [catalog, setCatalog] = useState([]);
  const [recommended, setRecommended] = useState({});
  const [pythonStatus, setPythonStatus] = useState({
    available: false,
    adversarialDeps: false,
    faceDeps: false,
  });

  const persistOutputSettings = useCallback((next) => {
    setOutputSettings(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  }, []);

  const addLog = useCallback((text, level = 'info') => {
    setLogs((prev) => [
      ...prev.slice(-200),
      { id: ++logIdCounter, text, level, timestamp: Date.now() },
    ]);
  }, []);

  const refreshPresets = useCallback(async () => {
    const list = await getElectronAPI()?.listUserPresets?.();
    if (list) setSavedPresets(list);
  }, []);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;
    api.getMethodCatalog?.().then((data) => {
      if (data?.catalog) setCatalog(data.catalog);
    });
    api.getPythonStatus?.().then((status) => {
      if (status) setPythonStatus(status);
    });
    refreshPresets();
  }, [refreshPresets]);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.getRecommendedDefaults) return;
    api.getRecommendedDefaults(maxMode).then((defs) => {
      if (defs) {
        setRecommended(defs);
        if (!manualMode) {
          api.getPresetDefaults?.(maxMode).then((preset) => {
            if (preset) {
              setCustomPreset({
                enabledMethods: { ...preset.enabledMethods },
                ...defs,
              });
            }
          });
        }
      }
    });
  }, [maxMode, manualMode]);

  const loadVideos = useCallback(async (paths, errorMsg) => {
    if (!paths?.length) {
      if (errorMsg) addLog(errorMsg, 'error');
      return;
    }

    addLog(`Загрузка: ${paths.length} файл(ов)…`, 'info');
    const results = await Promise.all(
      paths.map((p) => getElectronAPI()?.probeVideo(p))
    );

    const loaded = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const name = paths[i].split(/[/\\]/).pop();
      if (r?.ok) {
        loaded.push(r.data);
        const info = r.data.isImage
          ? `${r.data.mediaLabel}, ${r.data.resolution}`
          : `${r.data.resolution}, ${r.data.durationFormatted}`;
        addLog(`✓ ${name}: ${info}`, 'success');
      } else {
        addLog(`✗ ${name}: ${r?.error || 'ошибка'}`, 'error');
      }
    }

    if (loaded.length) {
      setVideos(loaded);
    } else {
      setVideos([]);
      addLog('Не удалось загрузить видео', 'error');
    }
  }, [addLog]);

  const toggleBatchMode = useCallback((enabled) => {
    setBatchMode(enabled);
    if (!enabled && videos.length > 1) {
      setVideos((prev) => prev.slice(0, 1));
      addLog('Пакетный режим выкл — оставлено 1 видео', 'info');
    }
  }, [videos.length, addLog]);

  const pickOutputDir = useCallback(async () => {
    const dir = await getElectronAPI()?.selectOutputDir?.();
    if (dir) {
      persistOutputSettings({ ...outputSettings, customOutputDir: dir, useCustomOutputDir: true });
      addLog(`Папка вывода: ${dir}`, 'info');
    }
  }, [outputSettings, persistOutputSettings, addLog]);

  const featureOverrides = {
    movingOverlay: movingOverlayMode === 'auto' ? null : movingOverlayMode === 'on',
    fpsJitter: fpsJitterMode === 'auto' ? null : fpsJitterMode === 'on',
  };

  const buildSettingsSnapshot = useCallback(() => ({
    maxMode,
    numCopies,
    batchMode,
    adversarial,
    adversarialLevel,
    faceEnhance,
    movingOverlayMode,
    fpsJitterMode,
    manualMode,
    customPreset,
    outputSettings,
  }), [
    maxMode, numCopies, batchMode, adversarial, adversarialLevel, faceEnhance,
    movingOverlayMode, fpsJitterMode, manualMode, customPreset, outputSettings,
  ]);

  const applySettingsSnapshot = useCallback((snap) => {
    if (!snap) return;
    if (snap.maxMode !== undefined) setMaxMode(snap.maxMode);
    if (snap.numCopies !== undefined) setNumCopies(snap.numCopies);
    if (snap.batchMode !== undefined) setBatchMode(snap.batchMode);
    if (snap.adversarial !== undefined) setAdversarial(snap.adversarial);
    if (snap.adversarialLevel) setAdversarialLevel(snap.adversarialLevel);
    if (snap.faceEnhance !== undefined) setFaceEnhance(snap.faceEnhance);
    if (snap.movingOverlayMode) setMovingOverlayMode(snap.movingOverlayMode);
    if (snap.fpsJitterMode) setFpsJitterMode(snap.fpsJitterMode);
    if (snap.manualMode !== undefined) setManualMode(snap.manualMode);
    if (snap.customPreset) setCustomPreset(snap.customPreset);
    if (snap.outputSettings) persistOutputSettings(snap.outputSettings);
    addLog(`Пресет «${snap.name || 'без имени'}» загружен`, 'success');
  }, [persistOutputSettings, addLog]);

  const savePreset = useCallback(async () => {
    const name = presetName.trim();
    if (!name) return;
    const result = await getElectronAPI()?.saveUserPreset?.(name, buildSettingsSnapshot());
    if (result?.ok) {
      addLog(`Пресет «${result.name}» сохранён`, 'success');
      await refreshPresets();
    } else {
      addLog(`Ошибка сохранения: ${result?.error}`, 'error');
    }
  }, [presetName, buildSettingsSnapshot, addLog, refreshPresets]);

  const loadPreset = useCallback(async (name) => {
    const result = await getElectronAPI()?.loadUserPreset?.(name);
    if (result?.ok) {
      applySettingsSnapshot({ ...result.data, name });
      setPresetName(name);
    } else {
      addLog(result?.error || 'Не удалось загрузить пресет', 'error');
    }
  }, [applySettingsSnapshot, addLog]);

  const deletePreset = useCallback(async (name) => {
    await getElectronAPI()?.deleteUserPreset?.(name);
    addLog(`Пресет «${name}» удалён`, 'info');
    await refreshPresets();
  }, [addLog, refreshPresets]);

  const startProcessing = useCallback(async () => {
    if (!videos.length || isProcessing) return;

    if (outputSettings.useCustomOutputDir && !outputSettings.customOutputDir) {
      addLog('Выберите папку вывода или отключите «Своя папка»', 'error');
      return;
    }

    setIsProcessing(true);
    setIsCancelling(false);
    setTotalProgress(0);
    setCopyProgress(0);
    setCurrentLabel(videos.length > 1 ? 'Видео 1' : 'Копия 1');
    addLog('Запуск обработки…', 'info');

    const result = await getElectronAPI()?.startProcessing({
      inputPaths: videos.map((v) => v.path),
      numCopies,
      maxMode,
      batchMode: batchMode || videos.length > 1,
      adversarial,
      adversarialLevel,
      faceEnhance,
      manualMode,
      customPreset: manualMode ? customPreset : null,
      featureOverrides,
      outputOptions: outputSettings,
    });

    if (result && !result.ok) {
      addLog(`Ошибка запуска: ${result.error}`, 'error');
      setIsProcessing(false);
    }
  }, [
    videos, isProcessing, numCopies, maxMode, batchMode, addLog,
    adversarial, adversarialLevel, faceEnhance, manualMode, customPreset,
    featureOverrides, outputSettings,
  ]);

  const cancelProcessing = useCallback(async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    addLog('Запрос отмены…', 'info');
    await getElectronAPI()?.cancelProcessing();
  }, [isCancelling, addLog]);

  const handleMethodToggle = useCallback((key, enabled) => {
    setCustomPreset((prev) => ({
      ...prev,
      enabledMethods: { ...prev.enabledMethods, [key]: enabled },
    }));
  }, []);

  const handleParamChange = useCallback((_methodKey, paramKey, value) => {
    setCustomPreset((prev) => ({
      ...prev,
      [paramKey]: value === '' ? undefined : value,
    }));
  }, []);

  const resetToPreset = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.getPresetDefaults) return;
    const preset = await api.getPresetDefaults(maxMode);
    const defs = await api.getRecommendedDefaults(maxMode);
    if (preset && defs) {
      setCustomPreset({
        enabledMethods: { ...preset.enabledMethods },
        ...defs,
      });
      addLog('Параметры сброшены к пресету', 'info');
    }
  }, [maxMode, addLog]);

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    const unsubs = [
      api.onLog(({ text, level }) => addLog(text, level)),
      api.onCopyProgress(({ label, percent }) => {
        if (label) setCurrentLabel(label);
        setCopyProgress(percent);
      }),
      api.onTotalProgress(({ percent }) => setTotalProgress(percent)),
      api.onCopyDone(({ label, outputPath }) => {
        addLog(`${label}: сохранено → ${outputPath.split(/[/\\]/).pop()}`, 'success');
      }),
      api.onAllDone(({ outputDir, totalVideos, successCount }) => {
        fireConfetti();
        if (outputDir) setLastOutputDir(outputDir);
        setToast({
          visible: true,
          message: totalVideos > 1
            ? `Готово! ${successCount} задач (${totalVideos} видео)`
            : 'Обработка завершена!',
          outputDir,
        });
      }),
      api.onError(({ message }) => addLog(message, 'error')),
      api.onProcessingStarted(() => setIsProcessing(true)),
      api.onProcessingStopped(() => {
        setIsProcessing(false);
        setIsCancelling(false);
        setCurrentLabel('');
      }),
    ];

    return () => unsubs.forEach((fn) => fn?.());
  }, [addLog]);

  const openOutputFolder = useCallback(async () => {
    const dir = lastOutputDir || toast.outputDir
      || (outputSettings.useCustomOutputDir ? outputSettings.customOutputDir : '');
    if (dir) {
      await getElectronAPI()?.openPath(dir);
    }
  }, [lastOutputDir, toast.outputDir, outputSettings]);

  const closeToast = useCallback(() => {
    setToast((t) => ({ ...t, visible: false }));
  }, []);

  const updateOutputSetting = useCallback((key, value) => {
    persistOutputSettings({ ...outputSettings, [key]: value });
  }, [outputSettings, persistOutputSettings]);

  return {
    videos,
    batchMode,
    setBatchMode: toggleBatchMode,
    numCopies,
    setNumCopies,
    maxMode,
    setMaxMode,
    isProcessing,
    isCancelling,
    totalProgress,
    copyProgress,
    currentLabel,
    logs,
    toast,
    loadVideos,
    startProcessing,
    cancelProcessing,
    openOutputFolder,
    closeToast,
    advancedOpen,
    setAdvancedOpen,
    adversarial,
    setAdversarial,
    adversarialLevel,
    setAdversarialLevel,
    faceEnhance,
    setFaceEnhance,
    movingOverlayMode,
    setMovingOverlayMode,
    fpsJitterMode,
    setFpsJitterMode,
    manualMode,
    setManualMode,
    customPreset,
    catalog,
    recommended,
    pythonStatus,
    handleMethodToggle,
    handleParamChange,
    resetToPreset,
    outputSettings,
    updateOutputSetting,
    pickOutputDir,
    lastOutputDir,
    savedPresets,
    refreshPresets,
    presetName,
    setPresetName,
    savePreset,
    loadPreset,
    deletePreset,
  };
}
