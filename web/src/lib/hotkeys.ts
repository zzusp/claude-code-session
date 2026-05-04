import { useEffect } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function useGlobalHotkey(combo: 'mod+k', handler: () => void): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (combo !== 'mod+k') return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key !== 'k' && e.key !== 'K') return;
      e.preventDefault();
      handler();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, handler]);
}

export const HOTKEY_HINT = isMac ? '⌘K' : 'Ctrl+K';
