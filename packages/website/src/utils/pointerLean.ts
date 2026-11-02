import type { PointerEvent } from 'react';

/**
 * The pointer's place over the element it moves on, -1 to 1 each way from its middle (0 once it leaves), set as
 * `--lean-x` and `--lean-y` for the pieces inside to lean by, nearer ones further. Bind it to both
 * `onPointerMove` and `onPointerLeave`.
 */
export function pointerLean(event: PointerEvent<HTMLElement>): void {
  const stage = event.currentTarget;
  const box = stage.getBoundingClientRect();
  const inside = event.type === 'pointermove';
  const x = inside ? ((event.clientX - box.left) / box.width) * 2 - 1 : 0;
  const y = inside ? ((event.clientY - box.top) / box.height) * 2 - 1 : 0;
  stage.style.setProperty('--lean-x', x.toFixed(3));
  stage.style.setProperty('--lean-y', y.toFixed(3));
}
