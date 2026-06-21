import { Copy, Check, Mail, Clock } from 'lucide-react';

export default function CopyField({
  type,
  value,
  copied,
  disabled,
  onCopy,
  compact,
}) {
  const isPassword = type === 'password';
  const isTotp = type === 'totp';
  const isEmpty = !value || value === '—';
  const display = isPassword ? '••••••••' : (isEmpty ? '—' : value);

  if (compact) {
    return (
      <span className="text-emerald-400/80 font-mono text-sm truncate">
        {isPassword ? '••••••••' : display}
      </span>
    );
  }

  if (isTotp) {
    if (isEmpty) {
      return <span className="text-nexus-dim font-mono text-sm px-2">—</span>;
    }
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onCopy}
        className={`inline-flex items-center gap-2 px-1 py-0.5 font-mono text-sm transition-all rounded ${
          copied
            ? 'text-pink-400 border-b-2 border-pink-500 bg-pink-500/10'
            : 'text-white border-b-2 border-pink-500/70 hover:border-pink-400 hover:bg-pink-500/5'
        }`}
      >
        <Clock className="w-3.5 h-3.5 shrink-0 text-pink-400/80" />
        {value}
        {copied ? <Check className="w-3.5 h-3.5 text-pink-400" /> : <Copy className="w-3.5 h-3.5 text-nexus-dim" />}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || isEmpty}
      onClick={onCopy}
      className={`inline-flex items-center gap-2 max-w-full px-3 py-1.5 rounded-lg border text-sm font-mono transition-all ${
        copied
          ? 'border-pink-500/60 bg-pink-500/15 text-pink-300 shadow-[0_0_12px_rgba(236,72,153,0.15)]'
          : 'border-white/10 bg-white/[0.03] text-zinc-200 hover:border-pink-500/30 hover:bg-pink-500/5'
      }`}
    >
      {type === 'email' && <Mail className={`w-3.5 h-3.5 shrink-0 ${copied ? 'text-pink-400' : 'text-nexus-dim'}`} />}
      <span className="truncate">{display}</span>
      {copied ? <Check className="w-3.5 h-3.5 shrink-0 text-pink-400" /> : <Copy className="w-3.5 h-3.5 shrink-0 text-nexus-dim" />}
    </button>
  );
}
