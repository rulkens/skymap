// How an element marked `data-reveal="rise"` or `"unmask"` arrives the first time it scrolls into view, played
// once: imported by layouts/Base.astro's script. Only elements below the first screen wait, held at their first
// frame by a paused animation until a tenth of them is in view. Animations, not attributes, so an island's
// React never meets markup it did not render. Without script or with reduced motion nothing waits.
import { lessWanted } from '../utils/lessWanted.ts';

// A reveal's pace (site.css `--duration-reveal`, `--ease-enter`).
const TIMING = { duration: 450, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'backwards' } as const;

// Each kind's animations of one element: up a little from nothing; or a veil (motion.module.css `unmask`)
// sliding off its picture while the picture settles from a touch larger.
const KINDS: Record<string, (el: HTMLElement, delay: number) => Animation[]> = {
  rise: (el, delay) => [
    el.animate({ opacity: [0, 1], translate: ['0 1.5rem', '0 0'] }, { ...TIMING, delay }),
  ],
  unmask: (el, delay) => {
    // The veil's own place, off the picture, is where it slides to.
    const rest = getComputedStyle(el, '::before').translate;
    return [
      el.animate(
        { translate: ['0 0', rest] },
        { ...TIMING, duration: 500, delay, pseudoElement: '::before' },
      ),
      ...[...el.querySelectorAll('img, video')].map((media) =>
        media.animate({ scale: [1.06, 1] }, { ...TIMING, duration: 500, delay }),
      ),
    ];
  },
};

const waiting = new Map<Element, Animation[]>();
const seen = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const animation of waiting.get(entry.target) ?? []) animation.play();
      waiting.delete(entry.target);
      seen.unobserve(entry.target);
    }
  },
  { threshold: 0.1 },
);

if (!lessWanted().motion) {
  for (const el of document.querySelectorAll<HTMLElement>('[data-reveal]')) {
    const kind = KINDS[el.dataset.reveal ?? ''];
    if (!kind || el.getBoundingClientRect().top <= window.innerHeight) continue;
    const delay = parseFloat(getComputedStyle(el).getPropertyValue('--reveal-delay')) || 0;
    const animations = kind(el, delay);
    for (const animation of animations) animation.pause();
    waiting.set(el, animations);
    seen.observe(el);
  }
}
