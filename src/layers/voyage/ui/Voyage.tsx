/**
 * Voyage — the voyage exhibit's notes section: destination tabs, the transport (run/pause, the
 * ship's clock, − / + speed), the scrub track in ship years, the readouts and the three effect
 * switches. Presentational: the container hands it the ship's state (throttled, never per frame)
 * and the cluster's toggles, and takes the callbacks back.
 */

import { useId } from 'react';
import type { ReactNode } from 'react';
import cx from 'classnames';

import VoyageDestinationTabs from './VoyageDestinationTabs';
import VoyageReadouts from './VoyageReadouts';
import VoyageTrack from './VoyageTrack';
import type { VoyageClock } from '../@types/VoyageClock';
import type { VoyageDestination } from '../@types/VoyageDestination';
import type { VoyageDestinationId } from '../@types/VoyageDestinationId';
import type { VoyageReadouts as Readouts } from '../@types/VoyageReadouts';
import styles from './Voyage.module.css';

export type VoyageProps = {
  readonly heading: string;
  readonly destinations: readonly VoyageDestination[];
  readonly selectedId: VoyageDestinationId;
  readonly tauYr: number;
  readonly tauTotalYr: number;
  readonly readouts: Readouts;
  readonly clock: VoyageClock;
  readonly effects: {
    readonly contraction: boolean;
    readonly doppler: boolean;
    readonly headlight: boolean;
  };
  readonly onSelect: (id: VoyageDestinationId) => void;
  readonly onSeekTau: (tauYr: number) => void;
  readonly onPlayPause: () => void;
  readonly onSlower: () => void;
  readonly onFaster: () => void;
  readonly onContraction: (on: boolean) => void;
  readonly onDoppler: (on: boolean) => void;
  readonly onHeadlight: (on: boolean) => void;
};

function Voyage(props: VoyageProps): ReactNode {
  const { readouts, clock, effects } = props;
  const headingId = useId();
  const switches = [
    { label: 'Contraction', on: effects.contraction, set: props.onContraction },
    { label: 'Doppler shift', on: effects.doppler, set: props.onDoppler },
    { label: 'Headlight', on: effects.headlight, set: props.onHeadlight },
  ];

  return (
    <div className={styles.root} role="group" aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.heading}>
        {props.heading}
      </h2>
      <VoyageDestinationTabs
        destinations={props.destinations}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
      />
      <div className={styles.story}>
        <div className={styles.transport}>
          <button
            type="button"
            className={cx(styles.iconBtn, styles.playBtn)}
            aria-label={clock.paused ? 'Run the clock' : 'Pause the clock'}
            onClick={props.onPlayPause}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              {clock.paused ? (
                <path d="M4 2.5v11L13.5 8z" fill="currentColor" />
              ) : (
                <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
              )}
            </svg>
          </button>
          <div className={styles.when}>
            <span className={styles.whenValue}>{readouts.shipClock}</span>
            <span className={styles.whenLabel}>Ship’s clock</span>
          </div>
          <div className={styles.rate}>
            <button
              type="button"
              className={cx(styles.iconBtn, styles.rateBtn)}
              aria-label="Slower"
              disabled={clock.atSlowest}
              onClick={props.onSlower}
            >
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path d="M1.5 5h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <b className={styles.rateLabel}>
              {clock.profiled ? <i className={styles.pulse} /> : null}
              {clock.rateLabel}
            </b>
            <button
              type="button"
              className={cx(styles.iconBtn, styles.rateBtn)}
              aria-label="Faster"
              disabled={clock.atFastest}
              onClick={props.onFaster}
            >
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M1.5 5h7M5 1.5v7"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <VoyageTrack
          tauYr={props.tauYr}
          tauTotalYr={props.tauTotalYr}
          valueText={readouts.shipClock}
          onSeekTau={props.onSeekTau}
        />
        <span className={styles.keys} aria-hidden="true">
          [ ] speed
        </span>
      </div>
      <VoyageReadouts readouts={readouts} />
      <div className={styles.switches}>
        {switches.map((s) => (
          <button
            key={s.label}
            type="button"
            role="switch"
            aria-checked={s.on}
            className={styles.switchRow}
            onClick={() => s.set(!s.on)}
          >
            <span className={styles.switchLabel}>
              {s.label} <span className={styles.switchState}>· {s.on ? 'on' : 'off'}</span>
            </span>
            <span className={cx(styles.switchTrack, s.on && styles.switchTrackOn)}>
              <span className={cx(styles.switchKnob, s.on && styles.switchKnobOn)} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default Voyage;
