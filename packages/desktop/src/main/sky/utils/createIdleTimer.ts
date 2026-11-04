import type { IdleTimer } from '../@types/IdleTimer';

/**
 * Calls `onIdle` once `idleMs` pass without a `poke`, and `onActive` on the first poke after that.
 * Starts counting at once, so a window nobody touches still goes idle.
 */
export function createIdleTimer(
  idleMs: number,
  onIdle: () => void,
  onActive: () => void,
): IdleTimer {
  let idle = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      idle = true;
      onIdle();
    }, idleMs);
  };
  arm();
  return {
    poke: () => {
      if (idle) {
        idle = false;
        onActive();
      }
      arm();
    },
    stop: () => clearTimeout(timer),
  };
}
