/**
 * SkyHud — what says "you are standing here, looking there": the place, the horizon compass and
 * its readout, then the one way out (Leave, Esc) with the clock skips that apply beside it. Bottom
 * centre on both layouts; the phone lifts it above the dock and the scale slot and prints no keys.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import SkyCompass from './SkyCompass/SkyCompass';
import CloseIcon from '../icons/CloseIcon/CloseIcon';
import styles from './SkyHud.module.css';

export type SkyHudProps = {
  readonly phone: boolean;
  readonly place: string;
  readonly azimuthDeg: number;
  /** "180° · 34° up". */
  readonly heading: string;
  readonly onLeave: () => void;
  /** Null while the sun is down at the spot. */
  readonly onSkipToTonight: (() => void) | null;
  /** Null unless the last search is below the horizon and rises later. */
  readonly onSkipToRise: (() => void) | null;
  /** Says why there is no rise to skip to; null otherwise. */
  readonly riseNote: string | null;
};

function SkyHud({
  phone,
  place,
  azimuthDeg,
  heading,
  onLeave,
  onSkipToTonight,
  onSkipToRise,
  riseNote,
}: SkyHudProps): ReactNode {
  return (
    <section className={cx(styles.root, phone && styles.phone)} aria-label="Sky mode">
      <h2 className={styles.title}>
        <span className={styles.tag}>Sky</span>
        <span className={styles.place}>{place}</span>
      </h2>
      <SkyCompass azimuthDeg={azimuthDeg} />
      <p className={styles.heading}>{heading}</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={onLeave}
          aria-keyshortcuts={phone ? undefined : 'Escape'}
        >
          <CloseIcon size={12} />
          Leave
          {!phone && (
            <kbd className={styles.key} aria-hidden="true">
              Esc
            </kbd>
          )}
        </button>
        {onSkipToTonight !== null && (
          <button type="button" className={styles.button} onClick={onSkipToTonight}>
            Skip to tonight
          </button>
        )}
        {onSkipToRise !== null && (
          <button type="button" className={styles.button} onClick={onSkipToRise}>
            Skip to when it rises
          </button>
        )}
      </div>
      {riseNote !== null && <p className={styles.note}>{riseNote}</p>}
    </section>
  );
}

export default SkyHud;
