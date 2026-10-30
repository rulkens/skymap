// Holds back every [data-reveal] below the first screen (motion.module.css) until a tenth of it is in view, then
// lets it arrive, once: imported by layouts/Base.astro's script. Islands render the attribute on the server, so
// it is there before they hydrate; `data-wait` is never rendered by React, so hydration never sees it.
import { lessWanted } from '../utils/lessWanted.ts';

const below = [...document.querySelectorAll<HTMLElement>('[data-reveal]')].filter(
  (el) => el.getBoundingClientRect().top > window.innerHeight,
);

if (below.length > 0 && !lessWanted().motion) {
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.removeAttribute('data-wait');
        seen.unobserve(entry.target);
      }
    },
    { threshold: 0.1 },
  );
  for (const el of below) {
    el.setAttribute('data-wait', '');
    seen.observe(el);
  }
}
