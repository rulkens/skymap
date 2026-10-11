/*
 * initPlaceDrift — ties the places field (components/Places.astro) to the
 * scroll, never to time: `--drawn` (0 to 1) is how much of the line out from
 * Earth has been drawn, and `--drift` (-1 to 1) is where the field is on its
 * way up the screen, which the discs turn into a few pixels of movement at
 * different depths. Both are only read by transforms and a dash offset, so
 * nothing is laid out again. Without script, and for a reader who asked for
 * less motion, the line is whole and the discs are still.
 */
export function initPlaceDrift(field: HTMLElement): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  let near = false;
  let queued = false;

  const update = (): void => {
    queued = false;
    const box = field.getBoundingClientRect();
    const screen = innerHeight;
    // A field taller than the screen draws as it passes, the tip two thirds down; a shorter one is whole by mid-screen.
    const tall = box.height > screen;
    const drawn = (screen * (tall ? 0.65 : 0.95) - box.top) / (tall ? box.height : screen * 0.45);
    field.style.setProperty('--drawn', clamp(drawn).toFixed(4));
    const through = clamp((screen - box.top) / (screen + box.height));
    field.style.setProperty('--drift', (through * 2 - 1).toFixed(4));
  };
  const queue = (): void => {
    if (!near || queued) return;
    queued = true;
    requestAnimationFrame(update);
  };

  new IntersectionObserver(
    ([entry]) => {
      near = entry!.isIntersecting;
      queue();
    },
    { rootMargin: '20% 0px' },
  ).observe(field);
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  update();
}
