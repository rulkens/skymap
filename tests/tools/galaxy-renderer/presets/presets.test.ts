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

  it('preserves fieldTuning.ismMapAutomaton — a nested sub-object, not just top-level scalars', () => {
    const tunedAutomaton = {
      ...DEFAULT_GALAXY_FIELD_TUNING.ismMapAutomaton,
      steps: 123,
      armForcing: 0.42,
    };
    const tuning = { ...DEFAULT_GALAXY_FIELD_TUNING, ismMapAutomaton: tunedAutomaton };
    const wire = serializeGalaxyPreset(
      DEFAULT_GALAXY_PARAMS,
      DEFAULT_RENDER_SETTINGS,
      DEFAULT_LOD_SETTINGS,
      tuning,
      DEFAULT_EXTRAS_STATE,
    );
    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.ismMapAutomaton).toEqual(tunedAutomaton);
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
        sfMap: DEFAULT_GALAXY_FIELD_TUNING.ismMap,
      },
    });

    const parsed = parseGalaxyPreset(v2Wire);

    expect(parsed?.f?.disc?.enabled).toBe(false);
    expect(parsed?.f?.arms?.cloud?.share).toBe(0.42);
    expect(parsed?.f?.hii?.cavityScale).toBe(0.7);
    expect(parsed?.f?.ismMap).toEqual(DEFAULT_GALAXY_FIELD_TUNING.ismMap);
  });

  // The three-state generator dropdown retired two booleans it used to take
  // separate presets through: `sfMap.enabled` and `dust.sfMapSeeding`. Old
  // files on disk still carry both — under their pre-ISM-rename spellings,
  // which is why every legacy fixture below feeds `sfMap*` keys and expects
  // `ismMap*` out — `migrateGalaxyFieldTuningWire` folds the first into
  // `generator` and drops the second outright (see its header).
  it('migrates a disabled legacy sfMap section to ismMap generator "none", dropping `enabled`', () => {
    const wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 3,
      p: DEFAULT_GALAXY_PARAMS,
      f: { sfMap: { enabled: false, generator: 'automaton' } },
    });

    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.ismMap).toEqual({ generator: 'none' });
  });

  it("keeps an enabled preset's own generator, dropping the now-redundant `enabled`", () => {
    const wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 3,
      p: DEFAULT_GALAXY_PARAMS,
      f: { sfMap: { enabled: true, generator: 'automaton' } },
    });

    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.ismMap).toEqual({ generator: 'automaton' });
  });

  it('defaults the generator when an old section named only `enabled`', () => {
    const wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 3,
      p: DEFAULT_GALAXY_PARAMS,
      f: { sfMap: { enabled: true } },
    });

    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.ismMap).toEqual(DEFAULT_GALAXY_FIELD_TUNING.ismMap);
  });

  // The reducer that applies an uploaded fieldTuning patch does a SHALLOW
  // Object.assign per section, so a hole here would upload as `undefined`
  // and end up NaN in the fluid sim's UBO (packIsmMapFluidConstants writes
  // every field straight into a Float32Array slot) — see
  // `migrateGalaxyFieldTuningWire`'s defaults-fill pass.
  it('fills a hole left by a field added after the preset was saved, and drops the retired key it replaced', () => {
    const wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 3,
      p: DEFAULT_GALAXY_PARAMS,
      f: {
        sfMapFluid: {
          ...DEFAULT_GALAXY_FIELD_TUNING.ismMapFluid,
          diffusion: undefined,
          pressureStrength: 0.4,
        },
      },
    });

    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.ismMapFluid).toEqual({
      ...DEFAULT_GALAXY_FIELD_TUNING.ismMapFluid,
      diffusion: DEFAULT_GALAXY_FIELD_TUNING.ismMapFluid.diffusion,
    });
    expect(parsed?.f?.ismMapFluid).not.toHaveProperty('pressureStrength');
  });

  // Proves the per-key migrator has to run BEFORE the generic defaults-fill:
  // `enabled` isn't a field of `GalaxyIsmMapParams` any more, so a fill-first
  // ordering would drop it as an unknown key and lose the "force generator to
  // 'none'" signal it carries, defaulting to 'fluid' instead.
  it("runs ismMap's own migrator before the defaults-fill, so a bare `enabled: false` still forces generator 'none'", () => {
    const wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 3,
      p: DEFAULT_GALAXY_PARAMS,
      f: { sfMap: { enabled: false } },
    });

    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.ismMap).toEqual({ generator: 'none' });
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

  it("lifts a legacy `hii.sfMapSeeding` onto `ismMapSeeding` so the field's value survives the rename", () => {
    const wire = JSON.stringify({
      type: 'galaxy-preset',
      version: 3,
      p: DEFAULT_GALAXY_PARAMS,
      f: {
        hii: { ...DEFAULT_GALAXY_FIELD_TUNING.hii, ismMapSeeding: undefined, sfMapSeeding: 0.85 },
      },
    });

    const parsed = parseGalaxyPreset(wire);

    expect(parsed?.f?.hii?.ismMapSeeding).toBe(0.85);
    expect(parsed?.f?.hii).not.toHaveProperty('sfMapSeeding');
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
