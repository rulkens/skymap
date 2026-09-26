/**
 * StructureDetailCardContainer — store boundary for the focused-structure detail card.
 *
 * Owns the one read the presentational `StructureDetailCard` cannot do itself: the
 * galaxyCatalog Layer's published member-count fact (`selectStructureMemberCount`)
 * — a structure-only figure, not part of every arm's shared `DetailCardProps`
 * contract (mirrors `BodyDetailCardContainer`'s live-distance read for the body arm).
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import StructureDetailCard from '../InfoCard/StructureDetailCard/StructureDetailCard';
import { useAppSelector } from '../../store/hooks';
import { selectStructureMemberCount } from '../../state/engine/selectors';
import type { DetailCardProps } from '../../@types/components/infoCard/DetailCardProps';

function StructureDetailCardContainer(props: DetailCardProps<'structure'>): ReactNode {
  const memberCount = useAppSelector(selectStructureMemberCount);
  return <StructureDetailCard {...props} memberCount={memberCount} />;
}

export default memo(StructureDetailCardContainer);
