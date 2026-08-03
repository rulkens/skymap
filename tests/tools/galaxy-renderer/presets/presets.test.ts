/**
 * Preset wire-format round-trip — spec: `.superpowers/sdd/p03-task-6-brief.md`.
 * The wire envelope mirrors the spike's `downloadJSON`/`onUploadFile`
 * (`Galaxy Renderer.dc.html:640-661`): `{ type, version, p, r }`, where `r`
 * is a flat merge of render + LOD knobs. `serializeGalaxyPreset` does the
 * fold; `parseGalaxyPreset` does the split, and is total over malformed input.
 *
 * v2 adds `f` (fieldTuning) and `x` (extras' enabled/count) — see both
 * files' headers for why a v1 payload (neither key present) still parses
 * cleanly instead of needing a version branch.
 */
import { describe, expect, it } from 'vitest';
import { serializeGalaxyPreset } from '../../../../tools/galaxy-renderer/src/presets/serializeGalaxyPreset';
import { parseGalaxyPreset } from '../../../../tools/galaxy-renderer/src/presets/parseGalaxyPreset';
import { DEFAULT_GALAXY_PARAMS } from '../../../../tools/galaxy-renderer/src/data/defaultGalaxyParams';
import { DEFAULT_RENDER_SETTINGS } from '../../../../tools/galaxy-renderer/src/data/defaultRenderSettings';
import { DEFAULT_LOD_SETTINGS } from '../../../../tools/galaxy-renderer/src/data/defaultLodSettings';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../../../src/services/engine/galaxyGenerator/v2/galaxyFieldMixture';
import { DEFAULT_EXTRAS_STATE } from '../../../../tools/galaxy-renderer/src/data/defaultExtrasState';

describe('serializeGalaxyPreset / parseGalaxyPreset', () => {
  it('round-trips galaxy, render, lod and fieldTuning through the wire format', () => {
    const wire = serializeGalaxyPreset(
      DEFAULT_GALAXY_PARAMS,
      DEFAULT_RENDER_SETTINGS,
      DEFAULT_LOD_SETTINGS,
      DEFAULT_GALAXY_FIELD_TUNING,
      DEFAULT_EXTRAS_STATE,
    );
    const parsed = parseGalaxyPreset(wire);

    expect(parsed).not.toBeNull();
    expect(parsed?.p).toEqual(DEFAULT_GALAXY_PARAMS);
    expect(parsed?.r).toEqual(DEFAULT_RENDER_SETTINGS);
    expect(parsed?.lod).toEqual(DEFAULT_LOD_SETTINGS);
    expect(parsed?.f).toEqual(DEFAULT_GALAXY_FIELD_TUNING);
    expect(parsed?.x).toEqual({
      enabled: DEFAULT_EXTRAS_STATE.enabled,
      count: DEFAULT_EXTRAS_STATE.count,
    });
  });

  it('preserves fieldTuning.sfMap — the nested automaton sub-object, not just top-level scalars', () => {
    const tunedSfMap = {
      ...DEFAULT_GALAXY_FIELD_TUNING.sfMap,
      steps: 123,
      armForcing: 0.42,
    };
    const tuning = { ...DEFAULT_GALAXY_FIELD_TUNING, sfMap: tunedSfMap };
    const wire = serializeGalaxyPreset(
      DEFAULT_GALAXY_PARAMS,
      DEFAULT_RENDER_SETTINGS,
      DEFAULT_LOD_SETTINGS,
      tuning,
      DEFAULT_EXTRAS_STATE,
    );
    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.sfMap).toEqual(tunedSfMap);
  });

  it('matches the v2 envelope shape, with LOD knobs flattened into r', () => {
    const wire = serializeGalaxyPreset(
      DEFAULT_GALAXY_PARAMS,
      DEFAULT_RENDER_SETTINGS,
      DEFAULT_LOD_SETTINGS,
      DEFAULT_GALAXY_FIELD_TUNING,
      DEFAULT_EXTRAS_STATE,
    );
    const raw = JSON.parse(wire);

    expect(raw.type).toBe('galaxy-preset');
    expect(raw.version).toBe(2);
    expect(raw.p).toEqual(DEFAULT_GALAXY_PARAMS);
    expect(raw.r).toMatchObject({
      exposure: DEFAULT_RENDER_SETTINGS.exposure,
      aggregateDivisor: DEFAULT_RENDER_SETTINGS.aggregateDivisor,
      lodApparent: DEFAULT_LOD_SETTINGS.lodApparent,
    });
    expect(raw.f).toEqual(DEFAULT_GALAXY_FIELD_TUNING);
    expect(raw.x).toEqual({
      enabled: DEFAULT_EXTRAS_STATE.enabled,
      count: DEFAULT_EXTRAS_STATE.count,
    });
    // regenNonce is a re-roll trigger, not part of the "look" — see
    // serializeGalaxyPreset's header for why it's deliberately dropped.
    expect(raw.x.regenNonce).toBeUndefined();
  });

  it('rejects invalid JSON with null', () => {
    expect(parseGalaxyPreset('{not json')).toBeNull();
  });

  it('rejects a payload without p', () => {
    expect(
      parseGalaxyPreset(JSON.stringify({ type: 'galaxy-preset', version: 1, r: {} })),
    ).toBeNull();
  });

  it('tolerates a missing r', () => {
    const parsed = parseGalaxyPreset(
      JSON.stringify({ type: 'galaxy-preset', version: 1, p: { type: 'Sc' } }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.p).toEqual({ type: 'Sc' });
    expect(parsed?.r).toEqual({});
    expect(parsed?.lod).toEqual({});
  });

  it('parses a v1 preset (no fieldTuning/extras on the wire) without throwing', () => {
    // A real pre-v2 file: only type/version/p/r, exactly what
    // serializeGalaxyPreset emitted before this change.
    const v1Wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 1,
      p: DEFAULT_GALAXY_PARAMS,
      r: { ...DEFAULT_RENDER_SETTINGS, ...DEFAULT_LOD_SETTINGS },
    });

    const parsed = parseGalaxyPreset(v1Wire);

    expect(parsed).not.toBeNull();
    expect(parsed?.p).toEqual(DEFAULT_GALAXY_PARAMS);
    // Absent sections resolve to {} — an empty patch — which is what makes
    // loading a v1 preset leave current fieldTuning/extras alone instead of
    // resetting them to defaults.
    expect(parsed?.f).toEqual({});
    expect(parsed?.x).toEqual({});
  });

  it('ignores a malformed fieldTuning section instead of propagating it', () => {
    const parsed = parseGalaxyPreset(
      JSON.stringify({
        type: 'galaxy-preset',
        version: 2,
        p: { type: 'Sc' },
        f: 'not an object',
        x: null,
      }),
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.f).toEqual({});
    expect(parsed?.x).toEqual({});
  });
});
