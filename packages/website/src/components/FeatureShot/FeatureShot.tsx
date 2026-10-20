/*
 * FeatureShot — the picture of one group of the Features page, with its label
 * under it. Wide, the picture runs out to the window's right edge (`--bleed`,
 * the page column's own right margin), cut to `--shot-room` high where a
 * window is too short for it. On the stage, wide, `away` fades it out while
 * another group's picture is the one being read; the stage places it with `className`.
 */
import type { FeatureGroup } from '../../@types/FeatureGroup';
import { cx } from '../../utils/cx.ts';
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './FeatureShot.module.css';

type FeatureShotProps = {
  group: FeatureGroup;
  sizes: string;
  eager?: boolean;
  away?: boolean;
  className?: string;
};

function FeatureShot({ group, sizes, eager = false, away = false, className }: FeatureShotProps) {
  if (!group.shot) return null;
  return (
    <figure className={cx(styles.root, away && styles.away, className)}>
      <div className={styles.picture}>
        <Shot id={group.shot} tall={group.tall} sizes={sizes} eager={eager} />
      </div>
      <figcaption className={styles.caption}>
        <ShotCaption id={group.shot} />
      </figcaption>
    </figure>
  );
}

export default FeatureShot;
