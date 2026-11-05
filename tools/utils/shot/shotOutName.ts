import type { ShotFormat } from '../../shot/@types/ShotFormat';
import type { ShotLink } from '../../shot/@types/ShotLink';

const SUBJECT_KEYS = ['focus', 'exhibit', 'tour', 'clip'] as const;

/**
 * shotOutName — default output path for one shot, named after what it shows.
 *
 * Local time, like defaultOutName, so files sort in the operator's own clock.
 * `taken` is the run's own names: two links to one subject inside the same
 * second would otherwise overwrite each other.
 */
export function shotOutName(opts: {
  link: ShotLink;
  format: ShotFormat;
  now: Date;
  taken: ReadonlySet<string>;
}): string {
  const params = new URLSearchParams(opts.link.hash);
  const raw = SUBJECT_KEYS.map((key) => params.get(key)).find((v) => v !== null && v !== '');
  const subject = (raw ?? 'shot').replace(/[^A-Za-z0-9._-]/g, '-');
  const pad = (n: number): string => String(n).padStart(2, '0');
  const { now } = opts;
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const base = `data/shots/${subject}-${stamp}`;
  const ext = opts.format === 'png' ? 'png' : 'jpg';
  let name = `${base}.${ext}`;
  for (let n = 2; opts.taken.has(name); n++) name = `${base}-${n}.${ext}`;
  return name;
}
