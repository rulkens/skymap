import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const BUILD_LOG_TAIL_LINES = 40;

/**
 * --serve support: build a production bundle, serve it with `vite preview`,
 * and record against THAT instead of the dev server. The dev client's HMR
 * websocket is the root cause behind two reload-mid-take bugs this branch
 * fixed (see the addInitScript comment in captureTake) — a production build
 * ships no HMR client at all, so this mode is immune by construction rather
 * than patched around a third variant of the same failure. Recommended for
 * any take long enough to outlast the dev client's patience (module doc:
 * hours for a full 4K tour).
 */

/**
 * Build (or reuse) the --serve bundle. `dataUrl()` reads `VITE_DATA_BASE_URL`
 * at build time to decide between the R2 host and a relative `/data/` path
 * (see cloudLoader.ts); blanking it here — in the CHILD's env only, never
 * process.env — makes the served build fetch the catalog from the symlink
 * ensureDataSymlink sets up, exactly like `npm run dev` does. Blanking
 * VITE_COUNTERSCALE_URL likewise skips injecting the analytics tracker into
 * a take that only ever plays on this machine.
 */
export async function ensureServeBuild(dir: string, rebuild: boolean): Promise<void> {
  if (!rebuild && existsSync(`${dir}/index.html`)) {
    console.log(`  reusing existing --serve build at ${dir} (pass --rebuild to force a fresh one)`);
    return;
  }
  console.log(
    `  building --serve bundle into ${dir} ` +
      (rebuild ? '(--rebuild forced) ...' : '(none found yet) ...'),
  );
  const proc = spawn('npx', ['vite', 'build', '--outDir', dir], {
    env: { ...process.env, VITE_DATA_BASE_URL: '', VITE_COUNTERSCALE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tailLines: string[] = [];
  const collect = (chunk: Buffer): void => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim() !== '') tailLines.push(line);
    }
    if (tailLines.length > BUILD_LOG_TAIL_LINES) {
      tailLines.splice(0, tailLines.length - BUILD_LOG_TAIL_LINES);
    }
  };
  proc.stdout?.on('data', collect);
  proc.stderr?.on('data', collect);
  const code = await new Promise<number | null>((resolve, reject) => {
    proc.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        err.code === 'ENOENT'
          ? new Error("'npx' not found on PATH — the --serve build shells out to it")
          : err,
      );
    });
    proc.once('close', resolve);
  });
  if (code !== 0) {
    throw new Error(`vite build exited with code ${String(code)} — tail:\n${tailLines.join('\n')}`);
  }
}
