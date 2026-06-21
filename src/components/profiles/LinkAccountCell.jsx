import { memo, useMemo, useState } from 'react';

const LinkAccountCell = memo(function LinkAccountCell({ value, accounts, emptyLabel, onChange }) {
  const [open, setOpen] = useState(false);

  const label = useMemo(() => {
    if (!value) return emptyLabel;
    return accounts.find((a) => a.id === value)?.login || emptyLabel;
  }, [value, accounts, emptyLabel]);

  if (!open) {
    return (
      <button
        type="button"
        className="nexus-input text-xs py-1 max-w-[160px] truncate text-left hover:bg-white/5"
        onClick={() => setOpen(true)}
        title={label}
      >
        {label}
      </button>
    );
  }

  return (
    <select
      className="nexus-input text-xs py-1 max-w-[160px]"
      value={value || ''}
      autoFocus
      onChange={(e) => {
        onChange(e.target.value || null);
        setOpen(false);
      }}
      onBlur={() => setOpen(false)}
    >
      <option value="">{emptyLabel}</option>
      {accounts.map((acc) => (
        <option key={acc.id} value={acc.id}>{acc.login}</option>
      ))}
    </select>
  );
});

export default LinkAccountCell;
