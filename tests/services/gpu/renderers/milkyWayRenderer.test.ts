import { describe, it, expect } from 'vitest';
import {
  createMilkyWayRenderer,
  MILKY_WAY_UNIFORM_BUFFER_SIZE,
} from '../../../../src/services/gpu/renderers/milkyWayRenderer';

describe('milkyWayRenderer', () => {
  it('exports the factory as a function', () => {
    // Instantiation requires a real GPUDevice; vitest's jsdom env has
    // none, so we only verify the export shape — same approach as
    // proceduralDiskRenderer.test.ts.  Visual correctness is verified
    // manually in Task 11.
    //
    // Post-Spec-F.1 the renderer is a closure-returning factory rather
    // than a class, so we no longer assert on a `prototype.draw` /
    // `prototype.destroy` shape — the public surface is captured by
    // the `MilkyWayRenderer` type alias and verified at compile time.
    expect(typeof createMilkyWayRenderer).toBe('function');
  });

  it('exposes the documented uniform buffer size constant', () => {
    // The renderer uploads exactly MILKY_WAY_UNIFORM_BUFFER_SIZE bytes
    // per frame.  Pinning this in a test ensures the WESL `Uniforms`
    // struct and the JS-side `ArrayBuffer(...)` allocation can never
    // silently drift.
    //
    // Layout: CameraUniforms prefix (80 B) + cameraPosWorld vec3 (12 B)
    // + fadeAlpha f32 (4 B) + iTime f32 (4 B) + 12 B tail pad = 112 B.
    // Was 96 B before adopting `cam: CameraUniforms` from
    // `lib/camera.wesl` — see `milkyWayRenderer.ts` doc-block for why
    // the field order changed.
    //
    // Pre-Spec-F.1 this was `MilkyWayRenderer.UNIFORM_BUFFER_SIZE` (a
    // class static).  The factory conversion lifted it to a
    // module-level export; the test imports it the same way every
    // other module-level constant is imported.
    expect(MILKY_WAY_UNIFORM_BUFFER_SIZE).toBe(112);
  });
});
