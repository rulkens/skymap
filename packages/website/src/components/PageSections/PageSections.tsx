/*
 * PageSections — a docs page's own second-level headings as a list of jumps:
 * beside the text on a wide window (layouts/DocsLayout) and at the head of the
 * contents on a narrow one (DocsNav). Headings of a letter or two, a
 * glossary's A to Z, run along a line instead of one under another. The link
 * of the section being read is the last heading that has passed the upper
 * third of the window: one read of the headings' boxes per scroll event and
 * no state change unless the section changes.
 */
import type { MarkdownHeading } from 'astro';
import { useEffect, useState } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './PageSections.module.css';

type PageSectionsProps = { sections: readonly MarkdownHeading[] };

const short = (section: MarkdownHeading) => section.text.length <= 2;

function PageSections({ sections }: PageSectionsProps) {
  const [here, setHere] = useState<string>();

  useEffect(() => {
    const heads = sections
      .map((section) => document.getElementById(section.slug))
      .filter((head) => head !== null);
    const mark = () => {
      const line = innerHeight / 3;
      setHere(heads.findLast((head) => head.getBoundingClientRect().top <= line)?.id);
    };
    addEventListener('scroll', mark, { passive: true });
    mark();
    return () => removeEventListener('scroll', mark);
  }, [sections]);

  return (
    <ol className={styles.root} data-sections>
      {sections.map((section) => (
        <li key={section.slug} className={cx(short(section) && styles.letter)}>
          <a
            href={`#${section.slug}`}
            aria-current={section.slug === here ? 'location' : undefined}
          >
            {section.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

export default PageSections;
