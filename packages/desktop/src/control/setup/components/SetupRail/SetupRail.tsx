/**
 * SetupRail — the five steps, so the length is known from the start. Every step can be opened from
 * here, since each choice saves on its own; on one screen "Which screen" is passed over and says why.
 */

import type { ReactNode } from 'react';
import CheckIcon from '../../../../../../../src/components/icons/CheckIcon/CheckIcon';
import type { SetupStep } from '../../@types/SetupStep';
import { SETUP_STEP_ORDER } from '../../data/setupStepOrder';
import { SETUP_STEPS } from '../../data/setupSteps';
import { hasOneScreen } from '../../utils/hasOneScreen';
import chrome from '../../../controlChrome.module.css';
import styles from './SetupRail.module.css';

export type SetupRailProps = {
  readonly step: SetupStep;
  readonly displayCount: number;
  readonly onStep: (step: SetupStep) => void;
};

function SetupRail({ step, displayCount, onStep }: SetupRailProps): ReactNode {
  const at = SETUP_STEP_ORDER.indexOf(step);
  return (
    <nav className={styles.root} aria-label="Setup steps">
      <ol className={styles.list}>
        {SETUP_STEPS.map(({ step: item, name }, index) => {
          const skipped = item === 'display' && hasOneScreen(displayCount);
          const current = item === step;
          const done = !skipped && index < at;
          return (
            <li key={item}>
              <button
                type="button"
                className={styles.item}
                disabled={skipped}
                aria-current={current ? 'step' : undefined}
                onClick={() => onStep(item)}
              >
                <span className={styles.mark}>
                  {done ? (
                    <CheckIcon size={18} />
                  ) : (
                    <span className={current ? styles.markerCurrent : chrome.marker} />
                  )}
                </span>
                <span className={styles.name}>{name}</span>
                {skipped && <span className={styles.note}>One screen, so the sky uses it</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default SetupRail;
