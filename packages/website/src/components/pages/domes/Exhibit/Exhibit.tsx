/*
 * Exhibit — the page's section on a screen for a museum: the app's exhibits as each opens, running from the
 * window's left edge across seven columns with only a taste of their notes, and the title, the lead, the list of exhibits and the words (the
 * children) in the last four. Each name opens its exhibit in the app; pointing at it or reaching it with Tab shows its
 * screen and its label (exhibitChooser.client.ts). Without script the first screen stays. Narrow, the title
 * comes first, then the picture across the window, then the words.
 */
import type { CSSProperties, ReactNode } from 'react';

import { appLink } from '../../../../data/appLink.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import ViewLink from '../../../shared/links/ViewLink/ViewLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './Exhibit.module.css';

// One row per exhibit, in the app's order; `accent` is a colour from its own picture. The first is shown first.
const EXHIBITS = [
  { name: 'Cosmic Flows', shot: 'dome-exhibit', accent: '#8fb2ff' },
  { name: 'Solar System', shot: 'class-exhibit', accent: '#e2c27f' },
  { name: 'Cosmic Web', shot: 'domes-exhibit-web', accent: '#d98fe6' },
  { name: 'Zone of Avoidance', shot: 'domes-exhibit-zoa', accent: '#aaa6ff' },
  { name: 'Observable Universe', shot: 'domes-exhibit-universe', accent: '#b8d4ff' },
];

const SIZES = '(max-width: 900px) 100vw, min(calc(58vw + 9rem), 54rem)';

type ExhibitProps = { id: string; title: string; lead: string; children: ReactNode };

function Exhibit({ id, title, lead, children }: ExhibitProps) {
  return (
    <section className={styles.root} id={id} data-exhibits>
      <h2>{title}</h2>
      <figure className={styles.figure}>
        <div className={styles.frame}>
          {EXHIBITS.map((exhibit, i) => (
            <div
              key={exhibit.shot}
              className={styles.screen}
              data-shown={i === 0 ? '' : undefined}
              data-exhibit={exhibit.shot}
              aria-hidden={i === 0 ? undefined : true}
            >
              <Shot id={exhibit.shot} sizes={SIZES} />
            </div>
          ))}
        </div>
        <figcaption className={styles.labels}>
          {EXHIBITS.map((exhibit, i) => (
            <div
              key={exhibit.shot}
              className={styles.screen}
              data-shown={i === 0 ? '' : undefined}
              data-exhibit={exhibit.shot}
              aria-hidden={i === 0 ? undefined : true}
            >
              <ShotCaption id={exhibit.shot} showDrawn={false} showTitle={false} open={false} />
            </div>
          ))}
        </figcaption>
      </figure>
      <div className={styles.words}>
        <p>{lead}</p>
        <ul className={styles.chooser}>
          {EXHIBITS.map((exhibit, i) => (
            <li key={exhibit.shot} style={{ '--exhibit-accent': exhibit.accent } as CSSProperties}>
              <ViewLink
                hang
                href={appLink(siteShot(exhibit.shot).link)}
                data-exhibit={exhibit.shot}
                aria-current={i === 0 ? 'true' : undefined}
              >
                {exhibit.name}
              </ViewLink>
            </li>
          ))}
        </ul>
        {children}
      </div>
    </section>
  );
}

export default Exhibit;
