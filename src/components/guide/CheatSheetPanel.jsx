import { BookOpen, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function CheatSheetPanel({ topicId, compact }) {
  const { t } = useTranslation();
  const topic = t(`guide.topics.${topicId}`, { returnObjects: true }) || {};
  const sections = Array.isArray(topic.sections) ? topic.sections : [];

  return (
    <div className={`flex flex-col overflow-hidden bg-card ${compact ? '' : 'h-full'}`}>
      <div className="px-5 pt-5 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 pr-6">
          <BookOpen size={16} className="text-primary shrink-0" />
          <h2 className="text-sm font-semibold text-foreground">
            {t('guide.sheetTitle', { topic: topic.title || t(`nav.${topicId === 'analytics' ? 'analyticsPage' : topicId}`, { defaultValue: topicId }) })}
          </h2>
        </div>
        {topic.subtitle && (
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">{topic.subtitle}</p>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-5 ${compact ? '' : 'min-h-0'}`}>
        {sections.map((section, idx) => (
          <div key={idx}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
              {section.title}
            </p>
            <ul className="space-y-2">
              {(section.items || []).map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                  <Check size={13} className="text-primary shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
