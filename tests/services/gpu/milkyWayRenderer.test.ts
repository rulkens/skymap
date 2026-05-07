import { describe, it, expect } from 'vitest';
import { MilkyWayRenderer } from '../../../src/services/gpu/milkyWayRenderer';

describe('MilkyWayRenderer', () => {
  it('exports the class as a constructor', () => {
    // Instantiation requires a real GPUDevice; vitest's jsdom env has
    // none, so we only verify the export shape and prototype methods
    // — same approach as proceduralDiskRenderer.test.ts.  Visual
    // correctness is verified manually in Task 11.
    expect(typeof MilkyWayRenderer).toBe('function');
    expect(MilkyWayRenderer.prototype.draw).toBeTypeOf('function');
    expect(MilkyWayRenderer.prototype.destroy).toBeTypeOf('function');
  });

  it('exposes the documented uniform buffer size constant', () => {
    // The renderer uploads exactly UNIFORM_BUFFER_SIZE bytes per frame.
    // Pinning this in a test ensures the WESL `Uniforms` struct and
    // the JS-side `ArrayBuffer(UNIFORM_BUFFER_SIZE)` allocation can
    // never silently drift.
    //
    // Layout: CameraUniforms prefix (80 B) + cameraPosWorld vec3 (12 B)
    // + fadeAlpha f32 (4 B) + iTime f32 (4 B) + 12 B tail pad = 112 B.
    // Was 96 B before adopting `cam: CameraUniforms` from
    // `lib/camera.wesl` — see `milkyWayRenderer.ts` doc-block for why
    // the field order changed.
    expect(MilkyWayRenderer.UNIFORM_BUFFER_SIZE).toBe(112);
  });
});
