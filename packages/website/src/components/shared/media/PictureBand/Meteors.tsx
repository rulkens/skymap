/*
 * Meteors — now and then, a faint meteor crosses a gallery band's star field: only a view with a `sky`, inside
 * that box, once the view has settled and while the band is on screen. None under reduced motion.
 */
import { useEffect, useRef, useState } from 'react';

import type { GalleryView } from '../../../../@types/GalleryView';
import type { MeteorStreak } from '../../../../@types/MeteorStreak';
import { lessWanted } from '../../../../utils/lessWanted.ts';
import { plotMeteor } from '../../../../utils/plotMeteor.ts';
import { randomBetween } from '../../../../utils/randomBetween.ts';
import { GAP_SEC, SETTLE_MS } from './Meteors.constants.ts';
import styles from './Meteors.module.css';

type MeteorsProps = { views: readonly GalleryView[]; at: number };

function Meteors({ views, at }: MeteorsProps) {
  const box = useRef<HTMLDivElement>(null);
  const arrived = useRef({ at, ms: 0 });
  const [streak, setStreak] = useState<MeteorStreak | null>(null);

  useEffect(() => {
    arrived.current = { at, ms: performance.now() };
  }, [at]);

  useEffect(() => {
    if (lessWanted().motion) return;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    const tryNow = (): void => {
      const rect = box.current!.getBoundingClientRect();
      const { at: view, ms } = arrived.current;
      const sky = views[view]?.sky;
      const ready =
        sky &&
        !document.hidden &&
        rect.bottom > 0 &&
        rect.top < innerHeight &&
        performance.now() - ms > SETTLE_MS;
      const next = ready ? plotMeteor(sky, rect, ++count, view) : null;
      if (next) setStreak(next);
      timer = setTimeout(tryNow, next ? randomBetween(...GAP_SEC) * 1000 : 1000);
    };
    timer = setTimeout(tryNow, randomBetween(...GAP_SEC) * 1000);
    return () => clearTimeout(timer);
  }, [views]);

  return (
    <div ref={box} className={styles.sky} aria-hidden="true">
      {streak?.at === at && (
        <span
          key={streak.id}
          className={styles.streak}
          style={streak.style}
          onAnimationEnd={() => setStreak(null)}
        />
      )}
    </div>
  );
}

export default Meteors;
