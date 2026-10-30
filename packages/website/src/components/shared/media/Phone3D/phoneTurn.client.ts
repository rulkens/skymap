// Every Phone3D on the page turned a little toward the pointer, and every [data-turn] host with all it holds:
// imported by layouts/Base.astro's script, once per page. The offset is from the element's middle, held to ±1.
// On a touch screen or under reduced motion nothing is set and each keeps its rest pose.
const turning = document.querySelectorAll<HTMLElement>('[data-phone3d], [data-turn]');
const follows = matchMedia(
  '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
);
const clamp = (v: number): string => Math.max(-1, Math.min(1, v)).toFixed(3);

if (turning.length > 0) {
  document.addEventListener('pointermove', (event) => {
    if (!follows.matches) return;
    for (const el of turning) {
      const box = el.getBoundingClientRect();
      el.style.setProperty('--turn-x', clamp((event.clientX - box.left) / box.width - 0.5));
      el.style.setProperty('--turn-y', clamp((event.clientY - box.top) / box.height - 0.5));
    }
  });
}
