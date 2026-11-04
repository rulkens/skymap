/**
 * ControlPage — the control window: the setup steps on first run (or on "Run setup again"), the
 * controls after, and Help and About over either. Main owns every value; the page shows its latest
 * word and sends the person's changes back. Escape closes Help or About and nothing else.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AboutInfo } from '../../../../@types/AboutInfo';
import type { ControlBridge } from '../../../../@types/ControlBridge';
import type { ControlView } from '../../../../@types/ControlView';
import type { HelpSection } from '../../../../@types/HelpSection';
import type { SetupStep } from '../../../setup/@types/SetupStep';
import AboutView from '../AboutView/AboutView';
import ControlHeader from '../ControlHeader/ControlHeader';
import ControlsView from '../ControlsView/ControlsView';
import HelpView from '../HelpView/HelpView';
import SetupFlow from '../../../setup/components/SetupFlow/SetupFlow';
import { useControlBridge } from './useControlBridge';
import styles from './ControlPage.module.css';

export type ControlPageProps = {
  readonly bridge: ControlBridge;
};

function ControlPage({ bridge }: ControlPageProps): ReactNode {
  const session = useControlBridge(bridge);
  const { setup, firstRun } = session;
  const [home, setHome] = useState<'setup' | 'controls' | null>(null);
  const [over, setOver] = useState<'help' | 'about' | null>(null);
  const [helpSection, setHelpSection] = useState<HelpSection>();
  const [step, setStep] = useState<SetupStep>('welcome');
  const [about, setAbout] = useState<AboutInfo | null>(null);
  const base = home ?? (firstRun === null ? null : firstRun ? 'setup' : 'controls');
  const view: ControlView | null = over ?? base;

  useEffect(
    () =>
      bridge.onView((next, section) => {
        setHelpSection(section);
        if (next === 'help' || next === 'about') setOver(next);
        else {
          setOver(null);
          setHome(next);
        }
      }),
    [bridge],
  );
  useEffect(() => {
    if (over === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOver(null);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [over]);
  useEffect(() => {
    if (over === 'about') void bridge.getAbout().then(setAbout);
  }, [bridge, over]);

  const backLabel = base === 'setup' ? 'Back to setup' : 'Back to the controls';
  const openHelp = (): void => {
    setHelpSection(undefined);
    setOver('help');
  };
  const runSetup = (): void => {
    setStep('mode');
    setHome('setup');
  };
  const closeSetup = (hide: boolean): void => {
    setHome('controls');
    if (hide) bridge.hide();
  };

  return (
    <div className={styles.root}>
      <ControlHeader
        view={view}
        showMark={!(view === 'setup' && step === 'welcome')}
        onToggle={(next) =>
          over === next ? setOver(null) : next === 'help' ? openHelp() : setOver(next)
        }
      />
      <div className={styles.content}>
        {over === 'help' && (
          <HelpView
            origin={session.room?.origin ?? null}
            section={helpSection}
            backLabel={backLabel}
            onBack={() => setOver(null)}
          />
        )}
        {over === 'about' && (
          <AboutView about={about} back={{ label: backLabel, onBack: () => setOver(null) }} />
        )}
        {over === null && setup && base === 'setup' && (
          <SetupFlow
            step={step}
            setup={setup}
            status={session.status}
            progress={session.progress}
            skyRunning={session.skyRunning}
            room={session.room}
            displays={session.displays}
            networks={session.networks}
            onStep={setStep}
            onSave={session.save}
            onShowTestGrid={bridge.showTestGrid}
            onRetry={bridge.updateNow}
            onHelp={openHelp}
            onClose={closeSetup}
          />
        )}
        {over === null && setup && base === 'controls' && (
          <ControlsView
            session={{ ...session, setup }}
            bridge={bridge}
            onRunSetup={runSetup}
            onHelp={openHelp}
          />
        )}
      </div>
    </div>
  );
}

export default ControlPage;
