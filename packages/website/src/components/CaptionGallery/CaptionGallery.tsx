/*
 * CaptionGallery — the label of a gallery band (PictureBand with `views`): one
 * ShotCaption per view in one cell, under a row of ring markers, one per view,
 * that choose the view. A host treats it as a single label (it draws the same
 * foot). The markers sit close and centred: a quiet row, not a control bar.
 * Before the page's script runs the markers stay hidden and the first label stands.
 */
import type { KeyboardEvent } from 'react';
import { useRef } from 'react';

import { siteShot } from '../../data/siteShot.ts';
import { cx } from '../../utils/cx.ts';
import { wrapIndex } from '../../utils/wrapIndex.ts';
import { useGalleryState } from '../PictureBand/GalleryContext.ts';
import changing from '../PictureBand/viewChange.module.css';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './CaptionGallery.module.css';

const STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function CaptionGallery() {
  const { views, at, live, byReader, choose, marksRef } = useGalleryState();
  const marks = useRef<(HTMLButtonElement | null)[]>([]);
  const last = views.length - 1;

  const onKeyDown = (event: KeyboardEvent) => {
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? last : at + (STEPS[event.key] ?? 0);
    if (to === at) return;
    event.preventDefault();
    choose(to);
    marks.current[wrapIndex(to, views.length)]?.focus();
  };

  return (
    <div className={styles.root}>
      <div
        ref={marksRef}
        className={cx(styles.marks, !live && styles.idle)}
        role="group"
        aria-label="Views"
      >
        {views.map((view, i) => (
          <button
            key={view.id}
            ref={(el) => {
              marks.current[i] = el;
            }}
            className={styles.mark}
            type="button"
            aria-label={siteShot(view.id).title}
            title={siteShot(view.id).title}
            aria-pressed={i === at}
            tabIndex={i === at ? 0 : -1}
            onClick={() => choose(i)}
            onKeyDown={onKeyDown}
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
            <ShotCaption id={view.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default CaptionGallery;
