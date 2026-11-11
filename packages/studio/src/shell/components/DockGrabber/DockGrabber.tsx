import type { KeyboardEvent, PointerEvent } from 'react';
import { DOCK_STEP, MAX_DOCK_FRACTION, MIN_DOCK_FRACTION } from '../../data/dockLimits';
import s from './DockGrabber.module.css';

type Props = {
  readonly fraction: number;
  readonly onChange: (fraction: number) => void;
};

/** The dock's top edge: drag it, or use the arrow keys (up grows the dock). The hook clamps. */
function DockGrabber({ fraction, onChange }: Props) {
  const onKeyDown = (event: KeyboardEvent) => {
    const grow = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (grow === 0) return;
    // Default-prevented, so the dock's handler leaves the arrow alone instead of selecting a row.
    event.preventDefault();
    onChange(fraction + grow * DOCK_STEP);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) =>
    event.currentTarget.setPointerCapture?.(event.pointerId);
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      onChange((window.innerHeight - event.clientY) / window.innerHeight);
  };

  return (
    <div
      className={s.root}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize studio"
      aria-valuemin={Math.round(MIN_DOCK_FRACTION * 100)}
      aria-valuemax={Math.round(MAX_DOCK_FRACTION * 100)}
      aria-valuenow={Math.round(fraction * 100)}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <span className={s.pill} />
    </div>
  );
}

export default DockGrabber;
