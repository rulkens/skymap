import { spawn } from 'node:child_process';
import { parsePreviewUrl } from '../record/parsePreviewUrl';
import type { PreviewHandle } from '../../@types/serve/PreviewHandle';

const PREVIEW_READY_TIMEOUT_MS = 30_000;

/**
 * Spawn `vite preview` over the --serve build and read back the URL it
 * actually bound (strictPort is left off, so a busy SERVE_PORT just bumps —
 * assuming the requested port held would silently record against nothing).
 * Mirrors spawnFfmpeg's spawn/error race for the ENOENT case; the ready wait
 * adds a timeout because there is no bounded "it will definitely print a URL
 * eventually" guarantee the way ffmpeg's close event gives one.
 */
export async function spawnPreviewServer(dir: string, port: number): Promise<PreviewHandle> {
  const proc = spawn('npx', ['vite', 'preview', '--outDir', dir, '--port', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    proc.once('spawn', () => resolve());
    proc.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error("'npx' not found on PATH — the --serve preview shells out to it")
          : err,
      );
    });
  });
  const url = await new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer): void => {
      const found = parsePreviewUrl(chunk.toString());
      if (found !== undefined) {
        clearTimeout(timer);
        proc.stdout?.off('data', onData);
        proc.off('close', onClose);
        resolve(found);
      }
    };
    const onClose = (code: number | null): void => {
      clearTimeout(timer);
      reject(
        new Error(`vite preview exited with code ${String(code)} before printing a 'Local:' URL`),
      );
    };
    const timer = setTimeout(() => {
      proc.stdout?.off('data', onData);
      proc.off('close', onClose);
      reject(new Error(`vite preview gave no 'Local:' URL within ${PREVIEW_READY_TIMEOUT_MS} ms`));
    }, PREVIEW_READY_TIMEOUT_MS);
    proc.stdout?.on('data', onData);
    proc.once('close', onClose);
  });
  return { proc, url };
}
