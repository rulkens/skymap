/**
 * SceneBody — the union of every seeded scene-body record.
 *
 * Body-aware consumers that iterate the flat `SCENE_BODIES` registry (the
 * command-palette rows, the `body-<id>` focus resolver, the selection-row
 * extractor) only ever read the identity fields every shape shares — `id`,
 * `label`, `radiusM` — so the union is the honest type for the registry: it
 * names what a registry entry can be without forcing every entry into Earth's
 * texture-carrying shape or inventing a fourth "common base" record that the
 * seeds would then have to be re-projected into. No arm carries a position:
 * every scene body's is resolved by `deriveBodyStates`, from an orbital element
 * row or from a `SCENE_ANCHORS` root.
 */

import type { EarthBody } from './EarthBody';
import type { StarBody } from './StarBody';
import type { PlanetBody } from './PlanetBody';
import type { AnchorPointBody } from './AnchorPointBody';

export type SceneBody = EarthBody | StarBody | PlanetBody | AnchorPointBody;
