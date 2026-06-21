import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';

export default function CreateBlockModal({ open, onClose, onCreate }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [links, setLinks] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setLinks('');
    }
  }, [open]);

  const handleCreate = () => {
    onCreate({ name: name.trim(), linksText: links });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={t('results.newBlock')}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-nexus-dim block mb-1">{t('results.blockNameOptional')}</label>
          <input
            className="nexus-input w-full"
            placeholder={t('results.blockNameDefault')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-nexus-dim block mb-1">{t('results.linksLabel')}</label>
          <textarea
            className="nexus-input w-full min-h-[160px] font-mono text-xs resize-y"
            placeholder={t('results.linksPlaceholder')}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
          />
          <p className="text-[10px] text-nexus-dim mt-1">{t('results.linksHint')}</p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!links.trim()}
          className="w-full py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40"
          style={{ background: 'var(--nexus-accent)' }}
        >
          {t('results.createBlock')}
        </button>
      </div>
    </Modal>
  );
}
