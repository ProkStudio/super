import { ChevronRight, ChevronDown, Trash2, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CopyField from './CopyField';
import TotpField from './TotpField';
import AccountStatusBadge from './AccountStatusBadge';

export default function AccountRow({
  index,
  account,
  copied,
  expanded,
  profileId,
  autofillLoading,
  onToggleExpand,
  onCopyEmail,
  onCopyPassword,
  onCopyTotp,
  onAutofillTotp,
  onOpenProfile,
  onDelete,
}) {
  const { t } = useTranslation();
  const hasTotp = Boolean(account.totp?.trim());
  const isReady = account.ready;
  const isCollapsed = isReady && !expanded;
  const accountStatus = account.status || 'unknown';
  const isBad = ['banned', 'disabled', 'error', 'logged_out', 'verify'].includes(accountStatus);
  const isWarn = accountStatus === 'no_channel';

  const statusCell = (
    <div className="space-y-0.5 min-w-[120px]">
      <AccountStatusBadge status={accountStatus} message={account.statusMessage} />
      {account.statusMessage && (
        <p className="text-[10px] text-nexus-dim leading-snug line-clamp-2" title={account.statusMessage}>
          {account.statusMessage}
        </p>
      )}
      {account.lastCheckedAt && (
        <p className="text-[9px] text-nexus-dim/70">
          {new Date(account.lastCheckedAt).toLocaleString()}
        </p>
      )}
    </div>
  );

  if (isCollapsed) {
    return (
      <tr
        className={`border-b transition-all duration-300 cursor-pointer ${
          isBad
            ? 'border-red-500/20 bg-red-500/[0.06] hover:bg-red-500/[0.09]'
            : 'border-emerald-500/20 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.12]'
        }`}
        onClick={onToggleExpand}
        title={t('accounts.expandReady')}
      >
        <td className="px-3 py-2 text-nexus-dim text-xs w-12 align-middle">{index}</td>
        <td className="px-3 py-2 min-w-0 align-middle" colSpan={3}>
          <div className="flex items-center gap-2 min-w-0">
            <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className={`font-mono text-sm truncate ${isBad ? 'text-red-400' : 'text-emerald-400'}`}>
              {account.login}
            </span>
            <span className="text-[10px] font-bold tracking-wider text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded shrink-0">
              READY
            </span>
          </div>
        </td>
        <td className="px-3 py-2 align-middle" onClick={(e) => e.stopPropagation()}>
          {statusCell}
        </td>
        <td className="px-3 py-2 text-right w-12 align-middle">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded hover:bg-red-500/10 text-nexus-dim hover:text-red-400 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      </tr>
    );
  }

  const rowClass = isBad
    ? 'border-b border-red-500/20 bg-red-500/[0.04] hover:bg-red-500/[0.07]'
    : isWarn
      ? 'border-b border-violet-500/20 bg-violet-500/[0.05] hover:bg-violet-500/[0.08]'
      : isReady
      ? 'border-b border-emerald-500/20 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.09]'
      : 'border-b hover:bg-white/[0.02]';

  return (
    <tr className={`${rowClass} transition-colors`} style={{ borderColor: 'var(--nexus-border)' }}>
      <td className="px-3 py-3 text-nexus-dim text-xs w-12">{index}</td>
      <td className="px-3 py-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {isReady && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="flex items-center gap-1 shrink-0 text-emerald-400 hover:text-emerald-300 transition"
              title={t('accounts.collapseReady')}
            >
              <ChevronDown className="w-4 h-4" />
              <span className="text-[10px] font-bold tracking-wider border border-emerald-500/40 px-1.5 py-0.5 rounded">
                READY
              </span>
            </button>
          )}
          <CopyField type="email" value={account.login} copied={copied.email || isReady} onCopy={onCopyEmail} />
        </div>
      </td>
      <td className="px-3 py-3">
        <CopyField type="password" value={account.password} copied={copied.password || isReady} onCopy={onCopyPassword} />
      </td>
      <td className="px-3 py-3">
        <TotpField
          secret={hasTotp ? account.totp : ''}
          accountId={account.id}
          profileId={profileId}
          copied={copied.totp || (isReady && hasTotp)}
          disabled={!hasTotp}
          autofillLoading={autofillLoading}
          onCopy={(code) => onCopyTotp?.(code)}
          onAutofill={onAutofillTotp}
        />
      </td>
      <td className="px-3 py-3">{statusCell}</td>
      <td className="px-3 py-3 text-right w-12">
        <div className="flex items-center justify-end gap-1">
          {profileId && (
            <button
              type="button"
              onClick={onOpenProfile}
              className="p-1.5 rounded hover:bg-white/5 text-nexus-dim hover:text-purple-400 transition"
              title={t('accounts.openProfile')}
            >
              <User className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded hover:bg-red-500/10 text-nexus-dim hover:text-red-400 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
