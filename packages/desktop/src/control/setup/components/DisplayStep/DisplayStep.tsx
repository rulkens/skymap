/**
 * DisplayStep — the screen list with the test grid on the sky while the step is open. A pick moves the
 * sky; the grid is then laid again, so a kiosk's "display n" names the screen it is now on.
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import type { DisplayInfo } from '../../../../@types/DisplayInfo';
import type { InstallSetup } from '../../../../@types/InstallSetup';
import type { WindowPlacement } from '../../../../@types/WindowPlacement';
import DisplayChoice from '../DisplayChoice/DisplayChoice';
import chrome from '../../../controlChrome.module.css';
import styles from './DisplayStep.module.css';

export type DisplayStepProps = {
  readonly setup: InstallSetup;
  readonly displays: readonly DisplayInfo[];
  readonly placement: WindowPlacement | null;
  readonly onSave: (next: InstallSetup) => Promise<void>;
  readonly onShowTestGrid: (on: boolean) => void;
};

function DisplayStep({
  setup,
  displays,
  placement,
  onSave,
  onShowTestGrid,
}: DisplayStepProps): ReactNode {
  useEffect(() => {
    onShowTestGrid(true);
    return () => onShowTestGrid(false);
  }, [onShowTestGrid]);
  const pick = async (display: InstallSetup['display']): Promise<void> => {
    await onSave({ ...setup, display });
    onShowTestGrid(true);
  };
  return (
    <div className={styles.root}>
      <DisplayChoice
        stored={setup.display}
        displays={displays}
        placement={placement}
        onPick={(d) => void pick(d)}
      />
      <p className={chrome.dim}>
        {setup.mode === 'dome'
          ? 'The dome grid shows on the picked screen. FRONT, at the bottom of the disc, belongs at the front of the dome.'
          : 'The picked screen shows “Skymap · display n” with its number.'}
      </p>
    </div>
  );
}

export default DisplayStep;
