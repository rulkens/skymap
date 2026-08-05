/**
 * Preset wire-format round-trip — spec: `.superpowers/sdd/p03-task-6-brief.md`.
 * The wire envelope mirrors the spike's `downloadJSON`/`onUploadFile`
 * (`Galaxy Renderer.dc.html:640-661`): `{ type, version, p, r }`, where `r`
 * is a flat merge of render + LOD knobs. `serializeGalaxyPreset` does the
 * fold; `parseGalaxyPreset` does the split, and is total over malformed input.
 *
 * v2 adds `f` (fieldTuning) and `x` (extras' enabled/count); v3 nests `f` by
 * UI section instead of v2's flat keys — see `migrateGalaxyFieldTuningWire`
 * for the lift and both preset files' headers for the v1 fallback.
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

  it('migrates a v2 flat fieldTuning payload to the v3 nested shape', () => {
    const v2Wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 2,
      p: DEFAULT_GALAXY_PARAMS,
      f: {
        discEnabled: false,
        armCloudShare: 0.42,
        hiiCavityScale: 0.7,
        sfMap: DEFAULT_GALAXY_FIELD_TUNING.sfMap,
      },
    });

    const parsed = parseGalaxyPreset(v2Wire);

    expect(parsed?.f?.disc?.enabled).toBe(false);
    expect(parsed?.f?.arms?.cloud?.share).toBe(0.42);
    expect(parsed?.f?.hii?.cavityScale).toBe(0.7);
    expect(parsed?.f?.sfMap).toEqual(DEFAULT_GALAXY_FIELD_TUNING.sfMap);
  });

  // The three-state generator dropdown retired two booleans it used to take
  // separate presets through: `sfMap.enabled` and `dust.sfMapSeeding`. Old
  // files on disk still carry both — `migrateGalaxyFieldTuningWire` folds the
  // first into `generator` and drops the second outright (see its header).
  it('migrates a disabled sfMap section to generator "none", dropping `enabled`', () => {
    const wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 3,
      p: DEFAULT_GALAXY_PARAMS,
      f: { sfMap: { enabled: false, generator: 'automaton' } },
    });

    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.sfMap).toEqual({ generator: 'none' });
  });

  it("keeps an enabled preset's own generator, dropping the now-redundant `enabled`", () => {
    const wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 3,
      p: DEFAULT_GALAXY_PARAMS,
      f: { sfMap: { enabled: true, generator: 'automaton' } },
    });

    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.sfMap).toEqual({ generator: 'automaton' });
  });

  it('defaults the generator when an old section named only `enabled`', () => {
    const wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 3,
      p: DEFAULT_GALAXY_PARAMS,
      f: { sfMap: { enabled: true } },
    });

    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.sfMap).toEqual(DEFAULT_GALAXY_FIELD_TUNING.sfMap);
  });

  it('drops the retired `dust.sfMapSeeding`, keeping the rest of the section', () => {
    const wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 3,
      p: DEFAULT_GALAXY_PARAMS,
      f: { dust: { enabled: false, sfMapSeeding: true } },
    });

    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.dust).toEqual({ enabled: false });
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
    expect(raw.version).toBe(3);
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
