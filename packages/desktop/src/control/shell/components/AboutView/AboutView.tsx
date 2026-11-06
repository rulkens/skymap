/**
 * AboutView — a title card: the app's icon, the wordmark, what Skymap is, the surveys it is built
 * from (the Splash's credit groups) and, small at the foot, version, data date, licence and site as
 * text. The control window shows it as a view; the shell can show it alone (AboutWindow), without Back.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Wordmark from '../../../../../../website/src/components/shared/text/Wordmark/Wordmark';
import { CREDIT_GROUPS } from '../../../../../../../src/data/creditGroups';
import type { AboutInfo } from '../../../../@types/AboutInfo';
import { APP_LICENCE } from '../../data/appLicence';
import { APP_SUMMARY } from '../../data/appSummary';
import { SITE_ADDRESS } from '../../data/siteAddress';
import { ICON_SRC } from './AboutView.constants';
import chrome from '../../../controlChrome.module.css';
import styles from './AboutView.module.css';

export type AboutViewProps = {
  readonly about: AboutInfo | null;
  readonly back?: { label: string; onBack: () => void };
};

function AboutView({ about, back }: AboutViewProps): ReactNode {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus({ preventScroll: true }), []);
  const dataDate = about?.dataDate
    ? new Date(about.dataDate).toLocaleDateString('en-GB', { dateStyle: 'long' })
    : 'Not downloaded yet';
  const builtAt = about
    ? new Date(about.builtAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  return (
    <main className={styles.root} aria-label="About Skymap">
      {back && (
        <button type="button" className={`${chrome.link} ${styles.back}`} onClick={back.onBack}>
          {back.label}
        </button>
      )}
      <img className={styles.icon} src={ICON_SRC} alt="" />
      <h1 ref={title} tabIndex={-1} className={styles.mark} aria-label="About Skymap">
        <Wordmark />
      </h1>
      <p className={styles.summary}>{APP_SUMMARY}</p>
      <section className={styles.credits} aria-labelledby="about-built-from">
        <h2 id="about-built-from" className={styles.eyebrow}>
          Built from
        </h2>
        <ul className={styles.groups}>
          {CREDIT_GROUPS.map(({ label, sources }) => (
            <li key={label}>
              <span className={styles.group}>{label}</span>
              <span>{sources.map(({ name }) => name).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </section>
      <dl className={styles.facts}>
        <div>
          <dt>Version</dt>
          <dd>{about?.version ?? ''}</dd>
        </div>
        <div>
          <dt>Built</dt>
          <dd>{builtAt}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{dataDate}</dd>
        </div>
        <div>
          <dt>Site</dt>
          <dd>{SITE_ADDRESS}</dd>
        </div>
      </dl>
      <p className={styles.licence}>{APP_LICENCE}</p>
    </main>
  );
}

export default AboutView;
