/*
 * MakerPortrait — the words about who makes Skymap (the children) on the left half of the page grid, and beside
 * them his photograph, run out to the window's right edge, its dark wall feathered into the page's sky. His name
 * labels him the way the app labels a body: the name over a stem that runs straight down to his head, level with
 * the section's heading. The words already name him, so the label is hidden from screen readers. Narrow, the
 * photograph comes first.
 */
import type { ReactNode } from 'react';

import styles from './MakerPortrait.module.css';
import { PORTRAIT } from './MakerPortrait.constants.ts';

type MakerPortraitProps = { name: string; alt: string; children: ReactNode };

function MakerPortrait({ name, alt, children }: MakerPortraitProps) {
  return (
    <div className={styles.root}>
      <div className={styles.words}>{children}</div>
      <div className={styles.figure}>
        <span className={styles.name} aria-hidden="true">
          {name}
        </span>
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
