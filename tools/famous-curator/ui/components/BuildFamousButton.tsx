/**
 * BuildFamousButton — fixed-position trigger in the bottom-right corner.
 *
 * Posts to /api/build-famous, which runs `npm run build-famous` server-
 * side.  After a successful build, `famous.bin` carries the latest
 * curated images and the main app picks them up on next reload.
 *
 * Status visible inline: idle → running (spinner glyph) → ok / failed
 * (with stderr surfaced on hover via title attr).
 */
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useApi } from '../apiContext';
import type { BuildFamousResult } from '../api';

type Status =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; result: BuildFamousResult }
  | { kind: 'failed'; result: BuildFamousResult }
  | { kind: 'error'; message: string };

export function BuildFamousButton(): ReactNode {
  const api = useApi();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const onClick = useCallback(async () => {
    setStatus({ kind: 'running' });
    try {
      const result = await api.postBuildFamous();
      setStatus({ kind: result.ok ? 'ok' : 'failed', result });
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message });
    }
  }, [api]);

  const label =
    status.kind === 'running' ? 'Building…' :
    status.kind === 'ok' ? `Built (${(status.result.durationMs / 1000).toFixed(1)}s)` :
    status.kind === 'failed' ? `Failed (exit ${status.result.exitCode})` :
    status.kind === 'error' ? 'Error' :
    'Rebuild famous.bin';

  // Hover-surface the relevant stderr / message so the user can see WHY
  // a build failed without us building a modal.
  const title =
    status.kind === 'failed' ? status.result.stderr || status.result.stdout :
    status.kind === 'error' ? status.message :
    status.kind === 'ok' ? 'Main app will pick up the new images on next reload.' :
    'Run npm run build-famous so the main app sees the latest curated images.';

  return (
    <button
      type="button"
      className={`curator-build-famous curator-build-famous--${status.kind}`}
      onClick={onClick}
      disabled={status.kind === 'running'}
      title={title}
    >
      {label}
    </button>
  );
}
