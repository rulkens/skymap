/**
 * FadeHandle — discriminated union identifying any fadeable layer.
 *
 * The fade registry stores one `FadeController` per handle, keyed by a
 * stable string serialization. The union is closed: every renderer or
 * subsystem that wants to participate in fade orchestration adds itself
 * by extending one of the existing kinds rather than minting an
 * ad-hoc string.
 *
 * Kinds:
 *   - survey       — one of SDSS, 2MRS, GLADE, Famous, Synthetic.
 *                    Fades in on first load; fades out → upload → in
 *                    on tier swap. Discriminator: `source: Source`.
 *   - filaments    — the single cosmic-web filament skeleton.
 *                    Fades in on first load. No discriminator.
 *   - flow         — the CF4++ peculiar-velocity flow overlay. Fades in on
 *                    first load (the slot commit), like filaments/survey;
 *                    fades out on disable. No discriminator.
 *   - scalarField  — one volumetric scalar field (CF-4, rhizome-small,
 *                    rhizome-medium, rhizome-large). Discriminator:
 *                    `field: ScalarFieldHandle` (the string key the
 *                    volume renderer uses internally).
 *   - labelLayer   — one logical label layer (you-are-here, POI,
 *                    galaxy names, scale bar). Discriminator:
 *                    `layer: LabelLayerId`.
 *   - overlay      — always-on GPU overlay (Milky Way, procedural
 *                    disks, textured disks). Registered at
 *                    opacity 1.0 via setImmediate. Discriminator:
 *                    `id: OverlayId`.
 *   - volumesMaster — the master enable gate for the whole scalar-
 *                    volume subsystem. Used by setVolumesEnabled and
 *                    the encodeVolumes / volumeUpsamplePass gates to
 *                    smooth the master toggle. Multiplied into each
 *                    scalarField's per-frame opacity at the call site,
 *                    so a master fade-out drags every field down with
 *                    it. No discriminator.
 *
 * Future kinds (e.g. `surveyChunk` for chunked galaxy loading) extend
 * the union without breaking existing consumers because every consumer
 * matches on `kind` exhaustively.
 *
 * All fields are `readonly` because handles are values used as map keys
 * and must not be mutated after construction.
 */

import type { SourceType } from '../data/SourceType';
import type { ScalarFieldHandle } from '../rendering/ScalarFieldHandle';
import type { LabelLayerId } from './LabelLayerId';
import type { OverlayId } from './OverlayId';

export type FadeHandle =
  | { readonly kind: 'survey'; readonly source: SourceType }
  | { readonly kind: 'filaments' }
  | { readonly kind: 'flow' }
  | { readonly kind: 'scalarField'; readonly field: ScalarFieldHandle }
  | { readonly kind: 'labelLayer'; readonly layer: LabelLayerId }
  | { readonly kind: 'overlay'; readonly id: OverlayId }
  | { readonly kind: 'volumesMaster' };
