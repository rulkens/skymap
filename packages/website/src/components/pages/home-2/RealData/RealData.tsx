/*
 * RealData — Home's case that the scene is measured: four kinds of source, each a square picture and the
 * names of its sources (data/dataSources.ts, the Science page's table, so nothing is named here that is
 * not there), each name a link to its data page beside the number of objects it gives the scene, as that table
 * counts them, and the count pointed at (the first, until then) stands large over the picture. Each picture is
 * a round window into the scene, no frame. Behind the title, the orbits of the stars round the Milky Way's
 * central black hole, one of the Stars sources, drift past more slowly than the page. Then the three words every
 * part of the scene is sorted into, as three pictures edge to edge across the window, each word over its picture.
 */
import type { CSSProperties } from 'react';

import { DATA_SOURCES } from '../../../../data/dataSources.ts';
import { HONESTY_BINS } from '../../../../data/honestyBins.ts';
import motion from '../../../../styles/motion.module.css';
import { cx } from '../../../../utils/cx.ts';
import { dataRowPath } from '../../../../utils/dataRowPath.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import SectionHead from '../../../shared/layout/SectionHead/SectionHead.tsx';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './RealData.module.css';

// The title of each is a group of the table, which picks its sources.
// `accent` is taken from the picture: the survey's warm near end, starlight, the orbits' gold, Earth's blue.
// `counts` names what the large number counts where a source's own count does not (`countNoun`).
const KINDS = [
  { group: 'Galaxies and quasars', counts: 'galaxies and quasars', shot: 'features-desi', accent: '#e8a774' },
  { group: 'Stars', counts: 'stars', shot: 'render-stars', accent: '#f1e2c4' },
  { group: 'Solar system', shot: 'lesson-solar-system', accent: '#d9c27a' },
  { group: 'Imagery', shot: 'earth-terminator', accent: '#8fb6ff' },
];

// A square window cut from a wide picture shows its full height, so the file is chosen for 16/9 of the window.
const WINDOW_SIZES = '(max-width: 900px) 29rem, 32rem';
// A source's short name: the table's name up to its gloss ("SDSS, the Sloan Digital Sky Survey").
const shortName = (name: string) => name.split(', ')[0]!;
// The Science table's count and its heading: what the app draws, or what the source holds where the build does
// not count (SourceTable).
const COUNT_LABEL = '# of objects';
const sources = (group: string) =>
  DATA_SOURCES.filter((row) => row.group === group).map((row) => ({
    ...row,
    count: row.drawn ?? row.rows,
  }));
// What a source's count is of: the noun of its catalogue size ("44,599 galaxies"), unless that only says rows,
// objects or spectra, where the group's word stands in (2MRS holds galaxies only; GLADE and DESI hold both).
const GENERIC = ['rows', 'objects', 'spectra'];
const countNoun = (rows: string | undefined, group: string) => {
  const noun = rows?.split(' ')[1];
  return noun && !GENERIC.includes(noun) ? noun : group;
};
const delay = (at: number) => ({ '--reveal-delay': `${at * 60}ms` }) as CSSProperties;

function RealData() {
  return (
    <section className={styles.root} id="data">
      <div className={styles.column}>
        <div className={styles.orbits} aria-hidden>
          <Shot id="orbits-s-stars" sizes="(max-width: 900px) 44rem, 64rem" alt="" />
        </div>
        <SectionHead title="Data you can count on" top>
          <p>
            Skymap places catalogued stars, galaxies and quasars in three dimensions. These are the
            catalogues and the imagery it is built from.
          </p>
          <ObjLink size="small" hang href={sitePath('/science/#sources')}>
            The sources, on the Science page
          </ObjLink>
        </SectionHead>
        <div className={styles.kinds}>
          {KINDS.map((kind, at) => (
            <div
              key={kind.group}
              className={styles.kind}
              style={{ '--kind-accent': kind.accent } as CSSProperties}
            >
              <figure className={styles.figure}>
                <div className={styles.window} style={delay(at)} data-reveal="rise">
                  <Shot id={kind.shot} sizes={WINDOW_SIZES} />
                </div>
                <figcaption className={styles.caption}>
                  <ShotCaption id={kind.shot} showDrawn={false} foot />
                </figcaption>
              </figure>
              <h3>{kind.group}</h3>
              <ul className={styles.names}>
                {sources(kind.group).some((row) => row.count) && (
                  <li className={styles.countHead} aria-hidden>
                    {COUNT_LABEL}
                  </li>
                )}
                {sources(kind.group).map((row) => (
                  <li key={row.id}>
                    <a href={sitePath(dataRowPath(row.entries))}>{shortName(row.name)}</a>
                    {row.count && (
                      <>
                        <span className={styles.count}>{row.count}</span>
                        <span className={styles.big} aria-hidden>
                          {row.count.split(' ')[0]}
                          <small>
                            {kind.counts ? `${countNoun(row.rows, kind.counts)} from ` : ''}
                            {shortName(row.name)}
                          </small>
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bins}>
        <div className={styles.binsHead}>
          <h3>Measured, derived and drawn</h3>
          <p>Every part of the scene is one of three kinds.</p>
          <ObjLink size="small" hang href={sitePath('/science/#bins')}>
            Which is which
          </ObjLink>
        </div>
        <div className={styles.strip}>
          {HONESTY_BINS.map((bin, at) => (
            <figure key={bin.id} className={styles.bin}>
              <div
                className={cx(styles.over, motion.unmask)}
                style={delay(at)}
                data-reveal="unmask"
              >
                <Shot id={bin.shot} sizes="(max-width: 900px) 100vw, 34vw" />
                <p className={styles.word} style={delay(at + 2)} data-reveal="rise">
                  <strong>{bin.title}</strong>
                  <span>{bin.gloss}</span>
                </p>
              </div>
              <figcaption className={styles.caption}>
                <ShotCaption id={bin.shot} showDrawn={false} foot />
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export default RealData;
