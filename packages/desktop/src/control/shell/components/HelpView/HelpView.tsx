/**
 * HelpView — short answers for the jobs a technician meets after setup, offline. packages/desktop/
 * README.md is the source: its certificate steps were tried on each tablet; change both together.
 */

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import type { HelpSection } from '../../../../@types/HelpSection';
import { TABLET_SETUP_PORT } from '../../../../data/tabletSetupPort';
import { controlShortcutText } from '../../utils/controlShortcutText';
import chrome from '../../../controlChrome.module.css';
import styles from './HelpView.module.css';

export type HelpViewProps = {
  /** The pairing origin, when known, so the steps name the real address. */
  readonly origin: string | null;
  /** The section a menu item named; Help opens scrolled to it. */
  readonly section?: HelpSection;
  readonly backLabel: string;
  readonly onBack: () => void;
};

function HelpView({ origin, section, backLabel, onBack }: HelpViewProps): ReactNode {
  const titleId = useId();
  const tablet = useRef<HTMLElement>(null);
  const troubleshooting = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const target =
      section === 'tablet' ? tablet : section === 'troubleshooting' ? troubleshooting : null;
    target?.current?.scrollIntoView({ block: 'start' });
  }, [section]);
  const setupPage = (
    <span className={chrome.mono}>
      http://{origin === null ? '<address>' : new URL(origin).hostname}:{TABLET_SETUP_PORT}
    </span>
  );
  const key = <kbd className={chrome.mono}>{controlShortcutText()}</kbd>;
  return (
    <main className={styles.root} aria-labelledby={titleId}>
      <button type="button" className={chrome.link} onClick={onBack}>
        {backLabel}
      </button>
      <h1 id={titleId} ref={title} tabIndex={-1} className={styles.title}>
        Help
      </h1>

      <section ref={tablet} className={styles.section}>
        <h2 className={chrome.heading}>Connecting a tablet</h2>
        <p className={chrome.text}>
          The tablet must be on the same network as this computer. It trusts this computer once,
          through a certificate: a file that proves the computer is the one it says.
        </p>
        <ol className={styles.steps}>
          <li>
            Scan the QR in the controls, under Tablets, with the tablet&apos;s camera. It opens a
            setup page on the tablet. Without a camera, open {setupPage} and type the code.
          </li>
          <li>
            The setup page shows the steps for that tablet: download the certificate, then install
            it in the tablet&apos;s settings. On an iPad that is Profile Downloaded, Install, and
            then General, About, Certificate Trust Settings; on Android, search the settings for CA
            certificate. The page says when the tablet trusts this computer and opens the remote.
          </li>
          <li>
            If this computer asks to accept incoming network connections, choose Allow. On Windows
            the installer allows them on private networks.
          </li>
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={chrome.heading}>Moving the sky to another screen</h2>
        <p className={chrome.text}>
          Pick the screen under Setup, Sky screen; the sky moves at once. Show the test grid to see
          which screen it is on. If the picked screen is off when Skymap starts, the sky uses
          another screen and moves back when the picked one is connected.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={chrome.heading}>Shortcut</h2>
        <p className={chrome.text}>
          {key} shows or hides this window, also when the sky fills the only screen. Escape on the
          sky turns it into a window you move by its top edge; its close button quits Skymap. Its
          full-screen button, F11 (Control+Command+F on a Mac) or View, Full screen fills the screen
          again.
        </p>
      </section>

      <section className={styles.section}>
        <h2 className={chrome.heading}>Updating data</h2>
        <p className={chrome.text}>
          Skymap fetches new data at every launch, every day at a set time, or only with Update now,
          as set under Setup. An update you start with Update now waits for Restart sky; the others
          load by themselves. The button beside the progress bar pauses a download and resumes it; a
          paused download also resumes at the next launch or daily update.
        </p>
      </section>

      <section ref={troubleshooting} className={styles.section}>
        <h2 className={chrome.heading}>Troubleshooting</h2>
        <dl className={styles.problems}>
          <dt>No sky</dt>
          <dd>
            The sky starts once its data is downloaded. The status under Data says what it is
            waiting for and what to do.
          </dd>
          <dt>The sky is blank</dt>
          <dd>
            Skymap draws with WebGPU, which needs a current graphics driver. Update the driver, then
            choose Restart sky.
          </dd>
          <dt>The tablet cannot connect</dt>
          <dd>
            Check that Skymap is running, that the tablet is on the same network and trusts the
            certificate, and, on a computer with more than one network, that Tablets names the one
            the tablet uses. If the computer blocked incoming connections, allow Skymap in its
            firewall settings.
          </dd>
          <dt>The disk is full</dt>
          <dd>
            The status names the space the download needs and the space free. Free the difference,
            then choose Retry.
          </dd>
        </dl>
      </section>
    </main>
  );
}

export default HelpView;
