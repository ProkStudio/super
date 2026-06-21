import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/useAppStore';
import { getGuideTopicId } from '../../constants/guideTopics';
import CheatSheetPanel from '../guide/CheatSheetPanel';

export default function GuideDrawer() {
  const { t } = useTranslation();
  const { helpOpen, setHelpOpen, activePage, activeModule } = useAppStore();
  const topicId = getGuideTopicId(activePage, activeModule);

  return (
    <AnimatePresence>
      {helpOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setHelpOpen(false)}
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-y-0 right-0 z-50 w-[340px] max-w-[340px] flex flex-col bg-card border-l border-border shadow-[-12px_0_40px_rgba(0,0,0,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <CheatSheetPanel topicId={topicId} compact />
            <div className="shrink-0 border-t border-border px-5 py-2.5 text-[11px] text-muted-foreground/50 text-center">
              {t('guide.footerHint')}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
