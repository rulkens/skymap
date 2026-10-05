/**
 * ExhibitNoteSection — one block of an exhibit's notes column, drawn per `kind`
 * (spec §4.2). The four kinds are structurally different, so each gets its own
 * markup rather than a shared heading+paragraph shell; the hairline rules
 * between them are the parent's, since they separate sections rather than
 * belong to one.
 */

import type { ReactNode } from 'react';
import cx from 'classnames';

import ExternalLinkIcon from './ExternalLinkIcon';
import { inlineSegments } from '../../utils/text/inlineSegments';
import type { ExhibitSection } from '../../@types/exhibits/ExhibitSection';
import type { ExhibitToggle } from '../../@types/exhibits/ExhibitToggle';
import styles from './ExhibitOverlay.module.css';

export type ExhibitNoteSectionProps = {
  readonly section: ExhibitSection;
  readonly toggleOn: boolean;
  readonly onToggle: (toggle: ExhibitToggle, on: boolean) => void;
};

function ExhibitNoteSection({ section, toggleOn, onToggle }: ExhibitNoteSectionProps): ReactNode {
  if (section.kind === 'prose') {
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionHeading}>{section.heading}</h2>
        <p className={styles.sectionBody}>
          {inlineSegments(section.text).map((segment, i) => {
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

  if (section.kind === 'key') {
    const { toggle } = section;
    return (
      <div className={styles.section}>
        <h2 className={styles.sectionHeading}>{section.heading}</h2>
        <div className={styles.key}>
          <div
            className={styles.ramp}
            style={{ backgroundImage: `linear-gradient(90deg, ${section.ramp.join(', ')})` }}
            aria-hidden="true"
          />
          <div className={styles.rampEnds} aria-hidden="true">
            {section.ends.map((end) => (
              <div key={end}>{end}</div>
            ))}
          </div>
          {toggle ? (
            <button
              type="button"
              role="switch"
              aria-checked={toggleOn}
              className={styles.toggleRow}
              onClick={() => onToggle(toggle, !toggleOn)}
            >
              <span className={styles.toggleLabel}>
                {toggle.label}{' '}
                <span className={styles.toggleState}>
                  · {toggleOn ? toggle.onWord : toggle.offWord}
                </span>
              </span>
              <span className={cx(styles.track, toggleOn && styles.trackOn)}>
                <span className={cx(styles.knob, toggleOn && styles.knobOn)} />
              </span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (section.kind === 'facts') {
    return (
      <div className={styles.facts}>
        {section.facts.map((fact) => (
          <div key={fact.label} className={styles.fact}>
            <div className={styles.factLabel}>{fact.label}</div>
            <div className={styles.factValue}>{fact.value}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionHeading}>{section.heading}</h2>
      <div className={styles.sourceList}>
        {section.links.map((link) => (
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
  );
}

export default ExhibitNoteSection;
