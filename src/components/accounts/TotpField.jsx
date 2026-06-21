import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Clock, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function TotpField({
  secret,
  copied,
  disabled,
  accountId,
  profileId,
  onCopy,
  onAutofill,
  autofillLoading,
}) {
  const { t } = useTranslation();
  const [totp, setTotp] = useState({ code: '------', remaining: 30, period: 30, progress: 1, ok: false });

  const refresh = useCallback(async () => {
    if (!secret || disabled) return;
    const res = await window.nexusAPI?.generateTotp(secret);
    if (res?.ok) setTotp(res);
  }, [secret, disabled]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  if (!secret) {
    return <span className="text-nexus-dim font-mono text-sm px-2">—</span>;
  }

  if (!totp.ok && totp.error === 'invalid_secret') {
    return (
      <div className="space-y-1">
        <span className="font-mono text-sm text-amber-400/90" title={secret}>
          {secret.length > 12 ? `${secret.slice(0, 8)}…` : secret}
        </span>
        <p className="text-[9px] text-nexus-dim leading-snug max-w-[140px]">{t('accounts.totpInvalidSecret')}</p>
      </div>
    );
  }

  const lowTime = totp.remaining <= 5;

  return (
    <div className="inline-flex flex-col gap-1 min-w-[120px]">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          disabled={disabled || !totp.ok}
          onClick={() => onCopy?.(totp.code)}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-sm font-semibold tracking-widest transition-all rounded ${
            copied
              ? 'text-pink-400 border border-pink-500 bg-pink-500/10'
              : lowTime
                ? 'text-amber-300 border border-amber-500/50 hover:bg-amber-500/10'
                : 'text-white border border-pink-500/70 hover:border-pink-400 hover:bg-pink-500/5'
          }`}
          title={t('accounts.totpCopy')}
        >
          <Clock className={`w-3.5 h-3.5 shrink-0 ${lowTime ? 'text-amber-400' : 'text-pink-400/80'}`} />
          {totp.code}
          {copied ? <Check className="w-3.5 h-3.5 text-pink-400" /> : <Copy className="w-3.5 h-3.5 text-nexus-dim" />}
        </button>
        {profileId && onAutofill && (
          <button
            type="button"
            disabled={autofillLoading || !totp.ok}
            onClick={() => onAutofill(accountId, secret)}
            className="p-1 rounded border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40"
            title={t('accounts.totpAutofill')}
          >
            <Zap className={`w-3.5 h-3.5 ${autofillLoading ? 'animate-pulse' : ''}`} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ease-linear rounded-full ${
              lowTime ? 'bg-amber-400' : 'bg-pink-500'
            }`}
            style={{ width: `${Math.max(0, Math.min(100, (totp.progress || 0) * 100))}%` }}
          />
        </div>
        <span className={`text-[10px] font-mono tabular-nums ${lowTime ? 'text-amber-400' : 'text-nexus-dim'}`}>
          {totp.remaining}s
        </span>
      </div>
    </div>
  );
}
