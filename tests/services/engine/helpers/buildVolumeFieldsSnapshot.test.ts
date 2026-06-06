/**
 * buildVolumeFieldsSnapshot — unit tests for the per-field row builder.
 *
 * Both identity (which fields appear) and values come from
 * `state.settings.volumes.fields`.  The renderer's handle list is not
 * consulted, so a field whose cube hasn't loaded yet still gets a row
 * as long as its settings entry is present.
 *
 * These tests verify two axes:
 *
 *   1. Identity derives from settings keys, not the GPU handle list.
 *   2. Values come from settings, not from the volume store.
 *
 * Fixtures stub only the slices of EngineState that the helper reads:
 * `state.settings.volumes.fields`.  The renderer stub is present on some
 * fixtures to confirm it is NOT consulted for identity.
 */

import { describe, it, expect } from 'vitest';
import { buildVolumeFieldsSnapshot } from '../../../../src/services/engine/helpers/buildVolumeFieldsSnapshot';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

describe('buildVolumeFieldsSnapshot', () => {
  it('snapshot identity derives from settings keys, not renderer handles', () => {
    // settings.volumes.fields has both 'mcpm' and 'cf4-density', but the
    // renderer only knows about 'mcpm' (its cube is loaded).  The snapshot
    // must include both — the panel shows CF-4's row before its cube arrives.
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
              intensity: 0.5,
              contrast: 2,
              densityScale: 1,
              paletteId: 'inferno' as const,
              trim: 0,
              exposure: 1,
            },
            'cf4-density': {
              enabled: false,
              intensity: 0.3,
              contrast: 1.5,
              densityScale: 0.8,
              paletteId: 'inferno' as const,
              trim: 0,
              exposure: 1,
            },
          },
        },
      },
    } as unknown as EngineState;

    const rows = buildVolumeFieldsSnapshot(state);

    // Two rows from settings even though the renderer only lists one handle.
    expect(rows).toHaveLength(2);
    const handles = rows.map((r) => r.handle);
    expect(handles).toContain('mcpm');
    expect(handles).toContain('cf4-density');
  });

  it('derives field values from state.settings.volumes.fields', () => {
    // The volume store's `params()` returns contrast: 99 — a sentinel
    // value that must NOT appear in the output (values come from settings).
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

  it('returns an empty array when settings.volumes.fields is empty', () => {
    // No fields registered in settings — nothing to show in the panel,
    // regardless of what the renderer might know about.
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
    } as unknown as EngineState;

    expect(buildVolumeFieldsSnapshot(state)).toHaveLength(0);
  });
});
