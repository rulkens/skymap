/**
 * One scene group the fetch/bake CLIs work on, selected by `--group <id>`
 * (`groups/sceneGroupById.ts`). Every output path is keyed by `id`, so two
 * groups over one collection never share a harvest or an asset directory.
 */
import type { GroupAnchor } from '../../scene-workbench/@types/GroupAnchor';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

export type SceneGroupDefinition = {
  readonly id: string;
  readonly name: string;
  readonly anchor: GroupAnchor;
  /** Crop bounds, WGS84 degrees — applied before colorization, in the ortho's own frame. */
  readonly bounds: LonLatBounds;
  /** DHM 1 km tile names to fetch (listed in data/raw/dhm/README.md). */
  readonly dhmTiles: readonly string[];
  readonly skraafoto: {
    /** STAC collection the splat bake's frames come from
     *  (data/raw/skraafoto/README.md) — one flight vintage per collection. */
    readonly collection: string;
    /** Target ground resolution of the harvested JPEGs, mm per pixel. Set it
     *  and every frame is cropped to `bounds` and downsampled only that far;
     *  leave it off and whole frames come down at the 1920 px long edge. */
    readonly groundMmPerPx?: number;
  };
  /** The tiles' CRS. Punktsky LAS files embed none, so the pipeline's
   *  `readers.las` stages must state it or `filters.reprojection` refuses. */
  readonly sourceSrs: string;
  /** `filters.sample` radius, metres — the density cap that keeps points.bin loadable. */
  readonly minPointSpacingM: number;
  /** ASPRS classes dropped before packing (7 = low noise, 18 = high noise). */
  readonly dropClassifications: readonly number[];
};
