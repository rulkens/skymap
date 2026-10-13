/**
 * useRecentlyChanged — true from a change of `key` until `quietMs` after the
 * last one. The first render is not a change, so nothing flashes at mount.
 * `key` is a primitive so the effect's dependency is exact: pass a string or
 * number that changes only when the thing visibly changes.
 */
import { useEffect, useRef, useState } from 'react';

export function useRecentlyChanged(key: string | number, quietMs: number): boolean {
  const [recent, setRecent] = useState(false);
  const previous = useRef(key);

  useEffect(() => {
    if (previous.current === key) return;
    previous.current = key;
    setRecent(true);
    const id = setTimeout(() => setRecent(false), quietMs);
    return () => clearTimeout(id);
  }, [key, quietMs]);

  return recent;
}
