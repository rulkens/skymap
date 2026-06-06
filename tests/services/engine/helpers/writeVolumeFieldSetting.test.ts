/**
 * writeVolumeFieldSetting — unit tests for the copy-on-write field patch helper.
 *
 * The helper is the single write-path for per-field settings entries: it
 * returns a new fields map with exactly one row replaced (never mutates the
 * input), or null when the id is unregistered.  Tests cover:
 *
 *   1. A single-knob patch preserves all other knobs on the same row.
 *   2. The returned object and the patched row are both new references
 *      (copy-on-write invariant), and the original is unchanged.
 *   3. An unregistered id returns null without throwing or mutating.
 *   4. Pre-clamped values land verbatim — demonstrating that the caller
 *      applies clamp helpers before calling writeVolumeFieldSetting.
 */

import { describe, it, expect } from 'vitest';
import { writeVolumeFieldSetting } from '../../../../src/services/engine/helpers/writeVolumeFieldSetting';
import { clampVolumeContrast } from '../../../../src/utils/clampVolumeContrast';
import type { VolumeFieldId } from '../../../../src/@types/data/VolumeFieldId';
import type { VolumeFieldSettings } from '../../../../src/@types/settings/VolumeFieldSettings';

// A complete VolumeFieldSettings literal used as a stable baseline fixture
// across all tests.  'inferno' is a valid ScalarFieldPaletteId.
const BASE_SETTINGS: VolumeFieldSettings = {
  enabled: true,
  intensity: 0.5,
  contrast: 1,
  densityScale: 1,
  paletteId: 'inferno' as const,
  trim: 0,
  exposure: 1,
};

const BASE_FIELDS: Partial<Record<VolumeFieldId, VolumeFieldSettings>> = {
  mcpm: { ...BASE_SETTINGS },
};

describe('writeVolumeFieldSetting', () => {
  it('patches one knob and leaves the rest intact', () => {
    const result = writeVolumeFieldSetting(BASE_FIELDS, 'mcpm', { contrast: 4 });

    expect(result).not.toBeNull();
    const row = result!['mcpm']!;
    expect(row.contrast).toBe(4);
    // All other knobs are unchanged from BASE_SETTINGS.
    expect(row.enabled).toBe(BASE_SETTINGS.enabled);
    expect(row.intensity).toBe(BASE_SETTINGS.intensity);
    expect(row.densityScale).toBe(BASE_SETTINGS.densityScale);
    expect(row.paletteId).toBe(BASE_SETTINGS.paletteId);
    expect(row.trim).toBe(BASE_SETTINGS.trim);
    expect(row.exposure).toBe(BASE_SETTINGS.exposure);
  });

  it('returns a new fields object and does not mutate the input', () => {
    const result = writeVolumeFieldSetting(BASE_FIELDS, 'mcpm', { contrast: 4 });

    expect(result).not.toBeNull();
    // Top-level fields map is a new reference.
    expect(result).not.toBe(BASE_FIELDS);
    // The patched row object is a new reference.
    expect(result!['mcpm']).not.toBe(BASE_FIELDS['mcpm']);
    // The original row's contrast is unchanged (no mutation).
    expect(BASE_FIELDS['mcpm']!.contrast).toBe(BASE_SETTINGS.contrast);
  });

  it('returns null for an unregistered id', () => {
    // An empty fields map has no entry for 'mcpm' — must return null, not throw.
    const result = writeVolumeFieldSetting({}, 'mcpm', { contrast: 4 });

    expect(result).toBeNull();
  });

  it('carries a clamped value when the caller clamps first', () => {
    // The engine setters clamp before calling writeVolumeFieldSetting.
    // Verify the clamped value lands verbatim in the returned row.
    // clampVolumeContrast(99) === 16 (ceiling is 16).
    const clamped = clampVolumeContrast(99);
    expect(clamped).toBe(16);

    const result = writeVolumeFieldSetting(BASE_FIELDS, 'mcpm', { contrast: clamped });

    expect(result).not.toBeNull();
    expect(result!['mcpm']!.contrast).toBe(16);
  });
});
