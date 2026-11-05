/**
 * useFullscreen — the page's Fullscreen API state and toggle.
 *
 * `active` follows `fullscreenchange`, never a local guess: the user can leave
 * with a system gesture or Escape. `supported` is false where the API is absent
 * or limited to video (iPhone Safari reports `fullscreenEnabled` false).
 */

import { useCallback, useEffect, useState } from 'react';
import type { FullscreenControl } from '../@types/ui/FullscreenControl';

export function useFullscreen(): FullscreenControl {
  const [active, setActive] = useState(() => document.fullscreenElement !== null);

  useEffect(() => {
    const sync = (): void => setActive(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggle = useCallback(() => {
    const change =
      document.fullscreenElement !== null
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen();
    // A refused request (no user activation, policy) leaves the state as it was.
    change.catch(() => {});
  }, []);

  return { supported: document.fullscreenEnabled === true, active, toggle };
}
