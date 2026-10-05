/**
 * Parity guard: `shell/fragment.wesl`'s `ShellDepthFrame` is the offset
 * authority for the record `atmosphereShellRenderer` packs by hand into one
 * ArrayBuffer. A drift — a field added, an alignment misread — lands the camera
 * where the shader reads the viewport, and every ray is then classified against
 * garbage: invisible to both compilers, visible only as a wrong-looking limb.
 */
import { describe, expect, it } from 'vitest';

import {
  SHELL_DEPTH_CAM_POS_OFFSET,
  SHELL_DEPTH_INV_MVP_OFFSET,
  SHELL_DEPTH_KM_TO_LOCAL_OFFSET,
  SHELL_DEPTH_UNIFORM_BYTES,
  SHELL_DEPTH_VIEWPORT_OFFSET,
} from '../../../../src/services/gpu/renderers/atmosphere/atmosphereShellRenderer';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const struct = layoutWgslStruct(
  parseWgslStructFields(
    readShaderSource('src/services/gpu/shaders/atmosphere/shell/fragment.wesl'),
    'ShellDepthFrame',
  ),
  (type) => {
    const primitive = wgslPrimitiveLayout(type);
    if (!primitive) throw new Error(`ShellDepthFrame field type ${type} has no layout entry`);
    return primitive;
  },
);

describe('shell/fragment.wesl ShellDepthFrame ↔ atmosphereShellRenderer offsets', () => {
  it('the struct lays out where the TS offsets say it does', () => {
    // The field set first: a dropped or renamed field would otherwise compare
    // an undefined offset against an undefined constant and pass.
    expect([...struct.offsets.keys()]).toEqual(['invMvp', 'camPosKm', 'viewportPx', 'kmToLocal']);
    expect(struct.offsets.get('invMvp')).toBe(SHELL_DEPTH_INV_MVP_OFFSET);
    expect(struct.offsets.get('camPosKm')).toBe(SHELL_DEPTH_CAM_POS_OFFSET);
    expect(struct.offsets.get('viewportPx')).toBe(SHELL_DEPTH_VIEWPORT_OFFSET);
    expect(struct.offsets.get('kmToLocal')).toBe(SHELL_DEPTH_KM_TO_LOCAL_OFFSET);
    expect(struct.layout.size).toBe(SHELL_DEPTH_UNIFORM_BYTES);
  });
});
