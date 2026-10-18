/*
 * FeatureStage — the Features page, "the index and the stage": the groups'
 * names stand still on the left with the current one marked, the features
 * scroll in the middle, and on the right one picture at a time stands still
 * and changes to the current group's. All three share one grid, so the
 * pictures are in the document beside their groups: a phone shows each above
 * its group, with the index as a row of links under the top bar. The group
 * being read is the last whose mark has passed two fifths of the way down the
 * window. Until the page's script runs (`live`) every picture stands beside its own group.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { FEATURE_GROUPS } from '../../data/features.ts';
import { cx } from '../../utils/cx.ts';
import FeatureHead from '../FeatureHead/FeatureHead.tsx';
import FeatureList from '../FeatureList/FeatureList.tsx';
import FeatureShot from '../FeatureShot/FeatureShot.tsx';
import styles from './FeatureStage.module.css';

// Two rows of the grid for each group: its name, then its list. The index and the stage span them all.
const ROWS = FEATURE_GROUPS.length * 2;

function FeatureStage() {
  const [live, setLive] = useState(false);
  const [here, setHere] = useState<string>();
  const marks = useRef<(HTMLElement | null)[]>([]);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const row = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let current: string | undefined;
    const mark = (): void => {
      const line = innerHeight * 0.4;
      const now = (
        marks.current.findLast((m) => m!.getBoundingClientRect().top <= line) ?? marks.current[0]
      )?.id;
      if (now === current) return;
      current = now;
      setHere(now);
    };
    setLive(true);
    addEventListener('scroll', mark, { passive: true });
    addEventListener('resize', mark);
    mark();
    return () => {
      removeEventListener('scroll', mark);
      removeEventListener('resize', mark);
    };
  }, []);

  // Only the chip row scrolls sideways; wide, the list is as long as its words and this moves nothing.
  useEffect(() => {
    const link = links.current[FEATURE_GROUPS.findIndex((group) => group.id === here)];
    if (!link || !row.current) return;
    row.current.scrollTo({
      left: link.offsetLeft - row.current.offsetLeft - 20,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [here]);

  return (
    <div
      className={cx(styles.root, live && styles.live)}
      style={{ '--rows': ROWS } as CSSProperties}
    >
      <nav className={styles.index} aria-label="Groups on this page">
        <ul ref={row} className={styles.bare}>
          {FEATURE_GROUPS.map((group, i) => (
            <li key={group.id}>
              <a
                ref={(el) => {
                  links.current[i] = el;
                }}
                className={styles.link}
                href={`#${group.id}`}
                aria-current={group.id === here ? 'location' : undefined}
              >
                {group.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {FEATURE_GROUPS.map((group, i) => (
        <section key={group.id} className={styles.group} aria-labelledby={`${group.id}-title`}>
          <div
            ref={(el) => {
              marks.current[i] = el;
            }}
            className={styles.mark}
            id={group.id}
            style={{ gridRow: i * 2 + 1 }}
          />
          <div className={styles.head} style={{ gridRow: i * 2 + 1 }}>
            <FeatureHead group={group} quiet={!group.shot} />
          </div>
          <FeatureShot
            className={styles.shot}
            group={group}
            sizes="(max-width: 900px) 100vw, 46vw"
            eager={i === 0}
            away={live && group.id !== here}
          />
          <div className={styles.list} style={{ gridRow: i * 2 + 2 }}>
            <FeatureList items={group.items} />
          </div>
        </section>
      ))}
    </div>
  );
}

export default FeatureStage;
