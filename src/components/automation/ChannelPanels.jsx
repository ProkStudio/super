import { FolderOpen, Sparkles, Link2, ChevronDown, ImagePlus, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Toggle from '../ui/Toggle';

function ConfigBlock({ enabled, onToggle, title, icon: Icon, children, countLabel, alwaysOn }) {
  return (
    <div
      className={`rounded-xl border p-4 space-y-3 transition ${
        enabled ? 'border-pink-500/40 bg-pink-500/[0.04]' : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {!alwaysOn && <Toggle checked={enabled} onChange={onToggle} />}
          {Icon && <Icon className="w-4 h-4 text-pink-400 shrink-0" />}
          <span className="text-sm font-medium truncate">{title}</span>
        </div>
        {countLabel != null && (
          <span className="text-xs text-nexus-dim shrink-0">{countLabel}</span>
        )}
      </div>
      {enabled && children}
    </div>
  );
}

function AiRow({ aiCount, onAiCountChange, onFromFile, onAiGenerate, aiGenerating, aiLabel, fromFileLabel }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase text-nexus-dim">{aiLabel}</span>
      <div className="flex items-center gap-1 nexus-card px-2 py-0.5 rounded text-xs">
        <button type="button" onClick={() => onAiCountChange(Math.max(1, aiCount - 1))} className="px-1 hover:text-white">−</button>
        <span className="w-4 text-center font-mono">{aiCount}</span>
        <button type="button" onClick={() => onAiCountChange(aiCount + 1)} className="px-1 hover:text-white">+</button>
      </div>
      <button type="button" onClick={onFromFile} className="px-2 py-1 text-xs rounded border hover:bg-white/5" style={{ borderColor: 'var(--nexus-border)' }}>
        {fromFileLabel}
      </button>
      <button
        type="button"
        disabled={aiGenerating}
        onClick={onAiGenerate}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pink-500/30 text-pink-300 hover:bg-pink-500/10 disabled:opacity-50"
      >
        <Sparkles className="w-3 h-3" /> AI ({aiCount}){aiGenerating ? '…' : ''}
      </button>
    </div>
  );
}

function dirnameFromPath(filePath) {
  if (!filePath) return '';
  const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  return idx > 0 ? filePath.slice(0, idx) : filePath;
}

function MediaSourceField({
  folder,
  files,
  placeholder,
  folderTitle,
  filesTitle,
  onFolder,
  onFiles,
  fileCount,
  countSuffix,
  hint,
  selectedLabel,
  filesIcon: FilesIcon = ImagePlus,
}) {
  const selectedCount = files?.length || 0;

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center flex-wrap">
        <input className="nexus-input flex-1 min-w-[160px] text-sm py-2" placeholder={placeholder} value={folder} readOnly />
        <button
          type="button"
          onClick={onFolder}
          title={folderTitle}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border hover:bg-white/5 shrink-0 text-xs"
          style={{ borderColor: 'var(--nexus-border)' }}
        >
          <FolderOpen className="w-4 h-4 text-nexus-dim" />
        </button>
        <button
          type="button"
          onClick={onFiles}
          title={filesTitle}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-pink-500/30 text-pink-300 hover:bg-pink-500/10 shrink-0 text-xs"
        >
          <FilesIcon className="w-4 h-4" />
          <span>{filesTitle}</span>
        </button>
        {fileCount != null && (
          <span className="text-xs text-nexus-dim whitespace-nowrap">{fileCount} {countSuffix}</span>
        )}
      </div>
      {selectedCount > 0 && (
        <p className="text-[10px] text-pink-300/90">{selectedLabel}</p>
      )}
      {hint && <p className="text-[10px] text-nexus-dim leading-relaxed">{hint}</p>}
    </div>
  );
}

function ImageSourceField(props) {
  return <MediaSourceField {...props} filesIcon={ImagePlus} />;
}

export default function ChannelSetupPanel({ config, patchConfig, fileCounts, onAiGenerate, aiGenerating }) {
  const { t } = useTranslation();

  const loadTextFile = async (field) => {
    const content = await window.nexusAPI?.importTxt();
    if (content) patchConfig({ [field]: content });
  };

  const pickImageFolder = async (folderKey, filesKey, title) => {
    const p = await window.nexusAPI?.openFolder({ title });
    if (p) patchConfig({ [folderKey]: p, [filesKey]: [] });
  };

  const pickImageFiles = async (folderKey, filesKey, title) => {
    const paths = await window.nexusAPI?.openImages({ title });
    if (paths?.length) {
      patchConfig({
        [folderKey]: dirnameFromPath(paths[0]),
        [filesKey]: paths,
      });
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <ConfigBlock
        enabled={config.avatarsEnabled}
        onToggle={(v) => patchConfig({ avatarsEnabled: v })}
        title={t('automation.channel.avatars')}
        countLabel={fileCounts.avatar != null ? t('automation.channel.filesCount', { count: fileCounts.avatar }) : null}
      >
        <div className="flex items-center gap-3 mb-2">
          <Toggle checked={!!config.uniqualizeImages} onChange={(v) => patchConfig({ uniqualizeImages: v })} />
          <span className="text-xs text-nexus-dim">{t('automation.channel.uniqualizeImages')}</span>
        </div>
        <ImageSourceField
          folder={config.avatarFolder}
          files={config.avatarFiles}
          placeholder={t('automation.channel.selectFolder')}
          folderTitle={t('automation.channel.selectFolder')}
          filesTitle={t('automation.channel.selectPhotos')}
          hint={t('automation.channel.photosHint')}
          selectedLabel={t('automation.channel.selectedPhotos', { count: config.avatarFiles?.length || 0 })}
          onFolder={() => pickImageFolder('avatarFolder', 'avatarFiles', t('automation.channel.avatars'))}
          onFiles={() => pickImageFiles('avatarFolder', 'avatarFiles', t('automation.channel.avatars'))}
          fileCount={fileCounts.avatar}
          countSuffix={t('automation.channel.files')}
        />
      </ConfigBlock>

      <ConfigBlock
        enabled={config.bannersEnabled}
        onToggle={(v) => patchConfig({ bannersEnabled: v })}
        title={t('automation.channel.banners')}
        countLabel={fileCounts.banner != null ? t('automation.channel.filesCount', { count: fileCounts.banner }) : null}
      >
        <ImageSourceField
          folder={config.bannerFolder}
          files={config.bannerFiles}
          placeholder={t('automation.channel.selectFolder')}
          folderTitle={t('automation.channel.selectFolder')}
          filesTitle={t('automation.channel.selectPhotos')}
          hint={t('automation.channel.photosHint')}
          selectedLabel={t('automation.channel.selectedPhotos', { count: config.bannerFiles?.length || 0 })}
          onFolder={() => pickImageFolder('bannerFolder', 'bannerFiles', t('automation.channel.banners'))}
          onFiles={() => pickImageFiles('bannerFolder', 'bannerFiles', t('automation.channel.banners'))}
          fileCount={fileCounts.banner}
          countSuffix={t('automation.channel.files')}
        />
      </ConfigBlock>

      <ConfigBlock enabled={config.namesEnabled} onToggle={(v) => patchConfig({ namesEnabled: v })} title={t('automation.channel.names')}>
        <AiRow
          aiCount={config.namesAiCount || 5}
          onAiCountChange={(n) => patchConfig({ namesAiCount: n })}
          onFromFile={() => loadTextFile('channelNames')}
          onAiGenerate={() => onAiGenerate?.('names')}
          aiGenerating={aiGenerating === 'names'}
          aiLabel={t('automation.channel.aiCount')}
          fromFileLabel={t('automation.channel.fromFile')}
        />
        <textarea className="nexus-input w-full h-24 text-sm font-mono" placeholder={t('automation.channel.namesPlaceholder')} value={config.channelNames} onChange={(e) => patchConfig({ channelNames: e.target.value })} />
      </ConfigBlock>

      <div className="flex items-center gap-3 nexus-card p-3 rounded-xl border border-white/10">
        <Toggle checked={!!config.createChannelEnabled} onChange={(v) => patchConfig({ createChannelEnabled: v })} />
        <span className="text-sm">{t('automation.channel.createIfMissing')}</span>
      </div>

      <ConfigBlock enabled={config.descriptionsEnabled} onToggle={(v) => patchConfig({ descriptionsEnabled: v })} title={t('automation.channel.descriptions')}>
        <AiRow
          aiCount={config.descriptionsAiCount || 5}
          onAiCountChange={(n) => patchConfig({ descriptionsAiCount: n })}
          onFromFile={() => loadTextFile('channelDescriptions')}
          onAiGenerate={() => onAiGenerate?.('descriptions')}
          aiGenerating={aiGenerating === 'descriptions'}
          aiLabel={t('automation.channel.aiCount')}
          fromFileLabel={t('automation.channel.fromFile')}
        />
        <textarea className="nexus-input w-full h-28 text-sm" placeholder={t('automation.channel.descriptionsPlaceholder')} value={config.channelDescriptions} onChange={(e) => patchConfig({ channelDescriptions: e.target.value })} />
      </ConfigBlock>

      <ConfigBlock enabled={config.profileLinkEnabled} onToggle={(v) => patchConfig({ profileLinkEnabled: v })} title={t('automation.channel.profileLink')} icon={Link2}>
        <div>
          <label className="text-[10px] uppercase text-nexus-dim">{t('automation.channel.linkTitle')}</label>
          <input className="nexus-input w-full mt-1 text-sm" placeholder={t('automation.channel.linkTitlePlaceholder')} value={config.linkTitle} onChange={(e) => patchConfig({ linkTitle: e.target.value })} />
        </div>
        <div>
          <label className="text-[10px] uppercase text-nexus-dim">{t('automation.channel.linkUrls')}</label>
          <textarea className="nexus-input w-full h-20 mt-1 text-sm font-mono" placeholder={t('automation.channel.linkUrlsPlaceholder')} value={config.linkUrls} onChange={(e) => patchConfig({ linkUrls: e.target.value })} />
        </div>
      </ConfigBlock>
    </div>
  );
}

export function UploadVideoPanel({ config, patchConfig, fileCounts, tagsOpen, setTagsOpen, onAiGenerate, aiGenerating }) {
  const { t } = useTranslation();

  const loadTextFile = async () => {
    const content = await window.nexusAPI?.importTxt();
    if (content) patchConfig({ videoTitles: content });
  };

  const pickVideoFolder = async () => {
    const p = await window.nexusAPI?.openFolder({ title: t('automation.upload.folderTitle') });
    if (p) patchConfig({ videoFolder: p, videoFiles: [] });
  };

  const pickVideoFiles = async () => {
    const paths = await window.nexusAPI?.openVideos({ title: t('automation.upload.folderTitle') });
    if (paths?.length) {
      patchConfig({
        videoFolder: dirnameFromPath(paths[0]),
        videoFiles: paths,
      });
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <ConfigBlock alwaysOn enabled title={t('automation.upload.folderTitle')} countLabel={fileCounts.video != null ? t('automation.upload.videoCount', { count: fileCounts.video }) : null}>
        <MediaSourceField
          folder={config.videoFolder}
          files={config.videoFiles}
          placeholder={t('automation.upload.selectFolder')}
          folderTitle={t('automation.upload.selectFolder')}
          filesTitle={t('automation.upload.selectVideos')}
          hint={t('automation.upload.videosHint')}
          selectedLabel={t('automation.upload.selectedVideos', { count: config.videoFiles?.length || 0 })}
          onFolder={pickVideoFolder}
          onFiles={pickVideoFiles}
          fileCount={fileCounts.video}
          countSuffix={t('automation.upload.videos')}
          filesIcon={Video}
        />
      </ConfigBlock>

      <div className="flex items-center gap-3 nexus-card p-3 rounded-xl border border-white/10">
        <Toggle checked={config.uploadWarmupEnabled} onChange={(v) => patchConfig({ uploadWarmupEnabled: v })} />
        <span className="text-sm">{t('automation.upload.warmupFeed')}</span>
      </div>

      <div className="flex items-center gap-3 nexus-card p-3 rounded-xl border border-white/10">
        <Toggle
          checked={config.uploadManualAssist !== false}
          onChange={(v) => patchConfig({ uploadManualAssist: v })}
        />
        <span className="text-sm">При зависании ждать меня (Next / Publish вручную, браузер не закрывать)</span>
      </div>

      <ConfigBlock alwaysOn enabled title={t('automation.upload.titles')}>
        <AiRow
          aiCount={config.titlesAiCount || 5}
          onAiCountChange={(n) => patchConfig({ titlesAiCount: n })}
          onFromFile={loadTextFile}
          onAiGenerate={() => onAiGenerate?.('titles')}
          aiGenerating={aiGenerating === 'titles'}
          aiLabel={t('automation.channel.aiCount')}
          fromFileLabel={t('automation.channel.fromFile')}
        />
        <textarea className="nexus-input w-full h-28 text-sm font-mono" placeholder={t('automation.upload.titlesPlaceholder')} value={config.videoTitles} onChange={(e) => patchConfig({ videoTitles: e.target.value })} />
        <p className="text-[10px] text-nexus-dim">{t('automation.upload.spintaxHint')}</p>
      </ConfigBlock>

      <div className="rounded-xl border border-white/10 overflow-hidden">
        <button type="button" onClick={() => setTagsOpen(!tagsOpen)} className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-white/[0.02]">
          <span className="text-nexus-dim">{t('automation.upload.tagsOptional')}</span>
          <ChevronDown className={`w-4 h-4 transition ${tagsOpen ? 'rotate-180' : ''}`} />
        </button>
        {tagsOpen && (
          <div className="px-4 pb-4 border-t space-y-3" style={{ borderColor: 'var(--nexus-border)' }}>
            <div className="flex items-center gap-3 pt-2">
              <Toggle checked={!!config.tagsEnabled} onChange={(v) => patchConfig({ tagsEnabled: v })} />
              <span className="text-sm">{t('automation.upload.randomTags')}</span>
            </div>
            {config.tagsEnabled && (
              <div className="flex gap-4">
                <div>
                  <label className="text-[10px] uppercase text-nexus-dim">{t('automation.upload.minTags')}</label>
                  <input type="number" className="nexus-input mt-1 w-16 text-sm" min={1} value={config.tagsMin ?? 3} onChange={(e) => patchConfig({ tagsMin: parseInt(e.target.value, 10) || 1 })} />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-nexus-dim">{t('automation.upload.maxTags')}</label>
                  <input type="number" className="nexus-input mt-1 w-16 text-sm" min={1} value={config.tagsMax ?? 10} onChange={(e) => patchConfig({ tagsMax: parseInt(e.target.value, 10) || 1 })} />
                </div>
              </div>
            )}
            <textarea className="nexus-input w-full h-16 text-sm mt-2" placeholder={t('automation.upload.tagsPlaceholder')} value={config.videoTags} onChange={(e) => patchConfig({ videoTags: e.target.value })} />
          </div>
        )}
      </div>
    </div>
  );
}
