import { HelpCircle } from 'lucide-react';
import Tooltip from '../uniqueizer/Tooltip';

/** Подпись поля с иконкой-подсказкой при наведении. */
export default function FieldHint({ label, text, children }) {
  const content = children || (label ? <span>{label}</span> : null);
  if (!text) return content;
  return (
    <span className="inline-flex items-center gap-1.5">
      {content}
      <Tooltip text={text}>
        <HelpCircle className="w-3.5 h-3.5 text-nexus-dim cursor-help shrink-0" aria-hidden />
      </Tooltip>
    </span>
  );
}
