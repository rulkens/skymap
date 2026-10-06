/*
 * initFlight — scroll moves the hero along its flight without a rest. The
 * stills carry the flight everywhere; where `data-film` was set before first
 * paint, the film is attached after load and plays over them. Scroll is never
 * touched: the picture follows the page, not the other way round. Nothing
 * here changes layout, so a film that never arrives costs no shift.
 */
import type { FlightTimeline } from '../@types/FlightTimeline';
import { flightAt } from '../utils/flightAt';
import { flightDistanceKm } from '../utils/flightDistanceKm';
import { flightStillWeights } from '../utils/flightStillWeights';
import { followDamped } from '../utils/followDamped';
import { formatScale } from '../utils/formatScale';

// Keep identical to the inline script's query in components/Flight.astro.
const FILM_QUERY =
  '(min-width: 960px) and (min-height: 600px) and (min-aspect-ratio: 4/3) and (prefers-reduced-motion: no-preference)';
// How much larger a still starts than it ends, over the two legs it is on screen: scrolling pulls it back.
const PULL_BACK = 0.12;
// As shares of a leg: a stop's caption starts to leave here, and the next one's starts to
// arrive once it has gone, so two captions never share the corner they are both set in.
const CAPTION_LEAVES = 0.3;
const CAPTION_ARRIVES = 0.5;
const CAPTION_FADE = 0.2;
// Half a film frame, so a seek to a stop's time lands on that frame and not the one before.
const HALF_FRAME = 1 / 48;
// Per second: the picture settles on a new scroll position in about a quarter of a second.
const FOLLOW_RATE = 14;
// The path is measured from Earth's centre; the readout says "from Earth", so it counts from the surface.
const EARTH_RADIUS_KM = 6371;
const unit = (v: number): number => Math.max(0, Math.min(1, v));

export function initFlight(root: HTMLElement): void {
  const timeline: FlightTimeline = JSON.parse(root.dataset.timeline!);
  const { knots } = timeline;
  const count = knots.length - 1;
  const track = root.querySelector<HTMLElement>('.track')!;
  const video = root.querySelector<HTMLVideoElement>('.film')!;
  const intro = root.querySelector<HTMLElement>('[data-intro]')!;
  const arrive = root.querySelector<HTMLElement>('[data-arrive]')!;
  const fill = root.querySelector<HTMLElement>('[data-fill]')!;
  const scale = root.querySelector<HTMLElement>('[data-scale]')!;
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
  let speed = 0;
  let last = 0;
  let current = -1;
  let fetched = -1;

  function attach(): void {
    if (video.src || !root.hasAttribute('data-film')) return;
    video.addEventListener('loadeddata', () => (loaded = true), { once: true });
    // A missing or undecodable film leaves the stills, which are already the page.
    video.addEventListener('error', () => {
      loaded = false;
      root.classList.remove('has-video');
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
    const film = loaded && filmFits.matches;
    const at = pose.index + pose.travel;

    const target = Math.min(pose.sec + HALF_FRAME, knots[count]!.sec);
    if (film && !video.seeking && Math.abs(video.currentTime - target) > 0.02) {
      video.currentTime = target;
    }
    root.classList.toggle('has-video', film);

    const weights = flightStillWeights(pose, count);
    const under = Math.min(pose.index, count - 1);
    pictures.forEach((el, k) => {
      const weight = snap ? Math.round(weights[k]!) : weights[k]!;
      // The earlier still stays solid under the later one, so the pair never thins to the black behind.
      el.style.opacity = String(k === under && !snap ? 1 : weight);
      if (weight === 0 || film || snap) {
        el.style.transform = '';
        return;
      }
      // On screen from the stop before its own to the one after, shrinking all the way.
      el.style.transform = `scale(${(1 + (PULL_BACK * (k + 1 - at)) / 2).toFixed(4)})`;
    });

    const leaving = snap
      ? Math.round(pose.travel)
      : unit((pose.travel - CAPTION_LEAVES) / CAPTION_FADE);
    const arriving = snap
      ? Math.round(pose.travel)
      : unit((pose.travel - CAPTION_ARRIVES) / CAPTION_FADE);
    words.forEach((el, k) => {
      const opacity = k === pose.index ? 1 - leaving : k === pose.index + 1 ? arriving : 0;
      el.style.opacity = String(opacity);
      // An invisible control must not take focus or clicks.
      if (el === intro || el === arrive) {
        el.inert = opacity < 0.5;
        el.style.pointerEvents = opacity < 0.5 ? 'none' : 'auto';
      }
    });
    // The readout shares the bottom edge with the wordmark block's hint, so it waits for that block to leave.
    scale.style.opacity = String(pose.index === 0 ? leaving : 1);

    const readout = `Camera: ${formatScale(flightDistanceKm(pose.sec) - EARTH_RADIUS_KM)} from Earth`;
    if (scale.textContent !== readout) scale.textContent = readout;

    fill.style.height = `${p * 100}%`;
    const shown = Math.min(Math.round(at), count - 1);
    if (shown !== current) {
      current = shown;
      rings.forEach((ring, k) => ring.setAttribute('aria-current', String(k === shown)));
    }
    // Fetch the stills just ahead (and behind, for a visitor scrolling back up): none until
    // the page has loaded, so only the first competes for the first paint, then one, then two.
    const ahead = document.readyState !== 'complete' ? 0 : p > 0 ? 2 : 1;
    if (shown * 3 + ahead !== fetched) {
      fetched = shown * 3 + ahead;
      stops.forEach((stop, k) => {
        if (Math.abs(k - shown) <= ahead) stop.classList.add('near');
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
    if (eased < 0 || still.matches) {
      eased = p;
      speed = 0;
    } else {
      // A wheel moves the page in steps and a film seek takes a frame or two: the picture
      // follows with its own momentum, so neither shows as a stutter.
      const next = followDamped(eased, speed, p, FOLLOW_RATE, (now - last) / 1000);
      eased = unit(next.value);
      speed = next.velocity;
    }
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
      const top = scrollY + track.getBoundingClientRect().top + knots[k]!.at * range();
      scrollTo({ top, behavior: still.matches ? 'auto' : 'smooth' });
    }),
  );

  const afterPaint = (): void => {
    requestAnimationFrame(() => setTimeout(attach, 0));
  };
  if (document.readyState === 'complete') afterPaint();
  else addEventListener('load', afterPaint, { once: true });
}
