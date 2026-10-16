/*
 * useFlight — scroll moves the hero along its flight without a rest. The
 * stills carry the flight everywhere; the film, where there is one, plays over
 * them (useFlightFilm). Scroll is never touched except by a click on a ring:
 * the picture follows the page, not the other way round. The elements the
 * scroll moves are written directly every frame (`parts`); only the stop being
 * read and the stills worth fetching are state, since they change a few times.
 */
import { useCallback, useEffect } from 'react';

import type { FlightParts } from '../../@types/FlightParts';
import type { FlightTimeline } from '../../@types/FlightTimeline';
import { flightAt } from '../../utils/flightAt.ts';
import { flightDistanceKm } from '../../utils/flightDistanceKm.ts';
import { flightStillWeights } from '../../utils/flightStillWeights.ts';
import { followDamped } from '../../utils/followDamped.ts';
import { formatScale } from '../../utils/formatScale.ts';
import { useFlightFilm } from './useFlightFilm.ts';

// How much larger a still starts than it ends, over the two legs it is on screen: scrolling pulls it back.
const PULL_BACK = 0.12;
// As shares of a leg: a stop's caption starts to leave here, and the next one's starts to
// arrive once it has gone, so two captions never share the corner they are both set in.
// The change is short, so wherever the page stops a caption is nearly always at full strength.
const CAPTION_LEAVES = 0.44;
const CAPTION_ARRIVES = 0.5;
const CAPTION_FADE = 0.06;
// Pixels of scroll before the pinned stage lets go, over which the top bar's ground comes back:
// the closing words and the spine then scroll up under a bar that has its ground.
const GROUND_RETURN_PX = 160;
// Per second: the picture settles on a new scroll position in about a quarter of a second.
const FOLLOW_RATE = 14;
// The path is measured from Earth's centre; the readout says "from Earth", so it counts from the surface.
const EARTH_RADIUS_KM = 6371;
const unit = (v: number): number => Math.max(0, Math.min(1, v));

type FlightOptions = {
  timeline: FlightTimeline;
  videoUrl: string;
  parts: FlightParts;
  /** The stop being read changed. */
  onShown: (stop: number) => void;
  /** Stills from `from` to `to` are worth fetching now. */
  onReach: (from: number, to: number) => void;
};

/** Brings the pose to the page and returns the click on a ring: scroll the flight to that stop. */
export function useFlight({
  timeline,
  videoUrl,
  parts,
  onShown,
  onReach,
}: FlightOptions): (stop: number) => void {
  const showFilm = useFlightFilm(parts.video, videoUrl);

  useEffect(() => {
    const { knots } = timeline;
    const count = knots.length - 1;
    const track = parts.track.current!;
    const pictures = parts.pictures.current;
    const intro = parts.intro.current!;
    const arrive = parts.arrive.current!;
    const scale = parts.scale.current!;
    const hint = parts.hint.current!;
    const fill = parts.fill.current!;
    // The intro is the first stop's caption and the arrival block the last one's, so one rule fades all of them.
    const words = [intro, ...parts.captions.current.slice(1), arrive] as HTMLElement[];
    const still = matchMedia('(prefers-reduced-motion: reduce)');

    let visible = false;
    let running = false;
    let eased = -1;
    let speed = 0;
    let last = 0;
    let current = -1;
    let fetched = -1;
    let ground = -1;
    let handle = 0;

    function render(p: number): void {
      const pose = flightAt(timeline, p);
      const snap = still.matches;
      const film = showFilm(pose.sec, knots[count]!.sec);
      const at = pose.index + pose.travel;

      const weights = flightStillWeights(pose, count);
      const under = Math.min(pose.index, count - 1);
      pictures.forEach((el, k) => {
        if (!el) return;
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
      // The hint dips to nothing as the wordmark leaves, changes its words there, and goes when the last block arrives.
      const opening = pose.index === 0 && leaving < 0.5;
      const dip = pose.index === 0 ? Math.abs(1 - 2 * leaving) : 1;
      hint.style.opacity = String(dip * (1 - Number(arrive.style.opacity)));
      const nudge = opening ? 'Scroll to pull back' : 'Keep scrolling';
      if (hint.textContent !== nudge) hint.textContent = nudge;

      const readout = `Camera: ${formatScale(flightDistanceKm(pose.sec) - EARTH_RADIUS_KM)} from Earth`;
      if (scale.textContent !== readout) scale.textContent = readout;

      // The rings are evenly spaced, so the line fills by stops passed and is full at the last ring.
      fill.style.height = `${(Math.min(at, count - 1) / (count - 1)) * 100}%`;
      const shown = Math.min(Math.round(at), count - 1);
      if (shown !== current) {
        current = shown;
        onShown(shown);
      }
      // Fetch the stills just ahead (and behind, for a visitor scrolling back up): none until
      // the page has loaded, so only the first competes for the first paint, then one, then two.
      const ahead = document.readyState !== 'complete' ? 0 : p > 0 ? 2 : 1;
      if (shown * 3 + ahead !== fetched) {
        fetched = shown * 3 + ahead;
        onReach(shown - ahead, shown + ahead);
      }
    }

    const range = (): number => track.offsetHeight - innerHeight;

    // From the page's own position, not the eased one: the ground must be back when the stage moves.
    function showGround(): void {
      const left = range() + track.getBoundingClientRect().top;
      const next = Math.round(unit(1 - left / GROUND_RETURN_PX) * 100) / 100;
      if (next === ground) return;
      ground = next;
      document.documentElement.style.setProperty('--nav-ground', String(next));
    }

    function frame(now: number): void {
      showGround();
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
      handle = requestAnimationFrame(frame);
    }

    function start(): void {
      if (running || !visible) return;
      running = true;
      last = performance.now();
      handle = requestAnimationFrame(frame);
    }

    const watch = new IntersectionObserver(
      ([entry]) => {
        visible = entry!.isIntersecting;
        showGround();
        start();
      },
      { rootMargin: '10% 0px' },
    );
    watch.observe(track);

    return () => {
      watch.disconnect();
      cancelAnimationFrame(handle);
    };
  }, [timeline, parts, showFilm, onShown, onReach]);

  return useCallback(
    (stop: number) => {
      const track = parts.track.current!;
      const range = track.offsetHeight - innerHeight;
      const top = scrollY + track.getBoundingClientRect().top + timeline.knots[stop]!.at * range;
      scrollTo({
        top,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    },
    [parts, timeline],
  );
}
