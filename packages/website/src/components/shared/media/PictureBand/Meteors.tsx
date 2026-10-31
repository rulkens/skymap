/*
 * Meteors — now and then, a faint meteor crosses a gallery band's star field: only a view with a `sky`, inside
 * that box, once the view has settled and while the band is on screen. None under reduced motion.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import type { GalleryView } from '../../../../@types/GalleryView';
import { lessWanted } from '../../../../utils/lessWanted.ts';
import styles from './Meteors.module.css';

type Sky = NonNullable<GalleryView['sky']>;
type Streak = { id: number; at: number; style: CSSProperties };
type MeteorsProps = { views: readonly GalleryView[]; at: number };

// The wait between two meteors, in seconds: often enough to be caught on one slide or two, never on every one.
// Past it the next comes with the next view that has a sky.
const GAP_SEC = [6, 16] as const;
// After a view's 1.4 s cross-fade, so a meteor never crosses two pictures.
const SETTLE_MS = 2000;

const between = (low: number, high: number) => low + Math.random() * (high - low);

// A random place and angle whose whole path, head to head, lies in the sky; null when no try fits.
function plot(sky: Sky, box: DOMRect, id: number, at: number): Streak | null {
  // A floor, so a phone's band still shows a streak and not a speck.
  const length = Math.max(box.width * between(0.05, 0.09), 28);
  const travel = length * between(1.4, 2);
  const inSky = (x: number, y: number) =>
    x >= sky.left * box.width &&
    x <= sky.right * box.width &&
    y >= sky.top * box.height &&
    y <= sky.bottom * box.height;
  for (let i = 0; i < 12; i++) {
    const angle = between(0, 2 * Math.PI);
    const x = box.width * between(sky.left, sky.right);
    const y = box.height * between(sky.top, sky.bottom);
    if (!inSky(x + travel * Math.cos(angle), y + travel * Math.sin(angle))) continue;
    return {
      id,
      at,
      style: {
        left: x - length,
        top: y,
        width: length,
        '--angle': `${angle}rad`,
        '--travel': `${travel}px`,
        '--duration': `${Math.round(between(550, 850))}ms`,
      } as CSSProperties,
    };
  }
  return null;
}

function Meteors({ views, at }: MeteorsProps) {
  const box = useRef<HTMLDivElement>(null);
  const arrived = useRef({ at, ms: 0 });
  const [streak, setStreak] = useState<Streak | null>(null);

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
      const next = ready ? plot(sky, rect, ++count, view) : null;
      if (next) setStreak(next);
      timer = setTimeout(tryNow, next ? between(...GAP_SEC) * 1000 : 1000);
    };
    timer = setTimeout(tryNow, between(...GAP_SEC) * 1000);
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
