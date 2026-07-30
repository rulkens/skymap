// src/components/containers/BodyDetailCardContainer.tsx
/**
 * BodyDetailCardContainer — store boundary for the focused-body detail card.
 *
 * Owns the two reads the presentational `BodyDetailCard` cannot do itself:
 *
 *   - the live camera→body distance off the throttled
 *     `engineBodyDistanceReported` pub (`selectFocusedBodyDistanceMpc`), and
 *   - the famous-star metadata sidecar (`selectFamousStarsMeta`), reported once
 *     by its asset slot — the card would otherwise have to fetch it itself,
 *     duplicating a payload the engine already loads.
 *
 * The card renders its identity rows (label, radius, aliases, the whole
 * famous-star branch) from its props and stays pure.
 *
 * `memo` localizes the pub's few-Hz re-render to this leaf. The distance
 * selector reads a primitive and the sidecar selector a stable array reference,
 * so a republished-but-unchanged distance is a reference-equal read and never
 * re-renders the card — the identity rows are stable across pub ticks. Every
 * other detail prop is forwarded straight through.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import BodyDetailCard, {
  type BodyDetailCardProps,
} from '../InfoCard/BodyDetailCard/BodyDetailCard';
import { useAppSelector } from '../../store/hooks';
import { selectFocusedBodyDistanceMpc, selectFamousStarsMeta } from '../../state/engine/selectors';

export type BodyDetailCardContainerProps = Omit<
  BodyDetailCardProps,
  'distanceMpc' | 'famousStarsMeta'
>;

function BodyDetailCardContainer(props: BodyDetailCardContainerProps): ReactNode {
  const distanceMpc = useAppSelector(selectFocusedBodyDistanceMpc);
  const famousStarsMeta = useAppSelector(selectFamousStarsMeta);
  return <BodyDetailCard {...props} distanceMpc={distanceMpc} famousStarsMeta={famousStarsMeta} />;
}

export default memo(BodyDetailCardContainer);
