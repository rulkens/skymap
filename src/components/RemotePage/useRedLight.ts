/**
 * useRedLight — the phone's red-light preference: read once from localStorage, written on change,
 * mirrored as `data-light` on <html>, where `remote.css` swaps the palette. It never reaches the
 * dome. Storage can be blocked (private windows), so every access is guarded and the default is off.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'skymap.remote.redLight';

const readPreference = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export function useRedLight(): readonly [on: boolean, set: (on: boolean) => void] {
  const [on, setOn] = useState(readPreference);
  useEffect(() => {
    if (!on) return;
    document.documentElement.dataset.light = 'red';
    return () => {
      delete document.documentElement.dataset.light;
    };
  }, [on]);
  const set = useCallback((next: boolean): void => {
    setOn(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      // Not kept past this page, but the switch still works.
    }
  }, []);
  return [on, set];
}
