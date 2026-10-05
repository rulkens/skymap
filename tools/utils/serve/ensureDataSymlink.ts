import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';

/**
 * Vite's default `copyPublicDir` copies the whole `public/` tree — including
 * `data/`, ~100 MB of catalog `.bin` files, when this worktree has them on
 * disk — into the outDir verbatim on every build. --serve replaces that
 * one-time snapshot with a symlink back at this worktree's public/data/ so
 * a reused build (no --rebuild) still serves whatever the catalog currently
 * is, and so a build doesn't silently double disk usage. Repairs whatever it
 * finds at the link path — a stale symlink (wrong target, or dangling
 * because public/data/ moved), or vite's own copied directory — rather than
 * trusting it.
 */
export function ensureDataSymlink(dir: string): void {
  const linkPath = resolvePath(dir, 'data');
  const target = resolvePath('public/data');
  let stat: ReturnType<typeof lstatSync> | undefined;
  try {
    stat = lstatSync(linkPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  if (stat !== undefined) {
    if (stat.isSymbolicLink()) {
      const resolvedExisting = resolvePath(dirname(linkPath), readlinkSync(linkPath));
      if (resolvedExisting === target && existsSync(linkPath)) return; // correct and not dangling
      console.log(`  repairing stale --serve data symlink at ${linkPath}`);
      unlinkSync(linkPath);
    } else {
      console.log(`  replacing vite's copied ${linkPath} with a symlink to keep data current`);
      rmSync(linkPath, { recursive: true, force: true });
    }
  }
  symlinkSync(target, linkPath, 'dir');
  console.log(`  linked ${linkPath} -> ${target}`);
}
