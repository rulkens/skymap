/**
 * lidarPipelineStages — the stage graph is the contract with an external
 * tool (PDAL) that isn't installed in CI, so these tests pin the stage
 * order and the option strings PDAL is sensitive to byte-for-byte, the
 * same class of test as a parser-vs-ReadMe check.
 */
import { describe, expect, it } from 'vitest';

import {
  lidarPipelineStages,
  type LidarBakeSpec,
} from '../../../../tools/scene-recon/lidar/lidarPipelineStages';
import type { LonLatBounds } from '../../../../src/@types/scene/LonLatBounds';
import type { GroupAnchor } from '../../../../tools/scene-workbench/@types/GroupAnchor';

const BOUNDS: LonLatBounds = { west: 12.4, east: 12.6, south: 55.6, north: 55.7 };

const ANCHOR: GroupAnchor = {
  kind: 'geodetic',
  latDeg: 55.6761,
  lonDeg: 12.5683,
  heightMDvr90: 5.2,
  headingDeg: 0,
};

const SPEC: LidarBakeSpec = {
  lasFiles: ['/data/raw/lidar/tile_a.las', '/data/raw/lidar/tile_b.las'],
  bounds: BOUNDS,
  orthoVrtPath: '/tmp/ortho.vrt',
  anchor: ANCHOR,
  minPointSpacingM: 0.1,
  dropClassifications: [7, 18],
  outCsvPath: '/tmp/out.csv',
  defaultSrs: 'EPSG:25832',
};

describe('lidarPipelineStages', () => {
  it('orders crop and colorization before the metre reprojection', () => {
    const stages = lidarPipelineStages(SPEC);
    const types = stages.map((stage) => stage.type);
    expect(types).toEqual([
      'readers.las',
      'readers.las',
      'filters.reprojection',
      'filters.crop',
      'filters.expression',
      'filters.colorization',
      'filters.projpipeline',
      'filters.sample',
      'writers.text',
    ]);
  });

  it('names the source CRS on every reader — the LAS tiles embed none', () => {
    const readers = lidarPipelineStages(SPEC).filter((stage) => stage.type === 'readers.las');
    expect(readers).toHaveLength(2);
    for (const reader of readers) expect(reader.default_srs).toBe('EPSG:25832');
  });

  it('writes the anchor into the topocentric coordinate-operation pipeline', () => {
    const stages = lidarPipelineStages(SPEC);
    const topocentric = stages.find((stage) => stage.type === 'filters.projpipeline');
    expect(topocentric, 'topocentric projpipeline stage').toBeTruthy();
    expect(topocentric!.coord_op).toBe(
      '+proj=pipeline +step +proj=unitconvert +xy_in=deg +xy_out=rad ' +
        '+step +proj=cart +ellps=GRS80 ' +
        '+step +proj=topocentric +lat_0=55.6761 +lon_0=12.5683 +h_0=5.2 +ellps=GRS80',
    );
  });

  it("crops in the ortho's degree frame", () => {
    const stages = lidarPipelineStages(SPEC);
    const crop = stages.find((stage) => stage.type === 'filters.crop');
    expect(crop, 'crop stage').toBeTruthy();
    expect(crop!.bounds).toBe('([12.4,12.6],[55.6,55.7])');
  });

  it('colorizes with scale 1', () => {
    const stages = lidarPipelineStages(SPEC);
    const colorization = stages.find((stage) => stage.type === 'filters.colorization');
    expect(colorization, 'colorization stage').toBeTruthy();
    expect(colorization!.dimensions).toBe('Red:1:1, Green:2:1, Blue:3:1');
    expect(colorization!.raster).toBe('/tmp/ortho.vrt');
  });

  it('drops every listed classification with AND semantics', () => {
    // filters.range would OR "Classification![7:7], Classification![18:18]"
    // together on the same dimension and exclude nothing — filters.expression
    // with `&&` is the only way to require both exclusions to hold at once.
    const stages = lidarPipelineStages(SPEC);
    const expression = stages.find((stage) => stage.type === 'filters.expression');
    expect(expression, 'expression stage').toBeTruthy();
    expect(expression!.expression).toBe('Classification != 7 && Classification != 18');
  });
});
