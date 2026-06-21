import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const ProfileSelect = memo(function ProfileSelect({ value, profiles, onChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const label = useMemo(() => {
    if (!value) return t('automation.noProfile');
    const p = profiles.find((x) => String(x.id || x.profileId) === String(value));
    if (!p) return `#${String(value).slice(0, 8)}`;
    return p.title || p.channelName || `#${String(value).slice(0, 8)}`;
  }, [value, profiles, t]);

  if (!open) {
    return (
      <button
        type="button"
        className="nexus-input w-full py-1 text-xs text-left truncate hover:bg-white/5"
        onClick={() => setOpen(true)}
        title={label}
      >
        {label}
      </button>
    );
  }

  return (
    <select
      className="nexus-input w-full py-1 text-xs"
      value={value || ''}
      autoFocus
      onChange={(e) => {
        onChange(e.target.value || null);
        setOpen(false);
      }}
      onBlur={() => setOpen(false)}
    >
      <option value="">{t('automation.noProfile')}</option>
      {profiles.map((p) => {
        const id = String(p.id || p.profileId);
        const title = p.title || p.channelName || `#${id.slice(0, 8)}`;
        return <option key={id} value={id}>{title}</option>;
      })}
    </select>
  );
});

const AccountRow = memo(function AccountRow({
  account,
  checked,
  profiles,
  onToggle,
  onProfileChange,
}) {
  return (
    <tr className="border-t hover:bg-white/[0.02]" style={{ borderColor: 'var(--nexus-border)' }}>
      <td className="px-3 py-1.5">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </td>
      <td className="px-3 py-1.5 font-mono truncate max-w-[200px]" title={account.login}>
        {account.login}
      </td>
      <td className="px-3 py-1.5">
        <ProfileSelect
          value={account.profileId || ''}
          profiles={profiles}
          onChange={(profileId) => onProfileChange(account.blockId, account.id, profileId)}
        />
      </td>
    </tr>
  );
});

export { AccountRow, ProfileSelect };
