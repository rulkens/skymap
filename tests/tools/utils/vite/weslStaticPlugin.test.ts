import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import { weslStaticPlugin } from '../../../../tools/utils/vite/weslStaticPlugin';

/** A project whose root sits below its toml, like the tools' cross-root setups. */
function fixture(libBody: string) {
  const dir = mkdtempSync(join(tmpdir(), 'wesl-static-'));
  mkdirSync(join(dir, 'shaders/lib'), { recursive: true });
  writeFileSync(
    join(dir, 'wesl.toml'),
    'edition = "unstable_2025"\ninclude = ["shaders/**/*.wesl"]\nroot = "shaders"\n',
  );
  writeFileSync(
    join(dir, 'shaders/lib/math.wesl'),
    `fn twice(x: f32) -> f32 { return ${libBody}; }\n`,
  );
  writeFileSync(
    join(dir, 'shaders/main.wesl'),
    'import package::lib::math::twice;\n@fragment fn fs() -> @location(0) vec4f { return vec4f(twice(1.0)); }\n',
  );
  return dir;
}

const ctx = { addWatchFile: () => undefined };
const load = (plugin: Plugin, id: string) =>
  (plugin.load as unknown as (this: typeof ctx, id: string) => Promise<string | null>).call(
    ctx,
    id,
  );
const wgslOf = (module: string) =>
  JSON.parse(/^export const wgsl = (".*");$/m.exec(module)![1]!) as string;

describe('weslStaticPlugin', () => {
  it('links a ?static import with its package:: imports under the toml root', async () => {
    const dir = fixture('x * 2.0');
    const plugin = weslStaticPlugin({ weslToml: join(dir, 'wesl.toml') });
    const wgsl = wgslOf((await load(plugin, join(dir, 'shaders/main.wesl?static')))!);
    expect(wgsl).toContain('fn twice');
    expect(wgsl).toContain('x * 2.0');
    expect(wgsl).not.toContain('import');
  });

  it('leaves every other id to the rest of the pipeline', async () => {
    const dir = fixture('x * 2.0');
    const plugin = weslStaticPlugin({ weslToml: join(dir, 'wesl.toml') });
    expect(await load(plugin, join(dir, 'shaders/main.wesl'))).toBeNull();
    expect(await load(plugin, join(dir, 'src/app.ts'))).toBeNull();
  });

  it('relinks with a changed dependency once it is told the file changed', async () => {
    const dir = fixture('x * 2.0');
    const plugin = weslStaticPlugin({ weslToml: join(dir, 'wesl.toml') });
    const id = join(dir, 'shaders/main.wesl?static');
    await load(plugin, id);
    const lib = join(dir, 'shaders/lib/math.wesl');
    writeFileSync(lib, 'fn twice(x: f32) -> f32 { return x + x; }\n');
    expect(wgslOf((await load(plugin, id))!)).toContain('x * 2.0'); // cached until told
    (plugin.watchChange as (id: string) => void)(lib);
    expect(wgslOf((await load(plugin, id))!)).toContain('x + x');
  });
});
