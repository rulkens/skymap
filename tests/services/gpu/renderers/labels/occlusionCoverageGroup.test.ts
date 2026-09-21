/**
 * The overlay occlusion joint's two halves, pinned against each other. A
 * mismatch between `OCCLUSION_COVERAGE_LAYOUT_DESC` and the `@group(1)`
 * declarations in `lib/sceneDepth.wesl` is a DEVICE-only pipeline-validation
 * error — headless tests build no pipelines — and `?static` WESL linking
 * injects no values, so nothing else catches it before hardware.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  OCCLUSION_COVERAGE_LAYOUT_DESC,
  OCCLUSION_DEPTH_CAM_POS_OFFSET,
  OCCLUSION_DEPTH_INV_MVP_OFFSET,
  OCCLUSION_DEPTH_UNIFORM_BYTES,
  OCCLUSION_DEPTH_VIEWPORT_OFFSET,
} from '../../../../../src/services/gpu/renderers/labels/occlusionCoverageGroup';

const SCENE_DEPTH_WESL = readFileSync(
  join(process.cwd(), 'src/services/gpu/shaders/lib/sceneDepth.wesl'),
  'utf-8',
);

/** `@group(1) @binding(n) var<...> name: type;` → binding index → declaration. */
function group1Declarations(): Map<number, string> {
  const re = /@group\(1\)\s*@binding\((\d+)\)\s*var(?:<[^>]*>)?\s*\w+\s*:\s*([\w<>]+)\s*;/g;
  const found = new Map<number, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(SCENE_DEPTH_WESL)) !== null) {
    found.set(Number(m[1]!), m[0]!);
  }
  return found;
}

describe('occlusionCoverageGroup', () => {
  it('declares one layout entry per group(1) binding the shader reads, of the matching kind', () => {
    const declarations = group1Declarations();
    const entries = [...OCCLUSION_COVERAGE_LAYOUT_DESC.entries];
    expect(entries.map((e) => e.binding).sort()).toEqual([...declarations.keys()].sort());

    // A `texture_depth_2d` bound as 'unfilterable-float' (or the reverse) is
    // exactly the drift that only a device rejects.
    expect(declarations.get(0)).toContain('texture_2d<f32>');
    expect(entries[0]!.texture?.sampleType).toBe('unfilterable-float');
    expect(declarations.get(1)).toContain('texture_depth_2d');
    expect(entries[1]!.texture?.sampleType).toBe('depth');
    expect(declarations.get(2)).toContain('var<uniform>');
    expect(entries[2]!.buffer?.type).toBe('uniform');
  });

  it('names the binding-2 offsets in the order and at the strides WGSL lays the struct out', () => {
    // Reordering the WESL struct moves every field the TS offsets name, and
    // writes the camera where the shader reads padding — silently.
    const fields = /struct SampledDepthFrame \{([^}]*)\}/.exec(SCENE_DEPTH_WESL)![1]!;
    expect([...fields.matchAll(/(\w+)\s*:/g)].map((m) => m[1])).toEqual([
      'invMvp',
      'camPosKm',
      'viewportPx',
    ]);
    // mat4x4<f32> is 64; vec3<f32> aligns to 16 and ends at 76; vec2<f32>
    // aligns to 8 ⇒ 80; the struct rounds up to its own 16-byte alignment.
    expect(OCCLUSION_DEPTH_INV_MVP_OFFSET).toBe(0);
    expect(OCCLUSION_DEPTH_CAM_POS_OFFSET).toBe(64);
    expect(OCCLUSION_DEPTH_VIEWPORT_OFFSET).toBe(80);
    expect(OCCLUSION_DEPTH_UNIFORM_BYTES).toBe(96);
  });
});
