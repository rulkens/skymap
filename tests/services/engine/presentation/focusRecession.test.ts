import { describe, expect, it } from 'vitest';
import {
  FILAMENT_RECESSION,
  LABEL_RECESSION,
  MARKER_RECESSION,
  VOLUME_RECESSION,
  focusRecession,
  recessionTargetFor,
  resolveLayerOpacity,
} from '../../../../src/services/engine/presentation/focusRecession';
import { createFadeRegistry } from '../../../../src/services/animation/fadeRegistry';
import { lerp } from '../../../../src/utils/math/lerp';
import { Source } from '../../../../src/data/sources';
import type { StructureCategory } from '../../../../src/@types/engine/data/StructureCategory';

describe('focusRecession', () => {
  it('returns 1.0 for an untagged handle at blend 0', () => {
    expect(focusRecession({ kind: 'survey', source: Source.SDSS }, 0)).toBe(1);
  });

  it('returns 1.0 for an untagged handle at blend 1', () => {
    // Survey handles have no recession target — they never recede, at any blend.
    expect(focusRecession({ kind: 'survey', source: Source.SDSS }, 1)).toBe(1);
  });

  it('returns 1.0 for a tagged handle at blend 0', () => {
    // Unfocused is full opacity even for a recession-tagged layer.
    expect(focusRecession({ kind: 'filaments' }, 0)).toBe(1);
  });

  it('returns the exact target for a tagged handle at blend 1', () => {
    expect(focusRecession({ kind: 'filaments' }, 1)).toBe(FILAMENT_RECESSION);
  });

  it('lerps a tagged handle at intermediate blend', () => {
    expect(focusRecession({ kind: 'filaments' }, 0.5)).toBe(lerp(1, FILAMENT_RECESSION, 0.5));
  });
});

describe('recessionTargetFor', () => {
  it('tags markerLayer for every category', () => {
    const categories: StructureCategory[] = ['cluster', 'supercluster', 'void', 'group'];
    for (const category of categories) {
      expect(recessionTargetFor({ kind: 'markerLayer', category })).toBe(MARKER_RECESSION);
    }
  });

  it('tags filaments and volumesMaster — the diffuse fields the HDR encoders recede', () => {
    // The two ambient subsystems routed through the HDR encoders / filament
    // pass at the call site. Both recede to the same diffuse-field target.
    expect(recessionTargetFor({ kind: 'filaments' })).toBe(FILAMENT_RECESSION);
    expect(recessionTargetFor({ kind: 'volumesMaster' })).toBe(VOLUME_RECESSION);
  });

  it('tags structure and galaxyNames labels but not youAreHere or scaleBar', () => {
    expect(recessionTargetFor({ kind: 'labelLayer', layer: 'structure' })).toBe(LABEL_RECESSION);
    expect(recessionTargetFor({ kind: 'labelLayer', layer: 'galaxyNames' })).toBe(LABEL_RECESSION);
    expect(recessionTargetFor({ kind: 'labelLayer', layer: 'youAreHere' })).toBeUndefined();
    expect(recessionTargetFor({ kind: 'labelLayer', layer: 'scaleBar' })).toBeUndefined();
  });
});

describe('resolveLayerOpacity', () => {
  it('multiplies opacityOf by focusRecession', () => {
    const fades = createFadeRegistry();
    const handle = { kind: 'filaments' } as const;
    // Register at 0 then snap to a known toggle opacity at now=0. fadeTo with
    // duration 0 lands the controller exactly on the target immediately.
    fades.register(handle, 0);
    fades.fadeTo(handle, 0.5, 0, 0);

    // toggle 0.5 × recession (full focus → FILAMENT_RECESSION).
    expect(resolveLayerOpacity(fades, handle, 1, 0)).toBe(0.5 * FILAMENT_RECESSION);
  });

  it('returns 0 when the toggle is 0 regardless of blend', () => {
    const fades = createFadeRegistry();
    const handle = { kind: 'filaments' } as const;
    fades.register(handle, 0); // toggle opacity 0

    // 0 × anything = 0, at any blend.
    expect(resolveLayerOpacity(fades, handle, 0, 0)).toBe(0);
    expect(resolveLayerOpacity(fades, handle, 1, 0)).toBe(0);
  });
});
