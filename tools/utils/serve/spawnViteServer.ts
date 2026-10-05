import { spawn } from 'node:child_process';
import { parsePreviewUrl } from '../record/parsePreviewUrl';
import type { PreviewHandle } from '../../@types/serve/PreviewHandle';

const READY_TIMEOUT_MS = 30_000;
const OUTPUT_TAIL_CHARS = 1000;

/**
 * Spawn `npx vite <args>` and read back the URL it actually bound from the
 * banner (strictPort is left off, so a busy port just bumps — assuming the
 * requested one held would silently aim at nothing). `label` names the server
 * in errors. Rejects with the output tail when vite exits or stays silent,
 * since a bare "no URL" would hide why (port clash, config error).
 */
export async function spawnViteServer(args: string[], label: string): Promise<PreviewHandle> {
  const proc = spawn('npx', ['vite', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    proc.once('spawn', () => resolve());
    proc.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT' ? new Error(`'npx' not found on PATH — the ${label} needs it`) : err,
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
      fail(`${label} exited with code ${String(code)} before printing a 'Local:' URL`);
    const timer = setTimeout(
      () => fail(`${label} gave no 'Local:' URL within ${READY_TIMEOUT_MS} ms`),
      READY_TIMEOUT_MS,
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
