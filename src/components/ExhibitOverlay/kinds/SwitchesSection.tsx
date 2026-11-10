/**
 * SwitchesSection — the exhibit's view switches as buttons in the notes column, placed by the
 * body order. It reaches the store itself, as a kind gets only its `data`; nothing is kept
 * locally, and `withSceneSnapshotSaga`'s snapshot rewinds every switch on exit.
 */

import type { ReactNode } from 'react';

import EyeIcon from '../../icons/EyeIcon/EyeIcon';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectSettings } from '../../../state/settings/selectSettings';
import { isExhibitSwitchOn } from '../../../utils/exhibits/isExhibitSwitchOn';
import { setVisibilityActionsFor } from '../../../utils/visibility/setVisibilityActionsFor';
import type { ExhibitSwitchesSection } from '../../../@types/exhibits/ExhibitSwitchesSection';
import styles from '../ExhibitOverlay.module.css';

export type SwitchesSectionProps = {
  readonly data: ExhibitSwitchesSection;
};

function SwitchesSection({ data }: SwitchesSectionProps): ReactNode {
  const dispatch = useAppDispatch();
  const settings = useAppSelector(selectSettings);
  return (
    <div className={styles.switches}>
      {data.switches.map((sw) => {
        const on = isExhibitSwitchOn(settings, sw);
        return (
          // No `aria-pressed`: the label already flips with the state.
          <button
            key={sw.label}
            type="button"
            className={styles.switchButton}
            onClick={() => {
              // No `overMs`: the default fade, as the settings panel's switches use.
              for (const address of sw.addresses) {
                for (const action of setVisibilityActionsFor(settings, address, !on)) {
                  dispatch(action);
                }
              }
            }}
          >
            <EyeIcon size={14} struck={!on} />
            {`${on ? 'Hide' : 'Show'} ${sw.label}`}
          </button>
        );
      })}
    </div>
  );
}

export default SwitchesSection;
