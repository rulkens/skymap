/**
 * FadeId — discriminated union identifying any fadeable layer.
 *
 * The fade registry stores one `FadeController` per id, keyed by a
 * stable string serialization. The union is closed: every renderer or
 * subsystem that wants to participate in fade orchestration adds itself
 * by extending one of the existing kinds rather than minting an
 * ad-hoc string.
 *
 * Kinds:
 *   - galaxy catalog       — one of SDSS, 2MRS, GLADE, Famous, Synthetic.
 *                    Fades in on first load; fades out → upload → in
 *                    on tier swap. Discriminator: `id: GalaxyCatalogId`
 *                    (the string id the point renderer keys catalogs by).
 *   - filaments    — the single cosmic-web filament skeleton.
 *                    Fades in on first load. No discriminator.
 *   - flow         — the CF4++ peculiar-velocity flow overlay. Fades in on
 *                    first load (the slot commit), like filaments/galaxy catalog;
 *                    fades out on disable. No discriminator.
 *   - scalarField  — one volumetric scalar field (CF-4, rhizome-small,
 *                    rhizome-medium, rhizome-large). Discriminator:
 *                    `field: VolumeFieldId` (the registry id the
 *                    volume renderer keys fields by).
 *   - markerLayer  — the structure marker rings for one structure
 *                    category (cluster, supercluster, void, group).
 *                    Discriminator: `category: StructureCategory`. One
 *                    controller per category so a category's rings can
 *                    fade independently of the others.
 *   - labelLayer   — one logical label layer (milkyWay, structure,
 *                    galaxy names, scale bar). Discriminator:
 *                    `layer: LabelLayerId`. Structure labels additionally key
 *                    on `category: StructureCategory` so each structure
 *                    category's labels are a distinct controller; the
 *                    other layers (milkyWay/galaxyNames/scaleBar)
 *                    carry no category. Famous-galaxy labels reuse the
 *                    `galaxyNames` layer rather than minting a value.
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
 * Future kinds (e.g. `galaxyCatalogChunk` for chunked galaxy loading) extend
 * the union without breaking existing consumers because every consumer
 * matches on `kind` exhaustively.
 *
 * All fields are `readonly` because ids are values used as map keys
 * and must not be mutated after construction.
 */

import type { StructureCategory } from '../data/structure/StructureCategory';
import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { VolumeFieldId } from '../data/volume/VolumeFieldId';
import type { LabelLayerId } from './LabelLayerId';
import type { OverlayId } from './OverlayId';

export type FadeId =
  | { readonly kind: 'galaxyCatalog'; readonly id: GalaxyCatalogId }
  | { readonly kind: 'filaments' }
  | { readonly kind: 'flow' }
  | { readonly kind: 'scalarField'; readonly field: VolumeFieldId }
  | { readonly kind: 'markerLayer'; readonly category: StructureCategory }
  | {
      readonly kind: 'labelLayer';
      readonly layer: LabelLayerId;
      readonly category?: StructureCategory;
    }
  | { readonly kind: 'overlay'; readonly id: OverlayId }
  | { readonly kind: 'volumesMaster' };
