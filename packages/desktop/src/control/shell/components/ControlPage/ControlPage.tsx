/**
 * ControlPage — the control window: the setup steps on first run (or on "Run setup again"), the
 * controls after, and Help and About over either. Main owns every value; the page shows its latest
 * word and sends the person's changes back. Escape closes Help or About and nothing else.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
  const [home, setHome] = useState<'setup' | 'controls' | null>(null);
  const [over, setOver] = useState<'help' | 'about' | null>(null);
  const [helpSection, setHelpSection] = useState<HelpSection>();
  const [step, setStep] = useState<SetupStep>('welcome');
  const base = home ?? (session === null ? null : session.firstRun ? 'setup' : 'controls');
  const view: ControlView | null = over ?? base;
  // Decided once: main ends the first run at the first save, which is mid-setup.
  useEffect(() => {
    if (base !== null) setHome((shown) => shown ?? base);
  }, [base]);
  // Closing Help or About hands focus back to the header link for it, so the next key works.
  const links = useRef<Partial<Record<'help' | 'about', HTMLButtonElement | null>>>({});
  const close = (): void => {
    if (over !== null) links.current[over]?.focus();
    setOver(null);
  };

  useEffect(
    () =>
      bridge.onHelp((section) => {
        setHelpSection(section);
        setOver('help');
      }),
    [bridge],
  );
  useEffect(() => {
    if (over === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

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
        linkRef={(target, el) => void (links.current[target] = el)}
        onToggle={(next) =>
          over === next ? close() : next === 'help' ? openHelp() : setOver(next)
        }
      />
      <div className={styles.content}>
        {over === 'help' && (
          <HelpView
            origin={session?.room.origin ?? null}
            section={helpSection}
            backLabel={backLabel}
            onBack={close}
          />
        )}
        {over === 'about' && (
          <AboutView about={session?.about ?? null} back={{ label: backLabel, onBack: close }} />
        )}
        {over === null && session && base === 'setup' && (
          <SetupFlow
            step={step}
            setup={session.setup}
            sync={session}
            room={session.room}
            displays={session.displays}
            placement={session.placement}
            networks={session.networks}
            saveState={session.saveState}
            onStep={setStep}
            onSave={session.save}
            onShowTestGrid={bridge.showTestGrid}
            onRetry={bridge.updateNow}
            onHelp={openHelp}
            onClose={closeSetup}
          />
        )}
        {over === null && session && base === 'controls' && (
          <ControlsView
            session={session}
            onUpdateNow={bridge.updateNow}
            onRestartSky={bridge.restartSky}
            onShowTestGrid={bridge.showTestGrid}
            onRotate={bridge.rotateCode}
            onQuit={bridge.quit}
            onRunSetup={runSetup}
            onHelp={openHelp}
          />
        )}
      </div>
    </div>
  );
}

export default ControlPage;
