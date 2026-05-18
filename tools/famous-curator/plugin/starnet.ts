/**
 * starnet — promisified wrapper around the StarNet2 CLI.
 *
 * The real binary is shelled out as:
 *
 *   starnet2 -i <input> -o <output> -s <stride> -w <weights> -e [-u]
 *
 * `-e` requests 8-bit PNG output (vs the default 16-bit, which sharp
 * downstream doesn't gain anything from since the rest of the pipeline
 * is 8-bit anyway).  `-u` enables upsample mode (better fidelity at the
 * cost of ~3× runtime).
 *
 * MOCK_STARNET=1 short-circuits the spawn entirely: we copy the input
 * file to the output path verbatim.  This lets API integration tests
 * exercise the full process route without needing the real binary
 * installed in CI.
 */
import { copyFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

export type StarnetConfig =
  | { mock: true }
  | { mock: false; bin: string; weights: string };

export type Spawner = (
  bin: string,
  args: readonly string[],
) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * Default spawner: shells out via node:child_process.spawn, collecting
 * stdout/stderr to strings and resolving with the exit code.  Tests
 * inject their own to avoid touching the real process tree.
 */
const defaultSpawner: Spawner = (bin, args) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(bin, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
  });

/**
 * Pick the StarNet config from environment variables.  Throws in real
 * mode if STARNET_WEIGHTS is missing (the binary refuses to run without
 * a weights path; we surface the install-hint at server boot rather
 * than per-request).
 */
export function resolveStarnetConfig(env: Record<string, string | undefined>): StarnetConfig {
  if (env.MOCK_STARNET === '1') return { mock: true };
  const weights = env.STARNET_WEIGHTS;
  if (typeof weights !== 'string' || weights.length === 0) {
    throw new Error(
      'STARNET_WEIGHTS not set.  See tools/famous-curator/README.md for install instructions, ' +
        'or set MOCK_STARNET=1 to run with a copy-input shim.',
    );
  }
  return { mock: false, bin: env.STARNET_BIN ?? 'starnet2', weights };
}

export async function runStarnet(opts: {
  input: string;
  output: string;
  stride: number;
  upsample: boolean;
  config: StarnetConfig;
  spawner?: Spawner;
}): Promise<void> {
  if (opts.config.mock) {
    // Copy input → output verbatim.  The downstream alpha pass will
    // still run; the result won't look starless (because nothing was
    // removed) but the file shape is correct for tests asserting on
    // disk artefacts.
    copyFileSync(opts.input, opts.output);
    return;
  }
  const spawner = opts.spawner ?? defaultSpawner;
  const args = [
    '-i', opts.input,
    '-o', opts.output,
    '-s', String(opts.stride),
    '-w', opts.config.weights,
    '-e',
  ];
  if (opts.upsample) args.push('-u');
  const { code, stderr } = await spawner(opts.config.bin, args);
  if (code !== 0) {
    throw new Error(`starnet2 exited ${code}: ${stderr.trim()}`);
  }
}
