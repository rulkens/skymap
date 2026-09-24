import { describe, expect, it } from 'vitest';

import { minifyStaticWgslPlugin } from '../../../../tools/utils/wgsl/minifyStaticWgslPlugin';

const SHADER = `// header comment
override WG_X: u32 = 8u;
@group(0) @binding(0) var<storage, read_write> buf: array<f32>;
fn unused() -> f32 { return 1.0; }
@compute @workgroup_size(WG_X)
fn csMain(@builtin(global_invocation_id) id: vec3u) {
    /* block comment */
    buf[id.x] = buf[id.x] - (-1.0);
    for (var i = 4; i > 0; i--) { buf[i]--; }
}`;

// The module shape wesl-plugin's staticBuildExtension emits.
const emitted = (wgsl: string) =>
  `\n    export const wgsl = \`${wgsl}\`;\n    export default wgsl;\n  `;

async function transform(code: string, id: string) {
  const plugin = minifyStaticWgslPlugin();
  const ctx = {
    error: (msg: string) => {
      throw new Error(msg);
    },
  };
  await (plugin.buildStart as () => Promise<void>).call(ctx);
  return (plugin.transform as (c: string, i: string) => string | null).call(ctx, code, id);
}

function wgslOf(module: string): string {
  return JSON.parse(/export const wgsl = (".*");/.exec(module)![1]!);
}

describe('minifyStaticWgslPlugin', () => {
  it('strips comments and whitespace but keeps names, overrides and dead code', async () => {
    const wgsl = wgslOf((await transform(emitted(SHADER), '/s/foo.wesl?static'))!);
    expect(wgsl).not.toMatch(/comment|\n/);
    expect(wgsl).toContain('fn csMain(');
    expect(wgsl).toContain('override WG_X');
    expect(wgsl).toContain('fn unused(');
  });

  it('leaves non-?static modules alone', async () => {
    expect(await transform(emitted(SHADER), '/s/foo.ts')).toBeNull();
  });

  it('fails the build where the minifier would fuse `- -` into a decrement', async () => {
    const fused = SHADER.replace('- (-1.0)', '- -1.0');
    await expect(transform(emitted(fused), '/s/fused.wesl?static')).rejects.toThrow('a - (-b)');
  });

  it('fails the build on WGSL it cannot parse', async () => {
    await expect(transform(emitted('fn broken( {'), '/s/bad.wesl?static')).rejects.toThrow(
      'bad.wesl',
    );
  });
});
