/**
 * starnet — shell-out wrapper tests.
 *
 * Two surfaces:
 *  - resolveStarnetConfig(env) — pure, picks the binary + weights path
 *    from env vars.  Throws if STARNET_WEIGHTS is missing (when not in
 *    mock mode).
 *  - runStarnet({ input, output, stride, upsample, config }) — spawns
 *    starnet2 (or copies input → output when config.mock is true).
 *
 * The spawn test uses an injected spawner so we don't depend on the
 * real binary being installed.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import {
  resolveStarnetConfig,
  runStarnet,
  type Spawner,
} from '../../../tools/famous-curator/plugin/starnet';

describe('resolveStarnetConfig', () => {
  it('returns the env-supplied bin + weights path', () => {
    const cfg = resolveStarnetConfig({ STARNET_BIN: 'sn2', STARNET_WEIGHTS: '/w.pt' });
    expect(cfg.mock).toBe(false);
    if (!cfg.mock) {
      expect(cfg.bin).toBe('sn2');
      expect(cfg.weights).toBe('/w.pt');
    }
  });

  it('defaults bin to starnet2 when STARNET_BIN is unset', () => {
    const cfg = resolveStarnetConfig({ STARNET_WEIGHTS: '/w.pt' });
    if (!cfg.mock) expect(cfg.bin).toBe('starnet2');
  });

  it('resolves a relative STARNET_WEIGHTS to an absolute path', () => {
    // runStarnet spawns the binary with cwd = a session tmpdir, so a
    // relative weights path must be pinned absolute at config time or the
    // binary fails with 'Could not find the checkpoint file!'.
    const cfg = resolveStarnetConfig({ STARNET_WEIGHTS: 'data/starnet/w.pt' });
    if (!cfg.mock) {
      expect(isAbsolute(cfg.weights)).toBe(true);
      expect(cfg.weights).toBe(resolve('data/starnet/w.pt'));
    }
  });

  it('throws when STARNET_WEIGHTS is missing in real mode', () => {
    expect(() => resolveStarnetConfig({})).toThrow(/STARNET_WEIGHTS/);
  });

  it('returns mock config when MOCK_STARNET=1', () => {
    const cfg = resolveStarnetConfig({ MOCK_STARNET: '1' });
    expect(cfg.mock).toBe(true);
  });
});

describe('runStarnet', () => {
  it('mock mode copies input bytes to output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'curator-starnet-'));
    const input = join(dir, 'in.png');
    const output = join(dir, 'out.png');
    writeFileSync(input, Buffer.from([1, 2, 3, 4, 5]));
    await runStarnet({
      input,
      output,
      stride: 256,
      upsample: false,
      config: { mock: true },
    });
    expect(Array.from(readFileSync(output))).toEqual([1, 2, 3, 4, 5]);
  });

  it('real mode invokes the binary with the expected argv', async () => {
    let capturedArgs: readonly string[] = [];
    const spawner: Spawner = (bin, args) => {
      capturedArgs = [bin, ...args];
      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    };
    await runStarnet({
      input: '/in.png',
      output: '/out.png',
      stride: 512,
      upsample: true,
      config: { mock: false, bin: 'starnet2', weights: '/w.pt' },
      spawner,
    });
    expect(capturedArgs).toEqual([
      'starnet2',
      '-i', '/in.png',
      '-o', '/out.png',
      '-s', '512',
      '-w', '/w.pt',
      '-e',
      '-u',
    ]);
  });

  it('real mode without upsample omits the -u flag', async () => {
    let capturedArgs: readonly string[] = [];
    const spawner: Spawner = (bin, args) => {
      capturedArgs = [bin, ...args];
      return Promise.resolve({ code: 0, stdout: '', stderr: '' });
    };
    await runStarnet({
      input: '/in.png',
      output: '/out.png',
      stride: 256,
      upsample: false,
      config: { mock: false, bin: 'starnet2', weights: '/w.pt' },
      spawner,
    });
    expect(capturedArgs).not.toContain('-u');
  });

  it('real mode throws when the binary exits non-zero', async () => {
    const spawner: Spawner = () =>
      Promise.resolve({ code: 1, stdout: '', stderr: 'boom' });
    await expect(
      runStarnet({
        input: '/in.png',
        output: '/out.png',
        stride: 256,
        upsample: false,
        config: { mock: false, bin: 'starnet2', weights: '/w.pt' },
        spawner,
      }),
    ).rejects.toThrow(/exited 1.*boom/);
  });
});
