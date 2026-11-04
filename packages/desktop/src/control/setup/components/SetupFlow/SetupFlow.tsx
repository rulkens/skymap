/**
 * SetupFlow — the first-run steps beside their rail, with the download in a strip underneath, so the
 * waiting time is setup time. Every choice saves as it is made; Next and Back only move. Enter takes
 * the primary action from anywhere but a control that uses Enter itself; focus moves to each step's title.
 */

import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { RelayRoom } from '../../../../../../../src/@types/remote/RelayRoom';
import Wordmark from '../../../../../../website/src/components/shared/text/Wordmark/Wordmark';
import type { ControlStatus } from '../../../../@types/ControlStatus';
import type { DisplayInfo } from '../../../../@types/DisplayInfo';
import type { InstallSetup } from '../../../../@types/InstallSetup';
import type { LanInterface } from '../../../../@types/LanInterface';
import type { SetupStep } from '../../@types/SetupStep';
import type { SyncProgress } from '../../../../@types/SyncProgress';
import { placeWindows } from '../../../../utils/placeWindows';
import { stepAfter } from '../../utils/stepAfter';
import { hasOneScreen } from '../../utils/hasOneScreen';
import { setupPrimaryLabel } from '../../utils/setupPrimaryLabel';
import { stepBefore } from '../../utils/stepBefore';
import DisplayStep from '../DisplayStep/DisplayStep';
import DoneStep from '../DoneStep/DoneStep';
import DownloadStrip from '../../../sync/components/DownloadStrip/DownloadStrip';
import ModeChoice from '../ModeChoice/ModeChoice';
import SetupRail from '../SetupRail/SetupRail';
import TabletStep from '../TabletStep/TabletStep';
import UpdatesChoice from '../UpdatesChoice/UpdatesChoice';
import WelcomeStep from '../WelcomeStep/WelcomeStep';
import { KEEPS_ENTER, STEP_LEADS, STEP_TITLES } from './SetupFlow.constants';
import chrome from '../../../controlChrome.module.css';
import styles from './SetupFlow.module.css';

export type SetupFlowProps = {
  readonly step: SetupStep;
  readonly setup: InstallSetup;
  readonly status: ControlStatus;
  readonly progress: SyncProgress | null;
  readonly skyRunning: boolean;
  readonly room: RelayRoom | null;
  readonly displays: readonly DisplayInfo[];
  readonly networks: readonly LanInterface[];
  readonly onStep: (step: SetupStep) => void;
  readonly onSave: (next: InstallSetup) => Promise<void>;
  readonly onShowTestGrid: (on: boolean) => void;
  readonly onRetry: () => void;
  readonly onHelp: () => void;
  /** Leaves setup for the controls; `hide` also hides the window so a single screen shows the sky. */
  readonly onClose: (hide: boolean) => void;
};

function SetupFlow(props: SetupFlowProps): ReactNode {
  const { step, setup, status, progress, skyRunning, room, displays, networks } = props;
  const { onStep, onSave, onShowTestGrid, onRetry, onHelp, onClose } = props;
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), [step]);

  const oneScreen = hasOneScreen(displays.length);
  const skyAt = placeWindows(setup.display, displays)?.sky;
  const skyDisplay = oneScreen || !skyAt ? null : displays.indexOf(skyAt) + 1;
  const save = (next: InstallSetup): void => void onSave(next);

  const advance = (): void =>
    step === 'done' ? onClose(oneScreen && skyRunning) : onStep(stepAfter(step, displays.length));
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || (event.target as Element).closest(KEEPS_ENTER)) return;
    event.preventDefault();
    advance();
  };

  const title =
    step === 'welcome' ? (
      <span className={styles.wordmark}>
        <Wordmark />
      </span>
    ) : step === 'done' ? (
      skyRunning ? (
        'The sky is ready'
      ) : (
        'Waiting for the download'
      )
    ) : (
      STEP_TITLES[step]
    );

  return (
    <div className={styles.root}>
      <SetupRail step={step} displayCount={displays.length} onStep={onStep} />
      <section className={styles.step} aria-labelledby={titleId} onKeyDown={onKeyDown}>
        <div key={step} className={styles.body}>
          <h1 id={titleId} ref={titleRef} tabIndex={-1} className={styles.title}>
            {title}
          </h1>
          {STEP_LEADS[step] && <p className={styles.lead}>{STEP_LEADS[step]}</p>}
          {step === 'welcome' && (
            <WelcomeStep status={status} progress={progress} skyRunning={skyRunning} />
          )}
          {step === 'mode' && (
            <ModeChoice mode={setup.mode} onPick={(mode) => save({ ...setup, mode })} />
          )}
          {step === 'display' && (
            <DisplayStep
              setup={setup}
              displays={displays}
              onSave={onSave}
              onShowTestGrid={onShowTestGrid}
            />
          )}
          {step === 'tablet' && (
            <TabletStep
              setup={setup}
              room={room}
              networks={networks}
              skyRunning={skyRunning}
              onSave={onSave}
              onHelp={onHelp}
            />
          )}
          {step === 'daily' && <UpdatesChoice setup={setup} onSave={save} />}
          {step === 'done' && <DoneStep skyRunning={skyRunning} skyDisplay={skyDisplay} />}
        </div>
        <div className={styles.actions}>
          {step !== 'welcome' && (
            <button
              type="button"
              className={chrome.button}
              onClick={() => onStep(stepBefore(step, displays.length))}
            >
              Back
            </button>
          )}
          <button type="button" className={chrome.primary} onClick={advance}>
            {setupPrimaryLabel(step, oneScreen, skyRunning)}
          </button>
        </div>
      </section>
      <DownloadStrip
        status={status}
        progress={progress}
        skyRunning={skyRunning}
        onRetry={onRetry}
      />
    </div>
  );
}

export default SetupFlow;
