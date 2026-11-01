// Every Phone3D on the page turned a little toward the pointer: imported by layouts/Base.astro's script, once per page.
// On a touch screen or under reduced motion nothing is set and the phone keeps its fixed tilt.
const phones = document.querySelectorAll<HTMLElement>('[data-phone3d]');
const follows = matchMedia(
  '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
);
const clamp = (v: number): string => Math.max(-1, Math.min(1, v)).toFixed(3);

if (phones.length > 0) {
  document.addEventListener('pointermove', (event) => {
    if (!follows.matches) return;
    for (const phone of phones) {
      const box = phone.getBoundingClientRect();
      phone.style.setProperty('--turn-x', clamp((event.clientX - box.left) / box.width - 0.5));
      phone.style.setProperty('--turn-y', clamp((event.clientY - box.top) / box.height - 0.5));
    }
  });
}
