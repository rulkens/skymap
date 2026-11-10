/**
 * SkyHud — what says "you are standing here, looking there": the place and the horizon compass,
 * then the one way out (Leave, Esc) with the clock skips that apply beside it. Bottom
 * centre on both layouts; the phone lifts it above the dock and the scale slot and prints no keys.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import SkyCompass from './SkyCompass/SkyCompass';
import ActionPill from '../common/ActionPill/ActionPill';
import CloseIcon from '../icons/CloseIcon/CloseIcon';
import styles from './SkyHud.module.css';

export type SkyHudProps = {
  readonly phone: boolean;
  readonly place: string;
  readonly azimuthDeg: number;
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
      <div className={styles.actions}>
        <ActionPill
          icon={<CloseIcon size={12} />}
          label="Leave"
          keyHint={phone ? undefined : 'Esc'}
          aria-keyshortcuts={phone ? undefined : 'Escape'}
          onClick={onLeave}
        />
        {onSkipToTonight !== null && (
          <ActionPill label="Skip to tonight" onClick={onSkipToTonight} />
        )}
        {onSkipToRise !== null && (
          <ActionPill label="Skip to when it rises" onClick={onSkipToRise} />
        )}
      </div>
      {riseNote !== null && <p className={styles.note}>{riseNote}</p>}
    </section>
  );
}

export default SkyHud;
