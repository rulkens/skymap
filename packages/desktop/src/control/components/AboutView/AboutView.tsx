/**
 * AboutView — the wordmark, what Skymap is, the version, the data's date, the licence and the site as
 * text. The control window shows it as a view; the shell can show it alone (AboutWindow), without Back.
 */

import type { ReactNode } from 'react';
import Wordmark from '../../../../../website/src/components/shared/text/Wordmark/Wordmark';
import type { AboutInfo } from '../../../@types/AboutInfo';
import { APP_LICENCE } from '../../../data/appLicence';
import { APP_SUMMARY } from '../../../data/appSummary';
import { SITE_ADDRESS } from '../../../data/siteAddress';
import chrome from '../controlChrome.module.css';
import styles from './AboutView.module.css';

export type AboutViewProps = {
  readonly about: AboutInfo | null;
  readonly back?: { label: string; onBack: () => void };
};

function AboutView({ about, back }: AboutViewProps): ReactNode {
  const dataDate = about?.dataDate
    ? new Date(about.dataDate).toLocaleDateString('en-GB', { dateStyle: 'long' })
    : 'Not downloaded yet';
  return (
    <main className={styles.root} aria-label="About Skymap">
      {back && (
        <button type="button" className={chrome.link} onClick={back.onBack}>
          {back.label}
        </button>
      )}
      <h1 className={styles.mark}>
        <Wordmark />
      </h1>
      <p className={styles.summary}>{APP_SUMMARY}</p>
      <dl className={styles.facts}>
        <dt>Version</dt>
        <dd className={chrome.mono}>{about?.version ?? ''}</dd>
        <dt>Data</dt>
        <dd>{dataDate}</dd>
        <dt>Licence</dt>
        <dd>{APP_LICENCE}</dd>
        <dt>Website</dt>
        <dd className={chrome.mono}>{SITE_ADDRESS}</dd>
      </dl>
    </main>
  );
}

export default AboutView;
