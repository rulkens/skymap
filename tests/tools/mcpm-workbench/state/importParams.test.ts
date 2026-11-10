/**
 * importParams — the JSON upload half of V3's save/load pair. Test 1 proves
 * the round trip through the REAL exportParams serializer (not a hand-rolled
 * fixture), so a key rename in one breaks here instead of silently drifting.
 * Test 2 hand-edits a valid payload's grid box to a non-cubic one — the
 * scenario a save/load round trip can never produce on its own, but a
 * human editing the downloaded JSON can, and T7's invariant (autoFitGridBox's
 * cubic-voxel construction) must survive that.
 */
import { describe, expect, it } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import type { McpmParams } from '../../../../tools/mcpm-workbench/@types/McpmParams';
import { Source } from '../../../../src/data/source';
import { exportParams } from '../../../../tools/mcpm-workbench/src/state/exportParams';
import { importParams } from '../../../../tools/mcpm-workbench/src/state/importParams';

const PARAMS: McpmParams = {
  senseSpreadDeg: 20,
  senseDistanceMpc: 4.6,
  turnAngleDeg: 10,
  moveDistanceMpc: 0.1,
  depositValue: 0,
  persistence: 0.8,
  sharpness: 2.5,
  normalizationFactor: 1.0,
};

const GRID_BOX: GridBox = {
  centerMpc: [-356, -600, -364],
  sizeMpc: [712, 1200, 728],
  dims: [712, 1200, 728],
  voxelSizeMpc: 1,
  rotation: [0, 0, 0, 1],
};

const SOURCES = [Source.SDSS, Source.TwoMRS] as const;
const EXPORT_INPUT = {
  params: PARAMS,
  agentCount: 5_300_000,
  initMode: 'aroundData',
  gridBox: GRID_BOX,
  sources: SOURCES,
} as const;

describe('importParams', () => {
  it('round trips an exportParams payload, every field including the nested GridBox', () => {
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'aroundData',
      gridBox: GRID_BOX,
      sources: SOURCES,
    });

    const imported = importParams(json);

    expect(imported.params).toEqual(PARAMS);
    expect(imported.agentCount).toBe(5_300_000);
    expect(imported.initMode).toBe('aroundData');
    expect(imported.gridBox).toEqual(GRID_BOX);
    expect(imported.sources).toEqual(SOURCES);
  });

  it('imports a preset that omits "sources" (pre-S15) and leaves the field undefined', () => {
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'aroundData',
      gridBox: GRID_BOX,
      sources: SOURCES,
    });
    const preset = JSON.parse(json) as Record<string, unknown>;
    delete preset.sources;

    const imported = importParams(JSON.stringify(preset));

    expect(imported.sources).toBeUndefined();
  });

  it('defaults a missing rotation field to identity', () => {
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'aroundData',
      gridBox: GRID_BOX,
      sources: SOURCES,
    });
    const preset = JSON.parse(json) as { gridBox: Record<string, unknown> };
    delete preset.gridBox.rotation;

    const imported = importParams(JSON.stringify(preset));

    expect(imported.gridBox.rotation).toEqual([0, 0, 0, 1]);
  });

  it('rejects a non-unit rotation quaternion, naming the field', () => {
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'aroundData',
      gridBox: GRID_BOX,
      sources: SOURCES,
    });
    const preset = JSON.parse(json) as { gridBox: GridBox };
    preset.gridBox = { ...preset.gridBox, rotation: [0, 0, 0, 2] };

    expect(() => importParams(JSON.stringify(preset))).toThrow(/rotation/i);
  });

  it('round-trips a non-identity rotation', () => {
    // 90° about Y — a genuine unit quaternion, not identity, so this exercises
    // exportParams and importParams as two independent implementations rather
    // than a value that would pass even if rotation were dropped silently.
    const rotatedBox: GridBox = {
      ...GRID_BOX,
      rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
    };
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'aroundData',
      gridBox: rotatedBox,
      sources: SOURCES,
    });

    const imported = importParams(json);

    expect(imported.gridBox.rotation).toEqual(rotatedBox.rotation);
  });

  it('rejects a "sources" entry that is not a known workbench source id', () => {
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'aroundData',
      gridBox: GRID_BOX,
      sources: SOURCES,
    });
    const preset = JSON.parse(json) as Record<string, unknown>;
    // A galaxy cluster is a real source id but not one of the workbench's toggleable
    // galaxy-catalog sources — importParams must reject it against the ladder,
    // not merely check "is this a string".
    preset.sources = [Source.SDSS, Source.GalaxyCluster];

    expect(() => importParams(JSON.stringify(preset))).toThrow(/unknown source id.*galaxy-cluster/i,
    );
  });

  it('rejects a preset whose sources are numbers, asking for a re-export', () => {
    const preset = JSON.parse(exportParams(EXPORT_INPUT)) as Record<string, unknown>;
    preset.sources = [1, 3];

    expect(() => importParams(JSON.stringify(preset))).toThrow(
      'importParams: "sources" holds numeric source codes from before source ids — re-export the preset from the current workbench',
    );
  });

  it('rejects a mixed sources array on its number', () => {
    const preset = JSON.parse(exportParams(EXPORT_INPUT)) as Record<string, unknown>;
    preset.sources = ['sdss', 3];

    expect(() => importParams(JSON.stringify(preset))).toThrow(/unknown source id 3/);
  });

  it('rejects a payload whose grid box has non-cubic voxels', () => {
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'uniform',
      gridBox: GRID_BOX,
      sources: SOURCES,
    });
    const preset = JSON.parse(json) as { gridBox: GridBox };
    // Hand-edit as a human would: stretch one axis without touching dims or
    // voxelSizeMpc — sizeMpc no longer equals dims × voxelSizeMpc on that axis.
    preset.gridBox = { ...preset.gridBox, sizeMpc: [900, 1200, 728] };

    expect(() => importParams(JSON.stringify(preset))).toThrow(/cubic/i);
  });

  it("rejects a payload whose grid box is cubic but not a multiple-of-8 dims — encodeStep.ts's decay dispatch has no bounds tail", () => {
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'uniform',
      gridBox: GRID_BOX,
      sources: SOURCES,
    });
    const preset = JSON.parse(json) as { gridBox: GridBox };
    // Perfectly cubic (voxelSizeMpc 1 on every axis, sizeMpc === dims), positive —
    // passes every OTHER check, and would silently truncate the decay dispatch.
    preset.gridBox = {
      centerMpc: [0, 0, 0],
      sizeMpc: [100, 100, 100],
      dims: [100, 100, 100],
      voxelSizeMpc: 1,
      rotation: [0, 0, 0, 1],
    };

    expect(() => importParams(JSON.stringify(preset))).toThrow(/multiple/i);
  });

  it('rejects a cubic grid box with non-integer dims', () => {
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'uniform',
      gridBox: GRID_BOX,
      sources: SOURCES,
    });
    const preset = JSON.parse(json) as { gridBox: GridBox };
    preset.gridBox = {
      centerMpc: [0, 0, 0],
      sizeMpc: [8.5, 8, 8],
      dims: [8.5, 8, 8],
      voxelSizeMpc: 1,
      rotation: [0, 0, 0, 1],
    };

    expect(() => importParams(JSON.stringify(preset))).toThrow(/multiple/i);
  });

  it('rejects malformed JSON with a readable error, not a crash', () => {
    expect(() => importParams('{not json')).toThrow();
  });

  it('rejects a payload missing a required field', () => {
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'aroundData',
      gridBox: GRID_BOX,
      sources: SOURCES,
    });
    const preset = JSON.parse(json) as Record<string, unknown>;
    delete preset.agentCount;

    expect(() => importParams(JSON.stringify(preset))).toThrow(/agentCount/);
  });

  it('rejects an unrecognized format string', () => {
    const json = exportParams({
      params: PARAMS,
      agentCount: 5_300_000,
      initMode: 'aroundData',
      gridBox: GRID_BOX,
      sources: SOURCES,
    });
    const preset = JSON.parse(json) as Record<string, unknown>;
    preset.format = 'something-else';

    expect(() => importParams(JSON.stringify(preset))).toThrow(/format/i);
  });
});
