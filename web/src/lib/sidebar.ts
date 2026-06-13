import { createContext, useCallback, useContext, useState } from 'react';

const COLLAPSE_KEY = 'sidebar-collapsed';

// Desktop sidebar collapse state (Claude-style "Close sidebar"), persisted to
// localStorage so the choice survives reloads. Lifted out of <Sidebar> so the
// chrome layout owns it and routes (the session page's file preview) can
// temporarily collapse the rail to make room. Mobile uses the separate `open`
// drawer state, which stays local to <Sidebar>.
export function useCollapsedState(): [boolean, (v: boolean) => void] {
  const [collapsed, setState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  // Stable identity so the context value can memoize on [collapsed, setCollapsed].
  const setCollapsed = useCallback((v: boolean) => {
    setState(v);
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
    } catch {
      /* storage might be blocked — fall back to in-memory */
    }
  }, []);
  return [collapsed, setCollapsed];
}

export interface SidebarContextValue {
  /** Transient "collapse the rail to make room" flag, OR-ed with the user's
   *  persisted preference. Not persisted, so it reverts on close / unmount and
   *  never clobbers the user's own collapse choice. The session page raises it
   *  while a file preview is open. */
  setAutoCollapsed: (v: boolean) => void;
}

// Provided by the chrome layout; null outside it (e.g. the standalone
// modified-files full page), so consumers guard before driving the rail.
export const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue | null {
  return useContext(SidebarContext);
}
