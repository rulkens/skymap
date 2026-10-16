/*
 * SectionIcons — the entry icon in each reviewed heading: a count of its marks and notes, tinted by the
 * commonest mark state. The icon carries no text of its own (the § and the count are drawn by CSS), so
 * a heading's text, which marks are matched against, is the same with or without it. Each icon is
 * portalled into a span of ours in the heading, never into the heading: React rejects a portal into an
 * element it renders with text of its own, which a heading in a page island is.
 */
import { useLayoutEffect, useRef } from 'react';
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
  // One host per heading for as long as it is a section, so an icon keeps its focus as the marks change.
  const hosts = useRef(new Map<Element, HTMLElement>());
  const hostOf = (heading: Element) => {
    let host = hosts.current.get(heading);
    if (!host) {
      host = document.createElement('span');
      host.className = styles.host!;
      hosts.current.set(heading, host);
    }
    return host;
  };

  useLayoutEffect(() => {
    const current = new Set(sections.map((section) => section.heading));
    for (const [heading, host] of hosts.current) {
      if (current.has(heading)) continue;
      host.remove();
      heading.classList.remove(reviewPage.anchor!);
      hosts.current.delete(heading);
    }
    for (const [heading, host] of hosts.current) {
      heading.classList.add(reviewPage.anchor!);
      if (host.parentNode !== heading) heading.append(host);
    }
  }, [sections]);

  useLayoutEffect(() => {
    const all = hosts.current;
    return () => {
      for (const [heading, host] of all) {
        host.remove();
        heading.classList.remove(reviewPage.anchor!);
      }
      all.clear();
    };
  }, []);

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
      hostOf(section.heading),
      String(index),
    );
  });
}

export default SectionIcons;
