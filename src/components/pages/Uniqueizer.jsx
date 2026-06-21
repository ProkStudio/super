import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Wand2 } from 'lucide-react';
import useUniqueizerProcessing from '../../hooks/useUniqueizerProcessing';
import DropZone from '../uniqueizer/DropZone';
import CopySlider from '../uniqueizer/CopySlider';
import BatchToggle from '../uniqueizer/BatchToggle';
import ToggleSwitch from '../uniqueizer/ToggleSwitch';
import AdversarialToggle from '../uniqueizer/AdversarialToggle';
import AdvancedPanel from '../uniqueizer/AdvancedPanel';
import OutputSettings from '../uniqueizer/OutputSettings';
import ProgressSection from '../uniqueizer/ProgressSection';
import TerminalLog from '../uniqueizer/TerminalLog';
import Toast from '../uniqueizer/Toast';
import PageHeader from '../layout/PageHeader';

export default function Uniqueizer() {
  const { t } = useTranslation();
  const {
    videos,
    batchMode,
    setBatchMode,
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
  } = useUniqueizerProcessing();

  const canStart = videos.length > 0 && !isProcessing;
  const showCancel = isProcessing;

  useEffect(() => {
    const prevent = (e) => { e.preventDefault(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <PageHeader icon={Wand2} title={t('nav.uniqueizer')} className="shrink-0" />

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div
          className={`grid gap-3 max-w-6xl ${
            manualMode && advancedOpen ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'
          }`}
        >
          <DropZone
            videos={videos}
            batchMode={batchMode}
            onFilesSelected={loadVideos}
            disabled={isProcessing}
          />

          <div className="flex flex-col gap-2.5 min-w-0">
            <BatchToggle enabled={batchMode} onChange={setBatchMode} disabled={isProcessing} />
            <CopySlider value={numCopies} onChange={setNumCopies} disabled={isProcessing} />
            <ToggleSwitch enabled={maxMode} onChange={setMaxMode} disabled={isProcessing} />
            <AdversarialToggle
              enabled={adversarial}
              onChange={setAdversarial}
              disabled={isProcessing}
              pythonAvailable={pythonStatus?.available}
              depsInstalled={pythonStatus?.adversarialDeps}
            />
            <OutputSettings
              useCustomOutputDir={outputSettings.useCustomOutputDir}
              onUseCustomOutputDirChange={(v) => updateOutputSetting('useCustomOutputDir', v)}
              customOutputDir={outputSettings.customOutputDir}
              onPickOutputDir={pickOutputDir}
              subfolderPerVideo={outputSettings.subfolderPerVideo}
              onSubfolderPerVideoChange={(v) => updateOutputSetting('subfolderPerVideo', v)}
              filenamePattern={outputSettings.filenamePattern}
              onFilenamePatternChange={(v) => updateOutputSetting('filenamePattern', v)}
              filenamePrefix={outputSettings.filenamePrefix}
              onFilenamePrefixChange={(v) => updateOutputSetting('filenamePrefix', v)}
              lastOutputDir={lastOutputDir || outputSettings.customOutputDir}
              onOpenOutputFolder={openOutputFolder}
              savedPresets={savedPresets}
              onRefreshPresets={refreshPresets}
              presetName={presetName}
              onPresetNameChange={setPresetName}
              onSavePreset={savePreset}
              onLoadPreset={loadPreset}
              onDeletePreset={deletePreset}
              disabled={isProcessing}
            />
            <AdvancedPanel
              open={advancedOpen}
              onToggleOpen={() => setAdvancedOpen((o) => !o)}
              adversarial={adversarial}
              onAdversarialChange={setAdversarial}
              adversarialLevel={adversarialLevel}
              onAdversarialLevelChange={setAdversarialLevel}
              faceEnhance={faceEnhance}
              onFaceEnhanceChange={setFaceEnhance}
              movingOverlayMode={movingOverlayMode}
              onMovingOverlayModeChange={setMovingOverlayMode}
              fpsJitterMode={fpsJitterMode}
              onFpsJitterModeChange={setFpsJitterMode}
              manualMode={manualMode}
              onManualModeChange={setManualMode}
              catalog={catalog}
              customPreset={customPreset}
              recommended={recommended}
              onMethodToggle={handleMethodToggle}
              onParamChange={handleParamChange}
              onResetPreset={resetToPreset}
              pythonStatus={pythonStatus}
              disabled={isProcessing}
            />
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t pt-3 space-y-2" style={{ borderColor: 'var(--nexus-border)' }}>
        <ProgressSection
          totalProgress={totalProgress}
          copyProgress={copyProgress}
          currentLabel={currentLabel}
          isProcessing={isProcessing}
        />

        <div className="flex gap-2">
          {!showCancel ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={startProcessing}
              disabled={!canStart}
              className={`flex-1 py-2.5 rounded-xl font-semibold text-sm tracking-wide transition-all ${
                canStart
                  ? 'text-white border hover:shadow-accent-glow'
                  : 'bg-nexus-card text-nexus-dim border cursor-not-allowed opacity-50'
              }`}
              style={canStart ? { background: 'var(--nexus-accent)', borderColor: 'var(--nexus-accent)' } : { borderColor: 'var(--nexus-border)' }}
            >
              {batchMode && videos.length > 1
                ? `▶ СТАРТ (${videos.length} видео)`
                : '▶ СТАРТ УНИКАЛИЗАЦИИ'}
            </motion.button>
          ) : (
            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={cancelProcessing}
              disabled={isCancelling}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-red-500/10 text-red-400 border border-red-500/40 hover:bg-red-500/20 transition-all disabled:opacity-60"
            >
              {isCancelling ? '⏳ ОСТАНОВКА…' : '■ ОТМЕНА'}
            </motion.button>
          )}
        </div>

        <div className="h-[150px] rounded-lg border overflow-hidden nexus-card" style={{ borderColor: 'var(--nexus-border)' }}>
          <TerminalLog logs={logs} />
        </div>
      </div>

      <Toast
        visible={toast.visible}
        message={toast.message}
        outputDir={toast.outputDir}
        onClose={closeToast}
        onOpenFolder={openOutputFolder}
      />
    </div>
  );
}
