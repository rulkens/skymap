/**
 * The numbers the Rendering pages print, each beside the constant of the app
 * that sets it, read from the app's source as text. A changed constant fails
 * here, so no row goes on quoting the old figure. Only rows where a named
 * constant backs the printed number are covered.
 */
import { describe, expect, it } from 'vitest';

import { fact } from '../../../packages/website/src/data/fact';
import { sourceNumbers } from './sourceNumbers';

const one = (file: string, name: string): number => sourceNumbers(file, name)[0]!;
const text = (id: string): string => fact(id).text;
const grouped = (n: number): string => n.toLocaleString('en');

const LOD = 'src/data/galaxyLodBands.ts';
const TILES = 'src/data/bodies/surfaceTileParams.ts';
const SHELL = 'src/services/gpu/renderers/atmosphere/atmosphereShellRenderer.ts';
const SLABS = 'src/services/engine/frame/slabs.ts';
const STARS = 'src/data/starCatalog/starCatalogFormat.ts';
// One megaparsec in metres, to the figures a rounded sentence needs.
const MPC_M = 3.0857e22;

describe('rendering rows and the constants behind them', () => {
  it('the three fades of a galaxy', () => {
    const disc = [
      one(LOD, 'PROCEDURAL_DISK_FADE_START_PX'),
      one(LOD, 'PROCEDURAL_DISK_FADE_END_PX'),
    ];
    const picture = one(LOD, 'APPARENT_SIZE_THRESHOLD_PX');
    const full = one(LOD, 'HI_RES_TRIGGER_PX');
    const row = text('render-galaxy-fades');
    expect(row).toContain(`between ${disc[0]} and ${disc[1]} pixels`);
    expect(row).toContain(`between ${picture} and ${picture + one(LOD, 'FADE_BAND_PX')},`);
    expect(row).toContain(`between ${full} and ${full + one(LOD, 'HI_RES_FADE_BAND_PX')}.`);
  });

  it('the two reduced images whose divisor is a named scale', () => {
    const row = text('render-reduced-targets');
    expect(one('src/layers/cosmicWebDensity/layer.ts', 'scale')).toBe(3);
    expect(row).toContain('the cosmic web at a third');
    expect(one('src/layers/zoneOfAvoidance/layer.ts', 'scale')).toBe(5);
    expect(row).toContain('the Zone of Avoidance band at a fifth');
    expect(
      one('src/layers/starCatalog/render/starAggregatesTarget.ts', 'STAR_AGGREGATE_DIVISOR'),
    ).toBe(4);
    expect(row).toContain('distant stars at a quarter');
  });

  it('the selection image: bits for the row and for the catalogue', () => {
    const rowBits = one('src/data/selectionEncoding.ts', 'SELECTION_SOURCE_SHIFT');
    expect(text('render-pick')).toContain(
      `${32 - rowBits} bits for the catalogue and ${rowBits} for the row`,
    );
  });

  it('a star: bits of a step inside its box', () => {
    expect(text('render-local-origins')).toContain(
      `${Math.log2(one(STARS, 'STAR_OFFSET_LEVELS'))}-bit steps`,
    );
  });

  it('the floor of light on the night side', () => {
    const ambient = one('src/services/gpu/shaders/lib/bodyLighting.wesl', 'AMBIENT');
    expect(text('render-body-light')).toContain(`a floor of ${Math.round(ambient * 100)} per cent`);
  });

  it('the atmosphere tables and the haze volume', () => {
    const by = (size: number[]) => size.join(' by ');
    const tables = text('render-atmosphere-tables');
    expect(tables).toContain(`(${by(sourceNumbers(SHELL, 'TRANSMITTANCE_LUT_SIZE'))} values)`);
    expect(tables).toContain(`(${by(sourceNumbers(SHELL, 'MULTI_SCATTER_LUT_SIZE'))})`);
    expect(tables).toContain(`at ${by(sourceNumbers(SHELL, 'SKY_VIEW_LUT_SIZE'))},`);
    expect(tables).toContain(
      `or ${by(sourceNumbers('src/data/bodies/skyViewLutSizeByTier.ts', 'small'))} at the small data size`,
    );
    const haze = 'src/data/atmosphere/froxelVolume.ts';
    const aerial = text('render-aerial');
    expect(aerial).toContain(`${by(sourceNumbers(haze, 'FROXEL_DIMS'))} cells`);
    expect(aerial).toContain(`one layer every ${one(haze, 'FROXEL_SLICE_KM')} kilometres`);
  });

  it('a ground patch, its heights and the two atlases', () => {
    const cells = one(TILES, 'SURFACE_TILE_MESH_RESOLUTION');
    const posts = one('src/data/scene/heightTileFormat.ts', 'HEIGHT_POSTS_PER_TILE');
    const terrain = text('render-terrain');
    expect(terrain).toContain(`${cells} by ${cells} cells`);
    expect(terrain).toContain(`${posts} by ${posts} posts`);
    const perRow = one(TILES, 'SURFACE_TILE_ATLAS_SIDE') / one(TILES, 'SURFACE_TILE_PX');
    const heightsPerRow = one(TILES, 'HEIGHT_TILE_ATLAS_SIDE');
    expect(text('render-terrain-fallback')).toContain(
      `room for ${perRow ** 2} of them and their heights in one with room for ${grouped(heightsPerRow ** 2)}.`,
    );
  });

  it('steps of the two ray marches and rays of the lens table', () => {
    expect(text('render-density-march')).toContain(
      `${one('src/services/gpu/shaders/scalarVolume/fragment.wesl', 'STEP_COUNT')} steps`,
    );
    const lens = text('render-lens');
    expect(lens).toContain(
      `For ${one('src/layers/blackHoles/render/blackHoleLensingRenderer.ts', 'LUT_SAMPLE_COUNT')} rays`,
    );
    expect(lens).toContain(
      `in ${one('src/services/gpu/shaders/bodies/blackHoleLensing/fragment.wesl', 'MARCH_STEPS')} steps`,
    );
  });

  it('the near and far limits of the galaxies’ range', () => {
    expect(text('render-depth-range')).toContain(
      `${one(SLABS, 'COSMO_FAR_MPC') / 1000} gigaparsecs`,
    );
    expect(text('render-near-cut')).toContain(`${one(SLABS, 'COSMO_NEAR_MPC') * 1000} kiloparsecs`);
  });

  it('the camera’s stop round a focus with no surface', () => {
    const km =
      (one('src/services/engine/camera/pivotRadiusMpc.ts', 'SURFACELESS_FLOOR_MPC') * MPC_M) / 1000;
    expect(text('render-floors')).toContain(`about ${Number(km.toPrecision(1))} kilometres away`);
  });

  it('rows of galaxies taken in one frame', () => {
    const budget = one(
      'src/layers/galaxyCatalog/subsystems/diskPlannerWalk.ts',
      'DISK_ROW_ACCEPT_BUDGET',
    );
    expect(text('render-cpu-galaxies')).toContain(`at most ${grouped(budget)} rows`);
  });
});
