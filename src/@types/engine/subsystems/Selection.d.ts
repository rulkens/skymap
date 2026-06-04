import type { SourceType } from '../../data/SourceType';

/**
 * A discriminated reference to the thing currently hovered / pinned by
 * the user.  Two variants:
 *
 *   - `{ kind: 'galaxy', source, localIdx }` — what the picker decodes
 *     from its r32uint readback.  Resolves through the selection
 *     subsystem's galaxy lookup to a `GalaxyInfo` for the InfoCard.
 *   - `{ kind: 'poi', id }` — a Point of Interest (cluster /
 *     supercluster / void / famous-galaxy anchor).  Resolves through
 *     the POI lookup to a `FocusableTarget`.
 *
 * The two variants share one slot inside `selectionSubsystem` because
 * the picker can only resolve to one entity per pixel — a galaxy hover
 * and a POI hover are mutually exclusive at any given moment, and the
 * same for the pinned-select slot.  Galaxy-hovered + POI-selected (or
 * the reverse) is perfectly valid, since the two slots are independent.
 */
export type GalaxySelection = { kind: 'galaxy'; source: SourceType; localIdx: number };
export type PoiSelection = { kind: 'poi'; id: string };
export type Selection = GalaxySelection | PoiSelection;
