/** SourcesSection — the provenance list closing the notes column, under a hairline. */

import type { ReactNode } from 'react';

import ExternalLinkIcon from '../ExternalLinkIcon';
import type { ExhibitSourcesSection } from '../../../@types/exhibits/ExhibitSourcesSection';
import styles from '../ExhibitOverlay.module.css';

export type SourcesSectionProps = {
  readonly data: ExhibitSourcesSection;
};

function SourcesSection({ data }: SourcesSectionProps): ReactNode {
  return (
    <>
      <div className={styles.rule} aria-hidden="true" />
      <div className={styles.section}>
        <h2 className={styles.sectionHeading}>{data.heading}</h2>
        <div className={styles.sourceList}>
          {data.links.map((link) => (
            <a
              key={link.href}
              className={styles.source}
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              <span className={styles.sourceRole}>{link.role}</span>
              <span className={styles.sourceText}>
                <span className={styles.sourceTitle}>
                  {link.title}
                  <ExternalLinkIcon />
                </span>
                <span className={styles.sourceCitation}>{link.citation}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </>
  );
}

export default SourcesSection;
