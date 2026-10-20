/*
 * FeatureHead — the name of one group of the Features page, the line saying
 * what the group is for, and its film where it has one (FeatureFilm). `quiet`
 * sets the closing group's name small.
 */
import type { FeatureGroup } from '../../@types/FeatureGroup';
import { SITE_LOOPS } from '../../data/siteLoops.ts';
import { cx } from '../../utils/cx.ts';
import { loopUrl } from '../../utils/loopUrl.ts';
import FeatureFilm from './FeatureFilm.tsx';
import styles from './FeatureHead.module.css';

type FeatureHeadProps = { group: FeatureGroup; quiet?: boolean };

function FeatureHead({ group, quiet = false }: FeatureHeadProps) {
  // The film lies over the picture it starts from, so the two never differ when it begins.
  const still = group.film ? SITE_LOOPS.find((loop) => loop.id === group.film)?.shot : undefined;
  return (
    <header className={cx(styles.root, quiet && styles.quiet)}>
      <h2 id={`${group.id}-title`}>{group.title}</h2>
      <p>{group.line}</p>
      {group.film && still && (
        <FeatureFilm src={loopUrl(group.film)} still={still} says={group.filmSays} />
      )}
    </header>
  );
}

export default FeatureHead;
