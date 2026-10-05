/*
 * initFlight — scroll moves the hero through its stops. The stills carry the
 * flight everywhere; where `data-film` was set before first paint, the film is
 * attached after load and plays over them. Scroll is never touched: the
 * picture follows the page, not the other way round. Nothing here changes
 * layout, so a film that never arrives costs no shift.
 */
import type { FlightTimeline } from '../@types/FlightTimeline';
import { flightAt } from '../utils/flightAt';

// Keep identical to the inline script's query in components/Flight.astro.
const FILM_QUERY =
  '(min-width: 960px) and (min-height: 600px) and (min-aspect-ratio: 4/3) and (prefers-reduced-motion: no-preference)';
// How much larger a still starts than it ends: scrolling pulls it back.
const PULL_BACK = 0.16;
// A caption has gone by this share of the travel away from its stop.
const CAPTION_OUT = 0.3;
// Half a film frame, so a seek to a stop's time lands on that frame and not the one before.
const HALF_FRAME = 1 / 48;
const unit = (v: number): number => Math.max(0, Math.min(1, v));

export function initFlight(root: HTMLElement): void {
  const timeline: FlightTimeline = JSON.parse(root.dataset.timeline!);
  const { spans } = timeline;
  const count = spans.length - 1;
  const track = root.querySelector<HTMLElement>('.track')!;
  const video = root.querySelector<HTMLVideoElement>('.film')!;
  const intro = root.querySelector<HTMLElement>('[data-intro]')!;
  const arrive = root.querySelector<HTMLElement>('[data-arrive]')!;
  const fill = root.querySelector<HTMLElement>('[data-fill]')!;
  const rings = [...root.querySelectorAll<HTMLButtonElement>('[data-ring]')];
  const stops = [...root.querySelectorAll<HTMLElement>('[data-stop]')];
  const pictures = stops.map((stop) => stop.querySelector<HTMLElement>('picture')!);
  // The intro is the first stop's caption and the arrival block the last one's, so one rule fades all of them.
  const words = [
    intro,
    ...stops.slice(1).map((s) => s.querySelector<HTMLElement>('.cap')!),
    arrive,
  ];
  const filmFits = matchMedia(FILM_QUERY);
  const still = matchMedia('(prefers-reduced-motion: reduce)');

  let loaded = false;
  let visible = false;
  let running = false;
  let eased = -1;
  let last = 0;
  let current = -1;

  function attach(): void {
    if (video.src || !root.hasAttribute('data-film')) return;
    video.addEventListener('loadeddata', () => (loaded = true), { once: true });
    // A missing or undecodable film leaves the stills, which are already the page.
    video.addEventListener('error', () => {
      loaded = false;
      root.classList.remove('has-video', 'rest');
    });
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = new URL(root.dataset.video!, location.href).origin;
    document.head.append(link);
    video.preload = 'auto';
    video.src = root.dataset.video!;
  }

  function render(p: number): void {
    const pose = flightAt(timeline, p);
    const snap = still.matches;
    const mix = snap ? Math.round(pose.mix) : pose.mix;
    const film = loaded && filmFits.matches;
    const picture = Math.min(pose.index, count - 1);

    const target = pose.sec + HALF_FRAME;
    const settled = film && !video.seeking && Math.abs(video.currentTime - target) <= 0.02;
    if (film && !video.seeking && !settled) video.currentTime = target;
    root.classList.toggle('has-video', film);
    // Resting on a stop, the film is on the frame the still was cut from: show the still.
    root.classList.toggle('rest', settled && pose.travel === 0 && pose.index < count);

    pictures.forEach((el, k) => {
      const opacity = k === picture ? 1 : k === picture + 1 && pose.index < count ? mix : 0;
      el.style.opacity = String(opacity);
      if (opacity === 0 || film || snap) {
        el.style.transform = '';
        return;
      }
      const from = k === 0 ? 0 : spans[k - 1]!.fadeStart;
      const life = unit((p - from) / (spans[k]!.end - from));
      el.style.transform = `scale(${(1 + PULL_BACK * (1 - life)).toFixed(4)})`;
    });

    words.forEach((el, k) => {
      const leaving = snap ? Math.round(pose.travel) : unit(pose.travel / CAPTION_OUT);
      const arriving = snap ? mix : unit((mix - 0.5) * 2);
      const opacity = k === pose.index ? 1 - leaving : k === pose.index + 1 ? arriving : 0;
      el.style.opacity = String(opacity);
      // An invisible control must not take focus or clicks.
      if (el === intro || el === arrive) {
        el.inert = opacity < 0.5;
        el.style.pointerEvents = opacity < 0.5 ? 'none' : 'auto';
      }
    });

    fill.style.height = `${unit(p / spans[count]!.start) * 100}%`;
    const shown = Math.min(pose.index + Math.round(mix), count - 1);
    if (shown !== current) {
      current = shown;
      rings.forEach((ring, k) => ring.setAttribute('aria-current', String(k === shown)));
      // Fetch the stills just ahead, and the one behind for a visitor scrolling back up.
      stops.forEach((stop, k) => {
        if (Math.abs(k - shown) <= 2) stop.classList.add('near');
      });
    }
  }

  const range = (): number => track.offsetHeight - innerHeight;

  function frame(now: number): void {
    if (!visible) {
      running = false;
      return;
    }
    const p = unit(-track.getBoundingClientRect().top / range());
    // Frame-rate independent easing: the picture trails the page by roughly a tenth of a second.
    eased =
      eased < 0 || still.matches ? p : eased + (p - eased) * (1 - Math.exp(-(now - last) / 90));
    last = now;
    render(eased);
    requestAnimationFrame(frame);
  }

  function start(): void {
    if (running || !visible) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  new IntersectionObserver(
    ([entry]) => {
      visible = entry!.isIntersecting;
      start();
    },
    { rootMargin: '10% 0px' },
  ).observe(track);

  rings.forEach((ring, k) =>
    ring.addEventListener('click', () => {
      // Just inside the stop's rest, where its caption is fully up.
      const span = spans[k]!;
      const p = span.start + (span.dwellEnd - span.start) * 0.3;
      const top = scrollY + track.getBoundingClientRect().top + p * range();
      scrollTo({ top, behavior: still.matches ? 'auto' : 'smooth' });
    }),
  );

  const afterPaint = (): void => {
    requestAnimationFrame(() => setTimeout(attach, 0));
  };
  if (document.readyState === 'complete') afterPaint();
  else addEventListener('load', afterPaint, { once: true });
}
