/**
 * PassTimings — the per-pass GPU timestamp block under the HUD badges.
 *
 * These spans are ORDINAL, and the block says so in its own header rather than
 * trusting the reader to remember. The GPU is tile-based and deferred: it
 * overlaps passes, so a pass's begin/end pair covers wall time during which
 * other passes were also executing. The rows therefore rank passes and track
 * one pass against its own history; they do not sum to a frame and none of
 * them converts to a frame rate. Deliberately, no total is rendered here — the
 * `ms / fps` badge above is the additive number.
 *
 * Dark without the `?gpuTimings` URL gate (the app's spelling), or on an
 * adapter with no `timestamp-query` feature. The engine folds both cases into
 * one `timingEnabled: false`, so this renders one hint for either.
 */
import type { ReactNode } from 'react';
import type { PassTiming } from '../../../@types/engine/PassTiming';
import styles from './PassTimings.module.css';

export type PassTimingsProps = {
  readonly passes: readonly PassTiming[];
  readonly enabled: boolean;
};

function PassTimings({ passes, enabled }: PassTimingsProps): ReactNode {
  if (!enabled) {
    return (
      <div className={styles.root}>
        <div className={styles.hint}>gpu passes: add ?gpuTimings</div>
      </div>
    );
  }
  return (
    <div className={styles.root}>
      <div className={styles.header}>gpu passes · ordinal, not a total</div>
      {passes.map((pass) => (
        <div key={pass.slot} className={styles.row}>
          <span className={styles.slot}>{pass.slot}</span>
          <span className={styles.value}>{pass.ms.toFixed(2)} ms</span>
        </div>
      ))}
    </div>
  );
}

export default PassTimings;
