import { spawn } from 'node:child_process';
import { parsePreviewUrl } from '../record/parsePreviewUrl';
import type { PreviewHandle } from '../../@types/serve/PreviewHandle';

const DEV_READY_TIMEOUT_MS = 30_000;
const OUTPUT_TAIL_CHARS = 1000;

/**
 * Spawn the project's `vite` dev server on whatever port is free and read the
 * URL from its banner — no port is pinned, so a running dev server elsewhere
 * is never collided with. Rejects with the output tail when vite exits or stays
 * silent, since a bare "no URL" would hide why (port clash, config error).
 */
export async function spawnDevServer(): Promise<PreviewHandle> {
  const proc = spawn('npx', ['vite'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    proc.once('spawn', () => resolve());
    proc.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error("'npx' not found on PATH — the dev server needs it")
          : err,
      );
    });
  });
  let output = '';
  const url = await new Promise<string>((resolve, reject) => {
    const fail = (reason: string): void => {
      cleanup();
      proc.kill();
      reject(new Error(`${reason}\n${output.slice(-OUTPUT_TAIL_CHARS)}`));
    };
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const found = parsePreviewUrl(output);
      if (found !== undefined) {
        cleanup();
        resolve(found);
      }
    };
    const onClose = (code: number | null): void =>
      fail(`vite exited with code ${String(code)} before printing a 'Local:' URL`);
    const timer = setTimeout(
      () => fail(`vite gave no 'Local:' URL within ${DEV_READY_TIMEOUT_MS} ms`),
      DEV_READY_TIMEOUT_MS,
    );
    function cleanup(): void {
      clearTimeout(timer);
      proc.stdout?.off('data', onData);
      proc.stderr?.off('data', onData);
      proc.off('close', onClose);
    }
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.once('close', onClose);
  });
  return { proc, url };
}
