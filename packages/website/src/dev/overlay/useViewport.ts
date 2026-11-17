import { useEffect, useState } from 'react';

import type { Viewport } from './@types/Viewport';
import { readViewport } from './readViewport';

/** The window's scroll and size, fresh after every scroll or resize: what a box fixed to the page is placed against. */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const update = (): void => setViewport(readViewport());
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    return () => {
      removeEventListener('scroll', update);
      removeEventListener('resize', update);
    };
  }, []);
  return viewport;
}
