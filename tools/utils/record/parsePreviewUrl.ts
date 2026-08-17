/**
 * parsePreviewUrl — pull the served origin out of `vite preview`'s stdout.
 *
 * `--port` is only a request: strictPort is off by default, so vite silently
 * serves from the next free port when the requested one is busy. The banner
 * line (`  ➜  Local:   http://localhost:4518/`) is the only place that names
 * the port actually bound, so `record.ts --serve` reads it from here instead
 * of assuming its own `--port` argument held. ANSI colour codes wrap both the
 * label and the URL; those are stripped before matching.
 */
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
const LOCAL_URL_PATTERN = /Local:\s*(https?:\/\/\S+)/;

export function parsePreviewUrl(output: string): string | undefined {
  const clean = output.replace(ANSI_PATTERN, '');
  const match = LOCAL_URL_PATTERN.exec(clean);
  if (match?.[1] === undefined) return undefined;
  return match[1].replace(/\/$/, '');
}
