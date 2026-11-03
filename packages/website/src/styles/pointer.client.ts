// The site's one pointer convention, imported by layouts/Base.astro's script once per page. A [data-turn] host gets
// `--turn-x`/`--turn-y`: the pointer's offset from its middle in its widths and heights, held to ±1; what it holds
// turns (Phone3D) or leans (motion.module.css `.lean`) by them. A [data-look] host instead faces the pointer from
// its own middle, each on its own: `--look-x`/`--look-y` are the offset over LOOK_DEPTH, the pointer taken to stand
// that far in front of the page, so atan() of them is the angle, held to MAX_YAW and MAX_PITCH.
// Scrolling moves the hosts under a still pointer, so a scroll recomputes from the last pointer place; a host far
// off-screen would otherwise keep the pose of a pointer a page away. On touch or reduced motion nothing is set.
const turning = document.querySelectorAll<HTMLElement>('[data-turn]');
const looking = document.querySelectorAll<HTMLElement>('[data-look]');
const follows = matchMedia(
  '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
);
const LOOK_DEPTH = 1000;
const MAX_YAW = Math.tan((35 * Math.PI) / 180);
const MAX_PITCH = Math.tan((15 * Math.PI) / 180);
const clamp = (v: number, max = 1): string => Math.max(-max, Math.min(max, v)).toFixed(3);

let pointer: { x: number; y: number } | undefined;
let queued = false;

function follow(): void {
  queued = false;
  if (!pointer || !follows.matches) return;
  for (const el of turning) {
    const box = el.getBoundingClientRect();
    el.style.setProperty('--turn-x', clamp((pointer.x - box.left) / box.width - 0.5));
    el.style.setProperty('--turn-y', clamp((pointer.y - box.top) / box.height - 0.5));
  }
  for (const el of looking) {
    const box = el.getBoundingClientRect();
    const x = pointer.x - box.left - box.width / 2;
    const y = pointer.y - box.top - box.height / 2;
    el.style.setProperty('--look-x', clamp(x / LOOK_DEPTH, MAX_YAW));
    el.style.setProperty('--look-y', clamp(y / LOOK_DEPTH, MAX_PITCH));
  }
}

function queue(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(follow);
}

if (turning.length + looking.length > 0) {
  document.addEventListener('pointermove', (event) => {
    pointer = { x: event.clientX, y: event.clientY };
    queue();
  });
  addEventListener('scroll', queue, { passive: true });
}
