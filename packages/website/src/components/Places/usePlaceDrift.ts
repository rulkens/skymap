/*
 * usePlaceDrift — ties the places field to the scroll, never to time: `--drawn`
 * (0 to 1) is how much of the line out from Earth has been drawn, and `--drift`
 * (-1 to 1) is where the field is on its way up the screen, which the discs turn
 * into a few pixels of movement at different depths. Both are written straight
 * to the field and only read by transforms and a dash offset, so nothing is laid
 * out again and React does not render. Without script, and for a reader who
 * asked for less motion, the line is whole and the discs are still.
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export function usePlaceDrift(field: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = field.current!;
    let near = false;
    let queued = false;

    const update = (): void => {
      queued = false;
      const rect = box.getBoundingClientRect();
      const screen = innerHeight;
      // A field taller than the screen draws as it passes, the tip two thirds down; a shorter one is whole by mid-screen.
      const tall = rect.height > screen;
      const drawn =
        (screen * (tall ? 0.65 : 0.95) - rect.top) / (tall ? rect.height : screen * 0.45);
      box.style.setProperty('--drawn', clamp(drawn).toFixed(4));
      const through = clamp((screen - rect.top) / (screen + rect.height));
      box.style.setProperty('--drift', (through * 2 - 1).toFixed(4));
    };
    const queue = (): void => {
      if (!near || queued) return;
      queued = true;
      requestAnimationFrame(update);
    };

    const watch = new IntersectionObserver(
      ([entry]) => {
        near = entry!.isIntersecting;
        queue();
      },
      { rootMargin: '20% 0px' },
    );
    watch.observe(box);
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    update();
    return () => {
      watch.disconnect();
      removeEventListener('scroll', queue);
      removeEventListener('resize', queue);
    };
  }, [field]);
}
