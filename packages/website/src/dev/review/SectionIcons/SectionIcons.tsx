/*
 * SectionIcons — the entry icon in each reviewed heading: a count of its marks and notes, tinted by the
 * commonest mark state. The icon carries no text of its own (the § and the count are drawn by CSS), so
 * a heading's text, which marks are matched against, is the same with or without it.
 */
import { useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

import { cx } from '../../../utils/cx.ts';
import type { ReviewSection } from '../@types/ReviewSection';
import { countItems } from '../countItems';
import reviewPage from '../ReviewPage/ReviewPage.module.css';
import styles from './SectionIcons.module.css';

const STATES = ['rewrite', 'cut', 'good', 'keep'] as const;

type SectionIconsProps = {
  sections: ReviewSection[];
  /** The heading whose panel is open. */
  open: Element | null;
  onToggle: (section: ReviewSection) => void;
};

function SectionIcons({ sections, open, onToggle }: SectionIconsProps) {
  useLayoutEffect(() => {
    const headings = sections.map((section) => section.heading);
    for (const heading of headings) heading.classList.add(reviewPage.anchor!);
    return () => {
      for (const heading of headings) heading.classList.remove(reviewPage.anchor!);
    };
  }, [sections]);

  return sections.map((section, index) => {
    const counts = countItems(section.items);
    const marked = STATES.reduce((best, s) => (counts[s] > counts[best] ? s : best));
    const summary =
      `${counts.cut} cut · ${counts.keep} keep · ${counts.rewrite} rewrite · ${counts.good} good` +
      (counts.notes > 0 ? ` · ${counts.notes} ${counts.notes === 1 ? 'note' : 'notes'}` : '');
    return createPortal(
      <button
        className={cx(styles.root, section.heading.localName === 'h1' && styles.underHeading)}
        type="button"
        title={summary}
        aria-label={`Review of “${section.title}”: ${summary}`}
        aria-expanded={open === section.heading}
        data-state={counts[marked] > 0 ? marked : 'note'}
        data-count={section.items.length}
        data-overlay-ui=""
        data-review-icon=""
        onClick={(e) => {
          e.preventDefault();
          onToggle(section);
        }}
      />,
      section.heading,
      String(index),
    );
  });
}

export default SectionIcons;
