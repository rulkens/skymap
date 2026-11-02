/*
 * RealData — Home's case that the scene is measured: four kinds of source, each a square picture and the
 * names of its sources (data/dataSources.ts, the Science page's table, so nothing is named here that is
 * not there), each name a link to its data page beside the number of objects it gives the scene, as that table
 * counts them, and the count pointed at (the first, until then) stands large over the picture. Each picture is
 * a round window into the scene, no frame. Behind the title, the orbits of the stars round the Milky Way's
 * central black hole, one of the Stars sources, drift past more slowly than the page. The title and the words
 * under it (children) are the page's.
 */
import type { CSSProperties, ReactNode } from 'react';

import { fact } from '../../../../data/fact.ts';
import { cx } from '../../../../utils/cx.ts';
import { dataRowPath } from '../../../../utils/dataRowPath.ts';
import { revealDelay } from '../../../../utils/revealDelay.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import SectionHead from '../../../shared/layout/SectionHead/SectionHead.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import { COUNT_LABEL, KINDS, WINDOW_SIZES } from './RealData.constants.ts';
import styles from './RealData.module.css';

type RealDataProps = { title: string; children: ReactNode };

function RealData({ title, children }: RealDataProps) {
  return (
    <section className={styles.root} id="data">
      <div className={styles.orbits} aria-hidden>
        <Shot id="orbits-s-stars" sizes="(max-width: 900px) 44rem, 64rem" alt="" />
      </div>
      <SectionHead title={title} top>
        {children}
      </SectionHead>
      <div className={styles.kinds}>
        {KINDS.map((kind, at) => {
          const figure = kind.fact ? fact(kind.fact).figure : undefined;
          return (
            <div
              key={kind.group}
              className={styles.kind}
              style={{ '--kind-accent': kind.accent } as CSSProperties}
            >
              <figure className={styles.figure}>
                <div className={styles.window} style={revealDelay(at * 60)} data-reveal="rise">
                  <Shot id={kind.shot} sizes={WINDOW_SIZES} />
                </div>
                {figure && (
                  <p className={cx(styles.big, styles.held)}>
                    {figure.value}
                    <small>{figure.measure}</small>
                  </p>
                )}
                <figcaption className={styles.caption}>
                  <ShotCaption id={kind.shot} showDrawn={false} foot />
                </figcaption>
              </figure>
              <h3>{kind.group}</h3>
              <ul className={styles.names}>
                {kind.sources.some((row) => row.count) && (
                  <li className={styles.countHead} aria-hidden>
                    {COUNT_LABEL}
                  </li>
                )}
                {kind.sources.map((row) => (
                  <li key={row.id}>
                    <a href={sitePath(dataRowPath(row.entries))}>{row.short}</a>
                    {row.count && (
                      <>
                        <span className={styles.count}>{row.count}</span>
                        <span className={styles.big} aria-hidden>
                          {row.count.split(' ')[0]}
                          <small>
                            {row.noun ? `${row.noun} from ` : ''}
                            {row.short}
                          </small>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default RealData;
