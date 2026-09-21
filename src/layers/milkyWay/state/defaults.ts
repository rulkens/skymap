/**
 * milkyWay — the Layer's user-settable defaults, seeding `milkyWaySlice`: the
 * disk overlay's toggle (registry-derived) and the "you are here" label's
 * (a literal — see its comment for why the registry is not its source).
 */

import { SOURCE_REGISTRY, Source } from '../../../data/sources';

/**
 * Milky Way overlay default — the star/dust point cloud at the world origin
 * gives a visceral "you are here" sense before the user flies out into the
 * cosmic-web view. Derived from the SOURCE_REGISTRY milkyWay row's `visible`
 * gate, so the registry is the single source of truth; see
 * `services/gpu/renderers/milkyWay/milkyWayCloudRenderer.ts` +
 * `services/engine/galaxyGenerator/v1/milkyWayFadeAlpha.ts` for the apparent-size fade band.
 */
export const DEFAULT_MILKY_WAY_ENABLED = SOURCE_REGISTRY[Source.MilkyWay].visible;

/**
 * "You are here" Milky-Way label default — ON.  The label is always available
 * by camera distance, so its toggle defaults on.
 *
 * Unlike `DEFAULT_MILKY_WAY_ENABLED` above, this is a plain `true` literal, NOT
 * registry-derived: the registry row's `visible` field gates the DISK overlay,
 * and the row carries no separate label-visible field.  Inventing a registry
 * column just to source one boolean would be the wrong kind of indirection —
 * the literal is the honest single source of truth for this axis.
 */
export const DEFAULT_MILKY_WAY_LABEL_ENABLED: boolean = true;
