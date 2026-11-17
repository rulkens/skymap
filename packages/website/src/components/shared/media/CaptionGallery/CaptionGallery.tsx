/*
 * CaptionGallery — the label of a gallery band (PictureBand with `views`): one
 * ShotCaption per view in one cell, under a row of ring markers, one per view,
 * that choose the view. A host treats it as a single label (it draws the same
 * foot). The markers sit close and centred: a quiet row, not a control bar.
 * Before the page's script runs the markers stay hidden and the first label stands.
 */
import { siteShot } from '../../../../data/siteShot.ts';
import { cx } from '../../../../utils/cx.ts';
import { useGalleryState } from '../gallery/GalleryContext.ts';
import { useGalleryMarks } from '../gallery/useGalleryMarks.ts';
import changing from '../gallery/viewChange.module.css';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './CaptionGallery.module.css';

function CaptionGallery() {
  const gallery = useGalleryState();
  const { views, at, live, byReader } = gallery;
  const marks = useGalleryMarks(gallery);

  return (
    <div className={styles.root}>
      <div className={cx(styles.marks, !live && styles.idle)} {...marks.group}>
        {views.map((view, i) => (
          <button
            key={view.id}
            className={styles.mark}
            aria-label={siteShot(view.id).title}
            {...marks.mark(i)}
          />
        ))}
      </div>
      {/* A change nobody asked for is not read out: a label announced every few seconds talks over the page. */}
      <div className={styles.labels} aria-live={live && !byReader ? 'off' : 'polite'}>
        {views.map((view, i) => (
          <div
            key={view.id}
            className={cx(changing.view, (live ? i !== at : i !== 0) && changing.away)}
          >
            <ShotCaption id={view.id} showDrawn={false} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default CaptionGallery;
