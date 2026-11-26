/**
 * PanelSection — one foldable section of a workbench sidebar: a full-width divider, a
 * header that folds the body (SectionHeader) and the body itself (SectionBody).
 * Controlled: the caller owns `open`; the body unmounts once its fold-up has run.
 */
import type { ReactNode } from 'react';
import SectionBody from './SectionBody/SectionBody';
import SectionHeader from './SectionHeader/SectionHeader';
import styles from './PanelSection.module.css';

export type PanelSectionProps = {
  readonly title: string;
  /** Says what the section is; drawn ahead of the title, in its colour. */
  readonly icon: ReactNode;
  /** A tip on the icon, shown on its hover and the fold button's focus; it describes the button. */
  readonly iconTip?: ReactNode;
  readonly open: boolean;
  readonly onToggle: () => void;
  /** The header pill's state; omit for a section without one. */
  readonly on?: boolean;
  readonly onChange?: (on: boolean) => void;
  /** The pill's accessible name; defaults to `Toggle <title>`. */
  readonly toggleLabel?: string;
  /** A header control in the pill's place, for a section that has no pill. */
  readonly control?: ReactNode;
  /** Names what the body shows: a new key slides the sections below to its height. */
  readonly contentKey?: string;
  /** Shown only while folded, muted, cut with an ellipsis when it does not fit. */
  readonly summary?: ReactNode;
  readonly children: ReactNode;
};

function PanelSection({ contentKey, children, ...header }: PanelSectionProps): ReactNode {
  return (
    <section className={styles.root}>
      <SectionHeader {...header} />
      <SectionBody open={header.open} contentKey={contentKey}>
        {children}
      </SectionBody>
    </section>
  );
}

export default PanelSection;
