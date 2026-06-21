/**
 * Строка метода: чекбокс + опциональные числовые поля (с группировкой).
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Tooltip from './Tooltip';
import { PARAM_SECTIONS, getParamCount } from './methodGroups';

function ParamField({ spec, paramKey, values, recommended, disabled, onParamChange, methodKey }) {
  return (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] text-cyber-dim truncate" title={spec.label}>
        {spec.label}
      </span>
      <input
        type="number"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        disabled={disabled}
        placeholder={recommended?.[paramKey] != null ? String(recommended[paramKey]) : '—'}
        value={values?.[paramKey] ?? ''}
        onChange={(e) => onParamChange(methodKey, paramKey, e.target.value)}
        className="text-xs px-2 py-1.5 rounded-lg bg-cyber-card border border-cyber-dim/30 text-white placeholder:text-cyber-dim/50 focus:outline-none focus:border-cyber-cyan/50 focus:ring-1 focus:ring-cyber-cyan/30 font-mono"
      />
    </label>
  );
}

function ParamGrid({ methodKey, params, values, recommended, disabled, onParamChange, keys, cols = 2 }) {
  const gridClass = cols === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid ${gridClass} gap-2`}>
      {keys.map((key) => {
        const spec = params[key];
        if (!spec) return null;
        return (
          <ParamField
            key={key}
            spec={spec}
            paramKey={key}
            values={values}
            recommended={recommended}
            disabled={disabled}
            onParamChange={onParamChange}
            methodKey={methodKey}
          />
        );
      })}
    </div>
  );
}

export default function MethodRow({
  methodKey,
  label,
  tooltip,
  enabled,
  onToggle,
  params,
  values,
  recommended,
  onParamChange,
  disabled,
}) {
  const paramCount = getParamCount(params);
  const isHeavy = paramCount >= 6;
  const [paramsOpen, setParamsOpen] = useState(!isHeavy);
  const sections = PARAM_SECTIONS[methodKey];

  return (
    <div
      className={`rounded-xl border transition-colors ${
        enabled
          ? 'border-cyber-cyan/25 bg-cyber-cyan/[0.04]'
          : 'border-cyber-dim/20 bg-cyber-bg/40'
      }`}
    >
      <div className="flex items-center gap-2 p-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={enabled}
          disabled={disabled}
          onClick={() => onToggle(methodKey, !enabled)}
          className={`
            w-4 h-4 rounded border flex-shrink-0 transition-colors
            ${enabled ? 'bg-cyber-cyan/30 border-cyber-cyan' : 'border-cyber-dim/50'}
            ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
          `}
        />
        <Tooltip text={tooltip}>
          <span className="text-xs font-medium text-white cursor-help flex-1 min-w-0 truncate">
            {label}
          </span>
        </Tooltip>
        {enabled && paramCount > 0 && isHeavy && (
          <button
            type="button"
            onClick={() => setParamsOpen((o) => !o)}
            className="flex items-center gap-0.5 text-[10px] text-cyber-dim hover:text-cyber-cyan shrink-0"
          >
            {paramCount} пол.
            <ChevronDown
              size={12}
              className={`transition-transform ${paramsOpen ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {enabled && paramCount > 0 && (!isHeavy || paramsOpen) && (
        <div className="px-2.5 pb-2.5 pt-0 space-y-2 border-t border-cyber-dim/10 ml-2 mr-2">
          {sections ? (
            sections.map((section) => (
              <div key={section.title}>
                <p className="text-[9px] uppercase tracking-wide text-cyber-magenta/70 mb-1.5">
                  {section.title}
                </p>
                <ParamGrid
                  methodKey={methodKey}
                  params={params}
                  values={values}
                  recommended={recommended}
                  disabled={disabled}
                  onParamChange={onParamChange}
                  keys={section.keys}
                  cols={section.keys.length >= 4 ? 2 : 2}
                />
              </div>
            ))
          ) : (
            <ParamGrid
              methodKey={methodKey}
              params={params}
              values={values}
              recommended={recommended}
              disabled={disabled}
              onParamChange={onParamChange}
              keys={Object.keys(params)}
              cols={paramCount >= 4 ? 2 : 2}
            />
          )}
        </div>
      )}
    </div>
  );
}
