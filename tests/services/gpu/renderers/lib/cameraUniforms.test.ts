/**
 * cameraUniforms — byte-layout guard for the shared 80-byte CameraUniforms
 * prefix writer.
 *
 * Every camera-consuming renderer uploads this prefix; a drifted
 * `viewportPx` offset is the iOS-silent-frame-drop class of bug (the WGSL
 * struct in `shaders/lib/camera.wesl` would read garbage viewport, and on
 * WebKit the whole frame silently fails to present). One focused test
 * pins the float indices; no GPU device needed — the writer is a pure
 * Float32Array packer.
 */

import { describe, it, expect } from 'vitest';
import { writeCameraPrefix } from '../../../../../src/services/gpu/renderers/lib/cameraUniforms';

describe('writeCameraPrefix', () => {
  it('writes viewProj to floats 0..15 and viewportPx to floats 16/17', () => {
    // 16 distinct values so any transposition or offset shift is caught.
    const viewProj = new Float32Array(16);
    for (let i = 0; i < 16; i++) viewProj[i] = i + 1; // 1..16, all distinct

    const target = new Float32Array(20);
    writeCameraPrefix(target, viewProj, [800, 600]);

    for (let i = 0; i < 16; i++) {
      expect(target[i]).toBe(viewProj[i]);
    }
    expect(target[16]).toBe(800);
    expect(target[17]).toBe(600);
    // Pads untouched on a zero-init target — the writer must not stray
    // past float 17.
    expect(target[18]).toBe(0);
    expect(target[19]).toBe(0);
  });
});
