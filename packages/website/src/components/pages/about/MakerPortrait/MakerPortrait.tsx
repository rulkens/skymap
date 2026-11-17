/*
 * MakerPortrait — the words about who makes Skymap (the children) on the left half of the page grid, and beside
 * them his photograph, run out to the window's right edge, its dark wall feathered into the page's sky. Narrow,
 * the photograph comes first.
 */
import type { ReactNode } from 'react';

import styles from './MakerPortrait.module.css';
import { PORTRAIT } from './MakerPortrait.constants.ts';

type MakerPortraitProps = { alt: string; children: ReactNode };

function MakerPortrait({ alt, children }: MakerPortraitProps) {
  return (
    <div className={styles.root}>
      <div className={styles.words}>{children}</div>
      <div className={styles.figure}>
        <div className={styles.frame}>
          <picture>
            <source
              type="image/avif"
              srcSet={PORTRAIT.avif}
              sizes={PORTRAIT.sizes}
              width={PORTRAIT.width}
              height={PORTRAIT.height}
            />
            <img
              src={PORTRAIT.src}
              srcSet={PORTRAIT.webp}
              sizes={PORTRAIT.sizes}
              width={PORTRAIT.width}
              height={PORTRAIT.height}
              alt={alt}
              loading="lazy"
              decoding="async"
            />
          </picture>
        </div>
      </div>
    </div>
  );
}

export default MakerPortrait;
