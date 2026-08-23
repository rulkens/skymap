/**
 * /api/build-famous — run `npm run build-famous` so the main app picks up
 * newly-curated images in famous.bin.
 *
 * Runs synchronously per request (the script is fast — a few seconds —
 * and we don't want to model concurrent runs).  Captures stdout+stderr
 * and returns them in the response so the UI can show the output.
 */
import { spawn } from 'node:child_process';

export type BuildFamousResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export async function handleBuildFamous(opts: { repoRoot: string }): Promise<BuildFamousResult> {
  const startedAt = Date.now();
  return new Promise<BuildFamousResult>((resolveResult, rejectResult) => {
    const proc = spawn('npm', ['run', 'build-famous'], {
      cwd: opts.repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    proc.stdout?.on('data', (c: Buffer) => outChunks.push(c));
    proc.stderr?.on('data', (c: Buffer) => errChunks.push(c));
    proc.on('error', (err) => rejectResult(err));
    proc.on('close', (exitCode) => {
      const code = exitCode ?? -1;
      resolveResult({
        ok: code === 0,
        exitCode: code,
        stdout: Buffer.concat(outChunks).toString('utf8'),
        stderr: Buffer.concat(errChunks).toString('utf8'),
        durationMs: Date.now() - startedAt,
      });
    });
  });
}
