/**
 * GalaxyDetailCardContainer — store boundary for the galaxy detail card: joins a famous
 * galaxy's sidecar entry (description, morphology) so the card stays pure.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import GalaxyDetailCard, { type GalaxyDetailCardProps } from './GalaxyDetailCard/GalaxyDetailCard';
import { useFamousGalaxyMeta } from './useFamousGalaxyMeta';

type GalaxyDetailCardContainerProps = Omit<GalaxyDetailCardProps, 'curated'>;

function GalaxyDetailCardContainer(props: GalaxyDetailCardContainerProps): ReactNode {
  return <GalaxyDetailCard {...props} curated={useFamousGalaxyMeta(props.target)} />;
}

export default memo(GalaxyDetailCardContainer);
