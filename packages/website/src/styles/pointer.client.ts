// The site's one pointer convention, imported by layouts/Base.astro's script once per page. A [data-turn] host gets
// `--turn-x`/`--turn-y`: the pointer's offset from its middle in its widths and heights, held to ±1; what it holds
// turns (Phone3D) or leans (motion.module.css `.lean`) by them. A [data-look] host instead faces the pointer from
// its own middle, each on its own: `--look-x`/`--look-y` are the offset over LOOK_DEPTH, the pointer taken to stand
// that far in front of the page, so atan() of them is the angle.
// On a touch screen or under reduced motion nothing is set and each keeps its rest pose.
const turning = document.querySelectorAll<HTMLElement>('[data-turn]');
const looking = document.querySelectorAll<HTMLElement>('[data-look]');
const follows = matchMedia(
  '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
);
const LOOK_DEPTH = 1000;
const clamp = (v: number): string => Math.max(-1, Math.min(1, v)).toFixed(3);

if (turning.length + looking.length > 0) {
  document.addEventListener('pointermove', (event) => {
    if (!follows.matches) return;
    for (const el of turning) {
      const box = el.getBoundingClientRect();
      el.style.setProperty('--turn-x', clamp((event.clientX - box.left) / box.width - 0.5));
      el.style.setProperty('--turn-y', clamp((event.clientY - box.top) / box.height - 0.5));
    }
    for (const el of looking) {
      const box = el.getBoundingClientRect();
      const x = event.clientX - box.left - box.width / 2;
      const y = event.clientY - box.top - box.height / 2;
      el.style.setProperty('--look-x', (x / LOOK_DEPTH).toFixed(3));
      el.style.setProperty('--look-y', (y / LOOK_DEPTH).toFixed(3));
    }
  });
}
