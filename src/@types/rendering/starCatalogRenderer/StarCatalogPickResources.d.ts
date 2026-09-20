import type { SourceType } from '../../data/SourceType';

/**
 * The GPU resources the sibling `starCatalogPickRenderer` must SHARE with the
 * visual star renderer so its own r32uint pick pipeline stays bind-group
 * compatible — the star analogue of the galaxy points pipeline handing its
 * canonical `sourceBgl` to the point `GalaxyPickRenderer`.
 *
 * Two things are shared:
 *
 *   - **The three explicit bind-group layouts** (`cameraBgl` @group(0),
 *     `drawBgl` @group(1), `recordsBgl` @group(2)). The pick renderer builds its
 *     OWN pick pipeline layout from these exact objects, so its pipeline is
 *     group-equivalent to the visual one and the shared records bind group (built
 *     against `recordsBgl`) is valid on it. The pick renderer also builds its own
 *     @group(0)/@group(1) bind groups — over its OWN uniform/params buffers, so
 *     the writeBuffer/submit ordering trap can never let a pick draw scribble on
 *     the visual buffers — against these same layouts.
 *   - **A per-source records bind group lookup.** The record blob is a static
 *     per-source resource the visual renderer uploads ONCE (`upload`); the pick
 *     draw binds it verbatim rather than re-uploading, so the two pipelines pull
 *     the identical record bytes. The lookup is a live function (a tier swap
 *     unloads/reloads a source), returning `null` when the source has no catalog.
 */
export type StarCatalogPickResources = {
  readonly cameraBgl: GPUBindGroupLayout;
  readonly drawBgl: GPUBindGroupLayout;
  readonly recordsBgl: GPUBindGroupLayout;
  /** The @group(2) records bind group for `source`, or `null` if not loaded. */
  recordsBindGroup(source: SourceType): GPUBindGroup | null;
};
