import { useEffect, useState } from 'react';

import type { Viewport } from './@types/Viewport';

const read = (): Viewport => ({
  scrollX,
  scrollY,
  width: innerWidth,
  height: innerHeight,
});

/** The window's scroll and size, fresh after every scroll or resize: what a box fixed to the page is placed against. */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    const update = (): void => setViewport(read());
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    return () => {
      removeEventListener('scroll', update);
      removeEventListener('resize', update);
    };
  }, []);
  return viewport;
}
