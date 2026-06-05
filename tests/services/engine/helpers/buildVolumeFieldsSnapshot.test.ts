/**
 * buildVolumeFieldsSnapshot — unit tests for the per-field row builder.
 *
 * The helper maps the renderer's live handle list (identity) onto
 * per-field tunable values from `state.settings.volumes.fields`.
 * These tests verify two axes:
 *
 *   1. Values come from settings, not from the volume store — a stale
 *      or divergent store entry must be silently ignored.
 *   2. Missing settings entries fall back to compile-time defaults from
 *      `volumeFieldDefaults` + the global `DEFAULT_*` constants, so a
 *      field whose settings haven't been written yet still renders a
 *      complete row with sensible values.
 *
 * Fixtures stub only the slices of EngineState that the helper reads:
 * `state.gpu.scalarVolumeRenderer.listHandles()` (identity) and
 * `state.settings.volumes.fields` (values).  Everything else is absent
 * from the stub because the helper doesn't touch it.
 */

import { describe, it, expect } from 'vitest';
import { buildVolumeFieldsSnapshot } from '../../../../src/services/engine/helpers/buildVolumeFieldsSnapshot';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

describe('buildVolumeFieldsSnapshot', () => {
  it('derives field values from state.settings.volumes.fields', () => {
    // The volume store's `params()` returns contrast: 99 — a sentinel
    // value that must NOT appear in the output once values move to settings.
    const state = {
      gpu: {
        scalarVolumeRenderer: {
          listHandles: () => ['mcpm'],
        },
      },
      settings: {
        volumes: {
          fields: {
            mcpm: {
              enabled: true,
              intensity: 0.2,
              contrast: 3,
              densityScale: 1,
              paletteId: 'inferno' as const,
              trim: 0,
              exposure: 1,
            },
          },
        },
      },
      // Volume store present but returning divergent values — proves the
      // helper no longer reads from here for per-field values.
      data: {
        volumes: {
          params: (_id: string) => ({ contrast: 99, intensity: 0.99 }),
        },
      },
    } as unknown as EngineState;

    const rows = buildVolumeFieldsSnapshot(state);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.handle).toBe('mcpm');
    // These come from settings, not the store's sentinel values.
    expect(rows[0]?.contrast).toBe(3);
    expect(rows[0]?.intensity).toBe(0.2);
  });

  it('falls back to compile-time defaults when a field has no settings entry', () => {
    // No entry in `fields` for 'mcpm' — every knob should come from
    // `getVolumeFieldDefaults` or the global DEFAULT_* constants rather
    // than undefined / NaN.
    const state = {
      gpu: {
        scalarVolumeRenderer: {
          listHandles: () => ['mcpm'],
        },
      },
      settings: {
        volumes: {
          fields: {},
        },
      },
      data: {
        volumes: {
          params: () => undefined,
        },
      },
    } as unknown as EngineState;

    const rows = buildVolumeFieldsSnapshot(state);

    expect(rows).toHaveLength(1);
    // Each field must be a defined, finite number (or boolean) — never
    // undefined or NaN.  The specific default values are owned by
    // `volumeFieldDefaults`; this test only asserts they're present.
    expect(typeof rows[0]?.contrast).toBe('number');
    expect(Number.isFinite(rows[0]?.contrast)).toBe(true);
    expect(typeof rows[0]?.intensity).toBe('number');
    expect(typeof rows[0]?.enabled).toBe('boolean');
    expect(typeof rows[0]?.paletteId).toBe('string');
  });

  it('returns an empty array when the renderer has no registered handles', () => {
    const state = {
      gpu: {
        scalarVolumeRenderer: {
          listHandles: () => [],
        },
      },
      settings: {
        volumes: {
          fields: {},
        },
      },
    } as unknown as EngineState;

    expect(buildVolumeFieldsSnapshot(state)).toHaveLength(0);
  });

  it('returns an empty array when scalarVolumeRenderer is absent', () => {
    // Renderer not yet initialised at bootstrap; the helper must not throw.
    const state = {
      gpu: {},
      settings: {
        volumes: {
          fields: {},
        },
      },
    } as unknown as EngineState;

    expect(buildVolumeFieldsSnapshot(state)).toHaveLength(0);
  });
});
