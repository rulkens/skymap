/**
 * NowCard — what runs on the dome, with the controls of that show; the page shows it only while one runs.
 * The dome sends the kind and id only; the label is looked up in the menu, and a missing one
 * (no menu yet, a dev clip) falls back to the kind's noun.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';
import RemoteIcon from '../RemoteIcon/RemoteIcon';
import { REMOTE_SHOW_KINDS } from '../../../data/remote/remoteShowKinds';
import type { RemoteCommand } from '../../../@types/remote/RemoteCommand';
import type { RemoteMenu } from '../../../@types/remote/RemoteMenu';
import type { RemoteMenuItem } from '../../../@types/remote/RemoteMenuItem';
import type { RemoteTakeover } from '../../../@types/remote/RemoteTakeover';
import controls from '../remoteControls.module.css';
import styles from './NowCard.module.css';

export type NowCardProps = {
  readonly takeover: RemoteTakeover;
  readonly menu: RemoteMenu | null;
  readonly onCommand: (command: RemoteCommand) => void;
};

function NowCard({ takeover, menu, onCommand }: NowCardProps): ReactNode {
  const kind = REMOTE_SHOW_KINDS[takeover.kind];
  const items: readonly RemoteMenuItem<string>[] = menu?.[kind.list] ?? [];
  const title = items.find((item) => item.id === takeover.id)?.label ?? kind.noun;
  const tour = takeover.kind === 'tour' ? takeover : null;
  const eyebrow = tour
    ? `Tour ${tour.beatIndex + 1}/${tour.beatCount}${tour.paused ? ', paused' : ''}`
    : kind.noun;

  return (
    <section className={styles.root} aria-label="Now running">
      <div className={styles.head}>
        <RemoteIcon glyph={kind.glyph} />
        <p role="status" className={styles.eyebrow}>
          {eyebrow}
        </p>
        <button
          type="button"
          className={cx(controls.button, styles.stop)}
          aria-label={`Stop ${kind.noun.toLowerCase()}`}
          onClick={() => onCommand({ name: 'exitTakeover', payload: null })}
        >
          <RemoteIcon glyph="stop" />
          Stop
        </button>
      </div>
      <h2 className={styles.title}>{title}</h2>
      {tour && (
        <>
          <div className={styles.ticks} aria-hidden="true">
            {Array.from({ length: tour.beatCount }, (_, beat) => (
              <span
                key={beat}
                className={cx(
                  beat < tour.beatIndex && styles.done,
                  beat === tour.beatIndex && styles.current,
                )}
              />
            ))}
          </div>
          <div className={styles.transport}>
            <button
              type="button"
              className={cx(controls.button, styles.step)}
              onClick={() => onCommand({ name: 'tourPrev', payload: null })}
            >
              <RemoteIcon glyph="prev" />
              Previous
            </button>
            <button
              type="button"
              className={cx(controls.button, styles.step, styles.primary)}
              onClick={() => onCommand({ name: 'tourTogglePause', payload: null })}
            >
              <RemoteIcon glyph={tour.paused ? 'play' : 'pause'} />
              {tour.paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              className={cx(controls.button, styles.step)}
              onClick={() => onCommand({ name: 'tourAdvance', payload: null })}
            >
              <RemoteIcon glyph="next" />
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default NowCard;
