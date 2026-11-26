/**
 * Slider — a value slider that folds the label and the value into one pill (label
 * left, value right, the fill bar behind both), so a stack reads as a dense dial
 * board; dialkit's Slider in skymap's tokens. No native range input: `role="slider"`
 * and the keys are ours, and the fill's CSS transition makes a key nudge glide
 * (`.dragging` drops it so a drag tracks the pointer). A drag maps clientX across
 * the full padded width to [min, max], snapped to `step`. Right-click or Enter
 * swaps the value for a text box in the same box (useSliderTextEdit), and a failed
 * Enter says why in a tip above it; the drag is primary-button only.
 */

import {
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import cx from 'classnames';
import type { SliderDisplayed } from '../../../@types/components/SliderDisplayed';
import { decimalsForStep } from '../../../utils/math/decimalsForStep';
import { snapToStep } from '../../../utils/math/snapToStep';
import { useSliderTextEdit } from './useSliderTextEdit';
import styles from './Slider.module.css';

export type SliderProps = {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly onChange: (value: number) => void;
  /** Formats the value shown inside the pill. Defaults to fixed decimals derived from `step`. */
  readonly format?: (value: number) => string;
  /** Only when `format` shows another quantity than `value` (degrees for stops): the typed box then works in it. */
  readonly displayed?: SliderDisplayed;
  readonly disabled?: boolean;
  readonly size?: 'default' | 'compact';
};

function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
  displayed,
  disabled = false,
  size = 'default',
}: SliderProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const labelId = useId();
  const reasonId = useId();
  // Per instance, like InfoTip's: a shared anchor name would bind every tip to the last pill.
  const anchorName = `--slider-${labelId.replace(/[^a-zA-Z0-9]/g, '')}`;
  // The reason opens in the top layer: the pill clips its children, and the sidebars
  // around it are glass and scroll boxes that would re-base or clip a fixed tip.
  const openAsPopover = useCallback((el: HTMLDivElement | null) => el?.showPopover(), []);
  const edit = useSliderTextEdit({
    value,
    min,
    max,
    step,
    onChange,
    displayed,
    sliderRef: rootRef,
  });

  const span = max - min || 1;
  const percent = Math.min(1, Math.max(0, (value - min) / span)) * 100;
  const display = format ? format(value) : value.toFixed(decimalsForStep(step));

  const commitFromClientX = (clientX: number) => {
    const rect = rectRef.current;
    if (!rect) return;
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const next = snapToStep(min + t * span, min, max, step);
    if (next !== value) onChange(next);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Ctrl+click is the Mac's right-click: it opens the text box, not a drag.
    if (disabled || edit.editing || e.button !== 0 || e.ctrlKey) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    rectRef.current = e.currentTarget.getBoundingClientRect();
    setDragging(true);
    commitFromClientX(e.clientX);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    commitFromClientX(e.clientX);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(false);
  };

  // While editing, the box keeps its own context menu (paste).
  const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (disabled || edit.editing) return;
    e.preventDefault();
    edit.start();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || edit.editing) return;
    let next: number | null = null;
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        edit.start();
        return;
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + step;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - step;
        break;
      case 'PageUp':
        next = value + step * 10;
        break;
      case 'PageDown':
        next = value - step * 10;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    const snapped = snapToStep(next, min, max, step);
    if (snapped !== value) onChange(snapped);
  };

  // A slider's children are presentational to assistive tech, so the role steps aside
  // while the text box is inside; tabIndex -1 keeps the pill focusable for the hand-back.
  const semantics = edit.editing
    ? { tabIndex: -1 }
    : {
        role: 'slider',
        'aria-label': label,
        'aria-valuemin': min,
        'aria-valuemax': max,
        'aria-valuenow': value,
        'aria-valuetext': display,
        'aria-disabled': disabled || undefined,
        'aria-keyshortcuts': disabled ? undefined : 'Enter',
        tabIndex: disabled ? -1 : 0,
      };

  return (
    <div
      ref={rootRef}
      className={cx(
        styles.root,
        size === 'compact' && styles.compact,
        dragging && styles.dragging,
        edit.editing && styles.editing,
        disabled && styles.disabled,
      )}
      {...semantics}
      style={edit.reason ? { anchorName } : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
    >
      <div className={styles.fill} style={{ width: `${percent}%` }} />
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      {edit.editing ? (
        <input
          className={styles.input}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-labelledby={labelId}
          aria-describedby={edit.reason ? reasonId : undefined}
          {...edit.input}
        />
      ) : (
        <span className={styles.value}>{display}</span>
      )}
      {edit.reason && (
        <div
          ref={openAsPopover}
          id={reasonId}
          role="alert"
          popover="manual"
          className={styles.reason}
          style={{ positionAnchor: anchorName }}
        >
          {edit.reason}
        </div>
      )}
    </div>
  );
}

export default Slider;
