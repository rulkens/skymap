/**
 * defaultOutName — the recorder's default output path: take id, output size,
 * fps, and a local-time timestamp.
 *
 * The timestamp exists because the encode argv passes '-y' (overwrite without
 * prompting — a batch tool has nobody at the terminal to answer): with a
 * FIXED default name, two successive default-flag takes would silently
 * clobber each other, and recording a different tour or a quick smoke would
 * overwrite the main film. A per-second stamp makes every default take land
 * in a fresh file; an operator who WANTS a stable name passes --out and gets
 * it verbatim.
 *
 * Local time, not UTC: the filename is operator-facing — takes should sort
 * and read in the same clock the person recording them is living in. `now`
 * is injected rather than read from Date.now() so the function stays pure
 * and the exact string is testable.
 */
export function defaultOutName(opts: {
  takeId: string;
  width: number;
  height: number;
  fps: number;
  now: Date;
}): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const { now } = opts;
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `recordings/${opts.takeId}-${opts.width}x${opts.height}-${opts.fps}fps-${stamp}.mp4`;
}
