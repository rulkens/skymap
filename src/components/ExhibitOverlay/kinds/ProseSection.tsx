/**
 * ProseSection — a heading over body copy; `<i>` and `<a>` in the text become inline runs.
 * Shares the overlay's stylesheet: the notes column is one typographic system.
 */

import type { ReactNode } from 'react';

import { inlineSegments } from '../../../utils/text/inlineSegments';
import type { ExhibitProseSection } from '../../../@types/exhibits/ExhibitProseSection';
import styles from '../ExhibitOverlay.module.css';

export type ProseSectionProps = {
  readonly data: ExhibitProseSection;
};

function ProseSection({ data }: ProseSectionProps): ReactNode {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>{data.heading}</h2>
      <p className={styles.sectionBody}>
        {inlineSegments(data.text).map((segment, i) => {
          if (segment.kind === 'em') return <i key={i}>{segment.text}</i>;
          if (segment.kind === 'link') {
            return (
              <a
                key={i}
                className={styles.inlineLink}
                href={segment.href}
                target="_blank"
                rel="noreferrer"
              >
                {segment.text}
              </a>
            );
          }
          return segment.text;
        })}
      </p>
    </div>
  );
}

export default ProseSection;
