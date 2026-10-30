/**
 * galaxyAggregatesPass — draws only the octree blobs, with the pool-row halo and the
 * handed fade the sprites pass gives the leaves, against a stub runtime (no GPU).
 */

import { describe, it, expect, vi } from 'vitest';

import { Source } from '../../../../src/data/source';
import { packSelection } from '../../../../src/data/selectionEncoding';
import { galaxyAggregatesPass } from '../../../../src/layers/galaxyCatalog/passes/galaxyAggregatesPass';
import { makeGalaxyCatalogFade } from '../../../fixtures/makeGalaxyCatalogFade';
import { idleGalaxyOctree } from '../../../fixtures/idleGalaxyOctree';
import type { GalaxyCatalogRuntime } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';
import type { GalaxyPointDrawSettings } from '../../../../src/@types/rendering/GalaxyPointDrawSettings';

describe('galaxyAggregatesPass.draw', () => {
  it('draws the pooled aggregate stream with the pool-row halo and each source’s handed fade', () => {
    const draw = vi.fn();
    const idle = idleGalaxyOctree();
    const runtime = {
      ...idle,
      pooledPointRenderer: {
        ...idle.pooledPointRenderer,
        draw,
        poolRecordIndex: (source: number, ordinal: number) =>
          source === Source.Glade && ordinal === 7 ? 1234 : null,
      },
    } as unknown as GalaxyCatalogRuntime;
    const view = { vp: new Float32Array(16), viewportPx: [800, 600], camPos: [0, 0, 1] };
    const ctx = { viewSlot: 0, drawPxPerRad: 500, viewKind: 'capture' };
    const settings = { sizePx: 2, provenance: {} };
    const state = {
      selection: { select: { type: 'galaxyCatalog', source: Source.Glade, index: 7 } },
      settings: { galaxyCatalogs: settings, bias: { mode: 0, absMagLimit: -19 } },
      gpu: { focusUniform: { bindGroup: {} } },
    };

    galaxyAggregatesPass(runtime).draw(
      {} as GPURenderPassEncoder,
      view as unknown as SlabView,
      ctx as unknown as FrameView,
      state as unknown as PassState,
      makeGalaxyCatalogFade({ glade: 0.5 }),
    );

    expect(draw).toHaveBeenCalledTimes(1);
    const [, vp, viewportPx, drawSettings, capture, stream, blob] = draw.mock.calls[0]!;
    expect([vp, viewportPx]).toEqual([view.vp, view.viewportPx]);
    expect(stream).toBe('aggregate');
    expect(capture).toBe(true);
    expect(blob).toBe(settings);
    const s = drawSettings as GalaxyPointDrawSettings;
    expect(s.selectedPacked).toBe(packSelection(Source.Glade, 1234));
    expect(s.fadeOpacityOf(Source.Glade)).toBe(0.5);
  });
});
