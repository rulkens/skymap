import type { SourceType } from '../../data/SourceType';

/**
 * A discriminated reference to the thing currently hovered / pinned by
 * the user.  Two variants:
 *
 *   - `{ kind: 'galaxy', source, localIdx }` — what the picker decodes
 *     from its r32uint readback.  Resolves through the selection
 *     subsystem's galaxy lookup to a `GalaxyInfo` for the InfoCard.
 *   - `{ kind: 'structure', id }` — an extended structure (cluster /
 *     supercluster / void / group), identified by its stable record id.
 *     Resolves through the structure lookup to a `FocusableTarget`.
 *
 * The structure variant is structure-only by construction: famous
 * galaxies are picked through the galaxy point path (so they arrive as
 * `kind: 'galaxy'`), and the ring pick decode never yields a famous
 * category.  The wider `LabelCategory` superset (which does include
 * `famousGalaxy`) belongs to the settings / label layers, not here.
 *
 * The two variants share one slot inside `selectionSubsystem` because
 * the picker can only resolve to one entity per pixel — a galaxy hover
 * and a structure hover are mutually exclusive at any given moment, and
 * the same for the pinned-select slot.  Galaxy-hovered + structure-
 * selected (or the reverse) is perfectly valid, since the two slots are
 * independent.
 */
export type GalaxySelection = { kind: 'galaxy'; source: SourceType; localIdx: number };
export type StructureSelection = { kind: 'structure'; id: string };
export type Selection = GalaxySelection | StructureSelection;
