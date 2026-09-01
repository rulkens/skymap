import { test, expect } from 'vitest';
import {
  OCCLUSION_COVERAGE_GROUP_INDEX,
  OCCLUSION_COVERAGE_LAYOUT_DESC,
} from '../../../../../src/services/gpu/renderers/labels/occlusionCoverageGroup';

// This guards the TS-descriptor <-> WESL '@group(1) @binding(0)' agreement in
// sceneDepth.wesl. A drift between the two halves is otherwise a device-only
// pipeline-validation error, which a headless suite never reaches — the cheap
// CPU check catches the layout drift here. GPUShaderStage is supplied by
// tests/setup/webgpuGlobals.ts, so the descriptor is inspectable without a device.
test('the occlusion coverage layout is a single fragment-visible unfilterable-float texture at group(1)/binding0', () => {
  expect(OCCLUSION_COVERAGE_GROUP_INDEX).toBe(1);
  expect(OCCLUSION_COVERAGE_LAYOUT_DESC.entries).toHaveLength(1);
  const entry = (OCCLUSION_COVERAGE_LAYOUT_DESC.entries as GPUBindGroupLayoutEntry[])[0]!;
  expect(entry.binding).toBe(0);
  expect(entry.visibility).toBe(GPUShaderStage.FRAGMENT);
  expect(entry.texture?.sampleType).toBe('unfilterable-float');
});
