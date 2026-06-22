import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';

/**
 * Очередь: сначала чейнджлог, затем тост об обновлении.
 */
export default function LaunchExperience() {
  const changelogOpen = useAppStore((s) => s.changelogOpen);
  const setUpdateBanner = useAppStore((s) => s.setUpdateBanner);
  const pendingRef = useRef(null);

  useEffect(() => {
    const unsubNotify = window.nexusAPI?.onUpdaterNotify?.((payload) => {
      if (!payload || payload.status === 'checking') return;
      if (payload.status === 'downloaded') return;

      if (payload.status === 'available') {
        if (payload.manual) {
          useAppStore.getState().requestUpdateModal(payload);
          return;
        }
        if (changelogOpen) {
          pendingRef.current = payload;
        } else {
          setUpdateBanner(payload);
        }
      }
    });

    return () => unsubNotify?.();
  }, [changelogOpen, setUpdateBanner]);

  useEffect(() => {
    if (!changelogOpen && pendingRef.current) {
      setUpdateBanner(pendingRef.current);
      pendingRef.current = null;
    }
  }, [changelogOpen, setUpdateBanner]);

  return null;
}
