/*
 * initFeatureWalk — the long form of the Features page (components/FeatureWalk.astro).
 * The line under the top bar has one segment for each group, and each fills
 * as its group passes up under the bar (`--p`, 0 to 1). A group comes in
 * once, as it enters, unless the visitor asked for less motion; the groups
 * above it are then shown too, so a jump down the page leaves none hidden.
 * `data-reveal` is only set here, so without script nothing is hidden.
 */
// How far down the window a group counts as reached: a little under the top bar, where a jump puts its name.
const LINE_PX = 120;

export function initFeatureWalk(root: HTMLElement): void {
  const bands = [...root.querySelectorAll<HTMLElement>('[data-band]')];
  const segments = [...root.querySelectorAll<HTMLElement>('[data-progress] b')];

  let queued = false;
  const fill = (): void => {
    queued = false;
    bands.forEach((band, i) => {
      const box = band.firstElementChild!.getBoundingClientRect();
      const done = Math.min(1, Math.max(0, (LINE_PX - box.top) / box.height));
      segments[i]?.style.setProperty('--p', done.toFixed(3));
    });
  };
  const ask = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(fill);
  };
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', ask);
  fill();

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.setAttribute('data-reveal', '');
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const band of bands.slice(0, bands.indexOf(entry.target as HTMLElement) + 1)) {
          band.setAttribute('data-seen', '');
          watcher.unobserve(band);
        }
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  for (const band of bands) watcher.observe(band);
}
