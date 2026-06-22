import { useCallback, useEffect, useRef, useState } from 'react';

function useDebouncedSave(saveFn, delayMs = 450) {
  const timerRef = useRef(null);
  const saveRef = useRef(saveFn);
  saveRef.current = saveFn;

  const schedule = useCallback((payload) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveRef.current(payload);
    }, delayMs);
  }, [delayMs]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return schedule;
}

/** Load + debounced-save automation draft per module (youtube | tiktok). */
export function useAutomationDraftPersistence(module, draftSnapshot, applyDraft) {
  const [hydrated, setHydrated] = useState(false);
  const scheduleSave = useDebouncedSave((partial) => {
    window.nexusAPI?.updateAutomationDraft?.(module, partial);
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await window.nexusAPI?.getAutomationDraft?.(module);
      if (!cancelled) {
        if (draft) applyDraft(draft);
        setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, [module, applyDraft]);

  useEffect(() => {
    if (!hydrated || !draftSnapshot) return;
    scheduleSave(draftSnapshot);
  }, [hydrated, draftSnapshot, scheduleSave]);

  return hydrated;
}

export function filterValidProfileIds(ids, profiles) {
  const known = new Set((profiles || []).map((p) => String(p.id)));
  return (ids || []).map(String).filter((id) => known.has(id));
}
