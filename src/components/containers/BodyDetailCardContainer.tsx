// src/components/containers/BodyDetailCardContainer.tsx
/**
 * BodyDetailCardContainer — store boundary for the focused-body detail card.
 *
 * Owns the single read the presentational `BodyDetailCard` cannot do itself: the
 * live camera→body distance off the throttled `engineBodyDistanceReported` pub
 * (`selectFocusedBodyDistanceMpc`). The card renders its identity rows (label,
 * radius, aliases, the whole famous-star sidecar branch) from its props and stays
 * pure; only the time-dependent distance row flows through here.
 *
 * `memo` localizes the pub's few-Hz re-render to this leaf. The selector reads a
 * primitive, so a republished-but-unchanged distance is a reference-equal read
 * and never re-renders the card — the identity rows are stable across pub ticks.
 * Every other detail prop is forwarded straight through.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import BodyDetailCard, {
  type BodyDetailCardProps,
} from '../InfoCard/BodyDetailCard/BodyDetailCard';
import { useAppSelector } from '../../store/hooks';
import { selectFocusedBodyDistanceMpc } from '../../state/engine/selectors';

export type BodyDetailCardContainerProps = Omit<BodyDetailCardProps, 'distanceMpc'>;

function BodyDetailCardContainer(props: BodyDetailCardContainerProps): ReactNode {
  const distanceMpc = useAppSelector(selectFocusedBodyDistanceMpc);
  return <BodyDetailCard {...props} distanceMpc={distanceMpc} />;
}

export default memo(BodyDetailCardContainer);
