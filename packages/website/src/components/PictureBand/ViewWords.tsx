/* ViewWords — words of a gallery band that follow the view: one child per view, in the order of the views, in one cell so the tallest reserves the room. */
import { Children } from 'react';
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import { useGalleryState } from './GalleryContext.ts';
import styles from './PictureBand.module.css';
import changing from './viewChange.module.css';

type ViewWordsProps = { children: ReactNode };

function ViewWords({ children }: ViewWordsProps) {
  const { at, live } = useGalleryState();
  return (
    <div className={styles.words}>
      {Children.map(children, (child, i) => (
        <div className={cx(changing.view, (live ? i !== at : i !== 0) && changing.away)}>
          {child}
        </div>
      ))}
    </div>
  );
}

export default ViewWords;
