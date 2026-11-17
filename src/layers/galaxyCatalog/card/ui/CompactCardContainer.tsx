/**
 * CompactCardContainer — store boundary for the galaxy hover card: joins a famous galaxy's
 * sidecar entry (its morphology) so the card stays pure.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import CompactCard, { type CompactCardProps } from './CompactCard/CompactCard';
import { useFamousGalaxyMeta } from './useFamousGalaxyMeta';

type CompactCardContainerProps = Omit<CompactCardProps, 'curated'>;

function CompactCardContainer(props: CompactCardContainerProps): ReactNode {
  return <CompactCard {...props} curated={useFamousGalaxyMeta(props.target)} />;
}

export default memo(CompactCardContainer);
