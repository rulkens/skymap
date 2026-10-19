/**
 * `instancedQuadRenderer` packs one `@group(0)` image for both disk pipelines; each io.wesl
 * declares its own `Uniforms`, so both must place the boost where the packer writes it.
 */
import { describe, expect, it } from 'vitest';
import { UNIFORM_BYTES } from '../../../../src/layers/galaxyCatalog/render/instancedQuadRenderer';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const layoutOf = (path: string, name: string): ReturnType<typeof layoutWgslStruct> =>
  layoutWgslStruct(parseWgslStructFields(readShaderSource(path), name), (t) =>
    t === 'CameraUniforms'
      ? layoutOf('src/services/gpu/shaders/lib/camera.wesl', t).layout
      : t === 'BoostUniforms'
        ? layoutOf('src/services/gpu/shaders/lib/boost.wesl', t).layout
        : wgslPrimitiveLayout(t)!,
  );

describe('disk Uniforms ↔ instancedQuadRenderer layout', () => {
  it.each(['proceduralDisks', 'texturedDisks'])(
    '%s/io.wesl puts the boost at float 24 and is UNIFORM_BYTES long',
    (family) => {
      const u = layoutOf(`src/services/gpu/shaders/galaxyCatalog/${family}/io.wesl`, 'Uniforms');
      expect(u.offsets.get('boost')).toBe(24 * 4);
      expect(u.layout.size).toBe(UNIFORM_BYTES);
    },
  );
});
