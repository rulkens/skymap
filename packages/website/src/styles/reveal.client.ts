// How an element marked `data-reveal="rise"` arrives the first time it scrolls into view, played once:
// imported by layouts/Base.astro's script. Only elements below the first screen wait, held at their first
// frame by a paused animation until a tenth of them is in view. Animations, not attributes, so an island's
// React never meets markup it did not render. Without script or with reduced motion nothing waits.
import { lessWanted } from '../utils/lessWanted.ts';

// A reveal's pace (site.css `--duration-reveal`, `--ease-enter`).
const TIMING = { duration: 450, easing: 'cubic-bezier(0, 0, 0.2, 1)', fill: 'backwards' } as const;

const waiting = new Map<Element, Animation>();
const seen = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      waiting.get(entry.target)?.play();
      waiting.delete(entry.target);
      seen.unobserve(entry.target);
    }
  },
  { threshold: 0.1 },
);

if (!lessWanted().motion) {
  for (const el of document.querySelectorAll<HTMLElement>('[data-reveal="rise"]')) {
    if (el.getBoundingClientRect().top <= window.innerHeight) continue;
    const delay = parseFloat(getComputedStyle(el).getPropertyValue('--reveal-delay')) || 0;
    // Up a little from nothing.
    const rise = el.animate(
      { opacity: [0, 1], translate: ['0 1.5rem', '0 0'] },
      { ...TIMING, delay },
    );
    rise.pause();
    waiting.set(el, rise);
    seen.observe(el);
  }
}
