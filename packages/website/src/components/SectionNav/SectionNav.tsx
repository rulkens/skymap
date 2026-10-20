/*
 * SectionNav — the sections of a long page, as a contents row under its
 * opening: a quiet heading that says what the row is, then one cell per
 * section, in equal columns of the page grid, with a drawing and the
 * section's name. Plain anchors, no script. The ring around the drawing is the top bar's selection
 * (styles/ring.module.css `glyph-ring`); hairlines and a dim heading keep this
 * second navigation quieter than the bar.
 */
import type { CSSProperties } from 'react';

import type { IconName } from '../../@types/IconName';
import Icon from '../Icon/Icon.tsx';
import styles from './SectionNav.module.css';

type SectionNavProps = { items: { href: string; label: string; icon: IconName }[] };

const HEADING_ID = 'section-nav-label';

function SectionNav({ items }: SectionNavProps) {
  return (
    <nav className={styles.root} aria-labelledby={HEADING_ID}>
      <p className={styles.heading} id={HEADING_ID}>
        On this page
      </p>
      <ol className={styles.cells} style={{ '--span': 12 / items.length } as CSSProperties}>
        {items.map((item) => (
          <li key={item.href}>
            <a className={styles.link} href={item.href}>
              <Icon name={item.icon} />
              <span className={styles.name}>{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default SectionNav;
