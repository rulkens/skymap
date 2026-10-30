/*
 * RealData — Home's case that the scene is measured: four kinds of source, each a square picture and the
 * names of its sources (data/dataSources.ts, the Science page's table, so nothing is named here that is
 * not there), each name a link to its data page. Then the three words every part of the scene is sorted
 * into, as three pictures edge to edge across the window, each word and its meaning over its picture.
 */
import { DATA_SOURCES } from '../../../../data/dataSources.ts';
import { HONESTY_BINS } from '../../../../data/honestyBins.ts';
import { dataRowPath } from '../../../../utils/dataRowPath.ts';
import { sitePath } from '../../../../utils/sitePath.ts';
import SectionHead from '../../../shared/layout/SectionHead/SectionHead.tsx';
import ObjLink from '../../../shared/links/ObjLink/ObjLink.tsx';
import Shot from '../../../shared/media/Shot/Shot.tsx';
import ShotCaption from '../../../shared/media/ShotCaption/ShotCaption.tsx';
import styles from './RealData.module.css';

// The title of each is a group of the table, which picks its sources.
const KINDS = [
  { group: 'Galaxies and quasars', shot: 'features-desi' },
  { group: 'Stars', shot: 'render-stars' },
  { group: 'Solar system', shot: 'lesson-solar-system' },
  { group: 'Imagery', shot: 'earth-terminator' },
];

// A source's short name: the table's name up to its gloss ("SDSS, the Sloan Digital Sky Survey").
const shortName = (name: string) => name.split(', ')[0]!;

function RealData() {
  return (
    <section className={styles.root} id="data">
      <div className={styles.column}>
        <SectionHead title="Real data, real science">
          <p>
            Skymap places catalogued stars, galaxies and quasars in three dimensions. These are the
            catalogues and the imagery it is built from.
          </p>
          <ObjLink size="small" hang href={sitePath('/science/#sources')}>
            The sources, on the Science page
          </ObjLink>
        </SectionHead>
        <div className={styles.kinds}>
          {KINDS.map((kind) => (
            <div key={kind.group} className={styles.kind}>
              <figure className={styles.figure}>
                <div className={styles.square}>
                  <Shot id={kind.shot} sizes="(max-width: 900px) 50vw, 18rem" />
                </div>
                <figcaption className={styles.caption}>
                  <ShotCaption id={kind.shot} showDrawn={false} foot />
                </figcaption>
              </figure>
              <h3>{kind.group}</h3>
              <ul className={styles.names}>
                {DATA_SOURCES.filter((row) => row.group === kind.group).map((row) => (
                  <li key={row.id}>
                    <a href={sitePath(dataRowPath(row.entries))}>{shortName(row.name)}</a>
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
          {HONESTY_BINS.map((bin) => (
            <figure key={bin.id} className={styles.bin}>
              <div className={styles.over}>
                <Shot id={bin.shot} sizes="(max-width: 900px) 100vw, 34vw" />
                <p className={styles.word}>
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
