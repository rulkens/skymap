/**
 * StarDetailCardContainer — store boundary for the star detail card: finds a seeded star's
 * curated entry in the Layer's `famousStarsMeta` fact by `target.id`. The fact, not the
 * selection row, carries it, so a sidecar landing after the card opened (a cold
 * `#focus=star-…` link) still fills the block in. The card stays pure.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import StarDetailCard, { type StarDetailCardProps } from './StarDetailCard/StarDetailCard';
import { useAppSelector } from '../../../../store/hooks';
import { selectFamousStarsMeta } from './selectFamousStarsMeta';

type StarDetailCardContainerProps = Omit<StarDetailCardProps, 'curated'>;

function StarDetailCardContainer(props: StarDetailCardContainerProps): ReactNode {
  const meta = useAppSelector(selectFamousStarsMeta);
  const { id } = props.target;
  const curated = id === null ? undefined : meta.find((entry) => entry.id === id);
  return <StarDetailCard {...props} curated={curated} />;
}

export default memo(StarDetailCardContainer);
