/**
 * lidarPipelineStages — the PDAL pipeline JSON as data, so the LiDAR bake's
 * stage graph is testable without PDAL installed (the wrapper's actual
 * `spawnSync` runner is a separate, injected concern).
 *
 * Two `filters.reprojection` stages, not one: the first (→ EPSG:4326) puts
 * `filters.crop` and the ortho VRT in the same degree frame, before
 * colorization ever samples a pixel. The second reprojects into the
 * group's topocentric ENU metre frame (`in_srs` is EPSG:4326, the first
 * stage's output) and must run before `filters.sample`, whose `radius` is
 * metres — meaningless while points are still in degrees.
 *
 * Dropping classifications is `filters.expression`, not `filters.range`:
 * PDAL ORs multiple range clauses on the same dimension, so a chained
 * `Classification![7:7], Classification![18:18]` excludes nothing.
 */
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';
import type { GroupAnchor } from '../../scene-workbench/@types/GroupAnchor';

/** `writers.text`'s `order` — shared with `readPdalCsv` so the two cannot drift apart. */
export const PDAL_CSV_COLUMNS = 'X,Y,Z,Red,Green,Blue,Classification';

export type LidarBakeSpec = {
  readonly lazFiles: readonly string[];
  readonly bounds: LonLatBounds;
  readonly orthoVrtPath: string;
  readonly anchor: GroupAnchor;
  readonly minPointSpacingM: number;
  readonly dropClassifications: readonly number[];
  readonly outCsvPath: string;
};

export type PdalStage = Readonly<Record<string, unknown>>;

/** The `pipeline` array of a PDAL pipeline JSON, in execution order. */
export function lidarPipelineStages(spec: LidarBakeSpec): readonly PdalStage[] {
  const {
    lazFiles,
    bounds,
    orthoVrtPath,
    anchor,
    minPointSpacingM,
    dropClassifications,
    outCsvPath,
  } = spec;
  const { west, east, south, north } = bounds;

  const dropExpression = dropClassifications.map((c) => `Classification != ${c}`).join(' && ');
  const topocentricSrs = `+proj=topocentric +lat_0=${anchor.latDeg} +lon_0=${anchor.lonDeg} +h_0=${anchor.heightMDvr90} +ellps=GRS80`;

  return [
    ...lazFiles.map((filename): PdalStage => ({ type: 'readers.las', filename })),
    { type: 'filters.reprojection', out_srs: 'EPSG:4326' },
    { type: 'filters.crop', bounds: `([${west},${east}],[${south},${north}])` },
    { type: 'filters.expression', expression: dropExpression },
    {
      type: 'filters.colorization',
      raster: orthoVrtPath,
      dimensions: 'Red:1:1, Green:2:1, Blue:3:1',
    },
    { type: 'filters.reprojection', in_srs: 'EPSG:4326', out_srs: topocentricSrs },
    { type: 'filters.sample', radius: minPointSpacingM },
    {
      type: 'writers.text',
      format: 'csv',
      order: PDAL_CSV_COLUMNS,
      keep_unspecified: false,
      filename: outCsvPath,
    },
  ];
}
