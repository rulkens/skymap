import { useState } from 'react';

/**
 * useInitialMobile — one-shot "is this a mobile viewport?" read, sampled once
 * at mount from `window.innerWidth`. The setter is deliberately dropped:
 * re-orienting mid-session shouldn't yank a user's expanded panels closed
 * under them. SSR-safe: desktop default when `window` is undefined.
 */
export function useInitialMobile(): boolean {
  const [initialMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  return initialMobile;
}
