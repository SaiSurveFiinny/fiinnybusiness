import { useCallback, useEffect, useState } from 'react';

/**
 * Hash-based tab state — syncs the active tab with the URL hash and localStorage.
 *
 * Priority on initial load: URL hash → localStorage → defaultTab.
 * Switching tabs updates the hash (pushState) so browser Back/Forward work.
 * Refreshing the page reopens the same tab via the hash.
 * localStorage provides a fallback when the page is opened without a hash.
 *
 * @param validTabs   Exhaustive list of valid tab IDs for this module.
 * @param defaultTab  Fallback when neither hash nor localStorage match.
 * @param storageKey  localStorage key — use a unique key per module (e.g. 'fiinny-tab-worklist').
 */
export function useHashTab<T extends string>(
  validTabs: readonly T[],
  defaultTab: T,
  storageKey: string,
): [T, (tab: T) => void] {
  const resolve = (): T => {
    const hash = window.location.hash.slice(1) as T;
    if (validTabs.includes(hash)) return hash;
    const stored = localStorage.getItem(storageKey) as T | null;
    if (stored && validTabs.includes(stored)) return stored;
    return defaultTab;
  };

  const [activeTab, setLocalTab] = useState<T>(resolve);

  const setActiveTab = useCallback(
    (tab: T) => {
      history.pushState(null, '', `${window.location.pathname}${window.location.search}#${tab}`);
      localStorage.setItem(storageKey, tab);
      setLocalTab(tab);
    },
    [storageKey],
  );

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.slice(1) as T;
      if (validTabs.includes(hash)) {
        setLocalTab(hash);
        localStorage.setItem(storageKey, hash);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [validTabs, storageKey]);

  return [activeTab, setActiveTab];
}
