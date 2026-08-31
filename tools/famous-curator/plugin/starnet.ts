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
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export type StarnetConfig = { mock: true } | { mock: false; bin: string; weights: string };

export type Spawner = (
  bin: string,
  args: readonly string[],
  opts?: { cwd?: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

/**
 * Default spawner: shells out via node:child_process.spawn, collecting
 * stdout/stderr to strings and resolving with the exit code.  Tests
 * inject their own to avoid touching the real process tree.
 *
 * `cwd` is forwarded so callers can keep the binary's working-directory
 * side effects (e.g. starnet2 writes a `mask.jpg` next to its cwd) out
 * of unrelated trees like the project root.
 */
const defaultSpawner: Spawner = (bin, args, opts) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(bin, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: opts?.cwd,
    });
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
 *
 * The weights path is resolved to absolute here, against the server's
 * launch cwd (the project root under `npm run curate-famous`).  This is
 * load-bearing: runStarnet spawns the binary with cwd = the input's
 * directory (a session tmpdir, to keep starnet2's mask.jpg out of the
 * repo), so a *relative* STARNET_WEIGHTS would resolve against that
 * tmpdir at spawn time and fail with 'Could not find the checkpoint
 * file!' / 'starnet2 exited 255'.  Pinning it absolute at config time —
 * before the cwd switch — lets the documented relative env value
 * (`STARNET_WEIGHTS=data/starnet/StarNet2_weights.pt`) keep working.
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
  return { mock: false, bin: env.STARNET_BIN ?? 'starnet2', weights: resolve(weights) };
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
    '-i',
    opts.input,
    '-o',
    opts.output,
    '-s',
    String(opts.stride),
    '-w',
    opts.config.weights,
    '-e',
  ];
  if (opts.upsample) args.push('-u');
  // Run starnet2 from the input's directory so its incidental write of
  // mask.jpg lands in the session tmpdir, not the project root.
  // (Discovered when mask.jpg kept reappearing as an untracked file in
  // git status.)
  const { code, stderr } = await spawner(opts.config.bin, args, { cwd: dirname(opts.input) });
  if (code !== 0) {
    throw new Error(`starnet2 exited ${code}: ${stderr.trim()}`);
  }
}
