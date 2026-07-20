import { test, expect } from 'vitest';
import {
  OCCLUSION_DEPTH_GROUP_INDEX,
  OCCLUSION_DEPTH_LAYOUT_DESC,
} from '../../../../../src/services/gpu/renderers/labels/occlusionDepthGroup';

// This guards the TS-descriptor <-> WESL '@group(1) @binding(0)' agreement in
// sceneDepth.wesl. A drift between the two halves is otherwise a device-only
// pipeline-validation error, which a headless suite never reaches — the cheap
// CPU check catches the layout drift here. GPUShaderStage is supplied by
// tests/setup/webgpuGlobals.ts, so the descriptor is inspectable without a device.
test('the occlusion depth layout is a single fragment-visible depth texture at group(1)/binding0', () => {
  expect(OCCLUSION_DEPTH_GROUP_INDEX).toBe(1);
  expect(OCCLUSION_DEPTH_LAYOUT_DESC.entries).toHaveLength(1);
  const entry = (OCCLUSION_DEPTH_LAYOUT_DESC.entries as GPUBindGroupLayoutEntry[])[0]!;
  expect(entry.binding).toBe(0);
  expect(entry.visibility).toBe(GPUShaderStage.FRAGMENT);
  expect(entry.texture?.sampleType).toBe('depth');
});
