/*
 * initFlight — scroll scrubs the hero recording. The film is attached only
 * after load and a paint, so the poster is the LCP element and no video bytes
 * compete with it. Scroll is never touched: the film follows the page, not the
 * other way round.
 */

type Stop = { t: number; name: string; line: string };

// Keep identical to the pinned-layout media query in components/Flight.astro.
const PINNED_QUERY = '(min-width: 760px) and (prefers-reduced-motion: no-preference)';
// Share of the track after the film ends, so the closing line can be read before the page moves on.
const HOLD = 0.08;
const clamp = (v: number): number => Math.max(0, Math.min(1, v));

export function initFlight(root: HTMLElement): void {
  const duration = Number(root.dataset.duration);
  const stops: Stop[] = JSON.parse(root.dataset.stops ?? '[]');
  const track = root.querySelector<HTMLElement>('.track')!;
  const video = root.querySelector<HTMLVideoElement>('.film')!;
  const intro = root.querySelector<HTMLElement>('[data-intro]')!;
  const caption = root.querySelector<HTMLElement>('[data-caption]')!;
  const arrive = root.querySelector<HTMLElement>('[data-arrive]')!;
  const fill = root.querySelector<HTMLElement>('[data-fill]')!;
  const pause = root.querySelector<HTMLButtonElement>('[data-pause]')!;
  const rings = [...root.querySelectorAll<HTMLButtonElement>('[data-stop]')];
  const title = caption.querySelector('b')!;
  const line = caption.querySelector('span')!;
  const motion = matchMedia(PINNED_QUERY);

  let attached = false;
  let paused = false;
  let visible = false;
  let running = false;
  let eased = 0;
  let last = 0;
  let shown = -1;

  const live = (): boolean => root.hasAttribute('data-live') && motion.matches;

  function attach(): void {
    if (attached || !live()) return;
    attached = true;
    video.addEventListener('loadeddata', () => root.classList.add('has-video'), { once: true });
    // A missing or undecodable film leaves the poster page: the static layout, no retry.
    video.addEventListener('error', () => {
      root.removeAttribute('data-live');
      video.removeAttribute('src');
    });
    video.preload = 'auto';
    video.src = root.dataset.video!;
  }

  function render(p: number): void {
    const t = p * duration;
    if (
      !paused &&
      video.readyState >= 2 &&
      !video.seeking &&
      Math.abs(video.currentTime - t) > 0.02
    ) {
      video.currentTime = t;
    }
    fill.style.height = `${p * 100}%`;

    const out = clamp(t / 4);
    intro.style.opacity = String(1 - out);
    intro.style.pointerEvents = out > 0.5 ? 'none' : 'auto';

    let i = 0;
    stops.forEach((s, k) => {
      if (t >= s.t - 1) i = k;
    });
    if (i !== shown) {
      shown = i;
      title.textContent = stops[i].name;
      line.textContent = stops[i].line;
      rings.forEach((ring, k) => ring.setAttribute('aria-current', String(k === i)));
    }
    const end = clamp((t - (duration - 5)) / 3);
    caption.style.opacity = String((i === 0 ? 0 : clamp(t - stops[i].t + 1)) * (1 - end));
    arrive.style.opacity = String(end);
    arrive.style.pointerEvents = end > 0.6 ? 'auto' : 'none';
  }

  function frame(now: number): void {
    if (!live() || !visible) {
      running = false;
      return;
    }
    const rect = track.getBoundingClientRect();
    const p = clamp(clamp(-rect.top / (rect.height - innerHeight)) / (1 - HOLD));
    // Frame-rate independent easing: the film trails the page by roughly a tenth of a second.
    eased += (p - eased) * (1 - Math.exp(-(now - last) / 90));
    last = now;
    render(eased);
    requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || !visible || !live()) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      start();
    },
    { rootMargin: '10% 0px' },
  ).observe(track);

  rings.forEach((ring) =>
    ring.addEventListener('click', () => {
      const rect = track.getBoundingClientRect();
      const top =
        scrollY +
        rect.top +
        (Number(ring.dataset.stop) / duration) * (1 - HOLD) * (rect.height - innerHeight) +
        2;
      scrollTo({ top, behavior: 'smooth' });
    }),
  );

  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Play film' : 'Pause film';
    if (!paused) video.currentTime = eased * duration;
  });

  motion.addEventListener('change', () => {
    attach();
    start();
  });

  const afterPaint = (): void => {
    requestAnimationFrame(() =>
      setTimeout(() => {
        attach();
        start();
      }, 0),
    );
  };
  if (document.readyState === 'complete') afterPaint();
  else addEventListener('load', afterPaint, { once: true });
}
