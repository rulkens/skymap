/**
 * AxisHoldButtons: hold one to make the trackpad's next drag look, roll or zoom; letting go
 * returns to orbit. Not sticky, and the dome latches the axis when a drag starts, so releasing
 * mid-drag changes nothing until the next press. Siblings of the pad, so their pointers never
 * reach its device channel; capture on the button (not the pad) makes a sliding finger still release.
 */

import { useEffect } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import cx from 'classnames';
import type { RemoteNavAxis } from '../../../@types/remote/RemoteNavAxis';
import type { RemoteGlyph } from '../../../@types/remote/RemoteGlyph';
import RemoteIcon from '../RemoteIcon/RemoteIcon';
import styles from './AxisHoldButtons.module.css';

export type AxisHoldButtonsProps = {
  /** The axis in effect: orbit whenever nothing else is held. */
  readonly axis: RemoteNavAxis;
  readonly onChange: (axis: RemoteNavAxis) => void;
};

const BUTTONS: readonly { id: RemoteNavAxis; label: string; glyph: RemoteGlyph }[] = [
  { id: 'orbit', label: 'Orbit (default)', glyph: 'orbit' },
  { id: 'look', label: 'Hold to look around', glyph: 'look' },
  { id: 'roll', label: 'Hold to roll', glyph: 'roll' },
  { id: 'zoom', label: 'Hold to zoom', glyph: 'zoom' },
];

const isHoldKey = (event: KeyboardEvent): boolean => event.key === ' ' || event.key === 'Enter';

function AxisHoldButtons({ axis, onChange }: AxisHoldButtonsProps): ReactNode {
  const release = (): void => onChange('orbit');

  useEffect(() => {
    const onHidden = (): void => {
      if (document.hidden) onChange('orbit');
    };
    const onBlur = (): void => onChange('orbit');
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [onChange]);

  return (
    <div className={styles.root}>
      {BUTTONS.map(({ id, label, glyph }) => (
        <button
          key={id}
          type="button"
          aria-label={label}
          aria-pressed={axis === id}
          className={cx(styles.button, axis === id && styles.active)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            onChange(id);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (isHoldKey(event) && !event.repeat) onChange(id);
          }}
          onKeyUp={(event) => {
            if (isHoldKey(event)) release();
          }}
        >
          <RemoteIcon glyph={glyph} />
        </button>
      ))}
    </div>
  );
}

export default AxisHoldButtons;
