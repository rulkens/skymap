import { parseSize } from '../utils/record/parseSize';
import { parseShotLink } from '../utils/shot/parseShotLink';
import type { ShotLink } from './@types/ShotLink';
import type { ShotOptions } from './@types/ShotOptions';

const USAGE =
  'usage: npm run shot -- <link>... [--url URL | --build] [--out FILE] [--size WxH] [--dpr N] ' +
  '[--hide-ui] [--hide-labels] [--png] [--timeout SECONDS]';

const VALUE_FLAGS: readonly string[] = ['--url', '--out', '--size', '--dpr', '--timeout'];

function positiveNumber(flag: string, raw: string): number {
  const n = Number(raw);
  if (!(n > 0)) throw new Error(`${flag} must be a positive number (got '${raw}')\n${USAGE}`);
  return n;
}

export function parseShotArgs(argv: readonly string[]): ShotOptions {
  const links: ShotLink[] = [];
  const values = new Map<string, string>();
  let build = false;
  let hideUi = false;
  let hideLabels = false;
  let png = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--build') build = true;
    else if (arg === '--hide-ui') hideUi = true;
    else if (arg === '--hide-labels') hideLabels = true;
    else if (arg === '--png') png = true;
    else if (VALUE_FLAGS.includes(arg)) {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--'))
        throw new Error(`${arg} requires a value\n${USAGE}`);
      values.set(arg, value);
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag '${arg}'\n${USAGE}`);
    } else links.push(parseShotLink(arg));
  }
  if (links.length === 0) throw new Error(`no link given\n${USAGE}`);
  const out = values.get('--out');
  if (out !== undefined && links.length > 1) {
    throw new Error(`--out names one file but ${links.length} links were given\n${USAGE}`);
  }
  // An explicit file name states its own format: bytes must match the extension.
  const outIsPng = out?.toLowerCase().endsWith('.png') ?? false;
  if (png && out !== undefined && !outIsPng) {
    throw new Error(`--png conflicts with --out '${out}': name the file .png\n${USAGE}`);
  }
  const rawUrl = values.get('--url');
  if (rawUrl !== undefined && build) {
    throw new Error(
      `--build and --url conflict: --url reuses a server, --build starts one\n${USAGE}`,
    );
  }
  if (rawUrl !== undefined && /[?#]/.test(rawUrl)) {
    throw new Error(`--url must not carry its own query or hash (got '${rawUrl}')\n${USAGE}`);
  }
  const { width, height } = parseSize(values.get('--size') ?? '1600x900');
  const rawDpr = values.get('--dpr');
  const rawTimeout = values.get('--timeout');
  return {
    links,
    url: rawUrl?.replace(/\/+$/, ''),
    build,
    out,
    width,
    height,
    dpr: rawDpr === undefined ? 2 : positiveNumber('--dpr', rawDpr),
    hideUi,
    hideLabels,
    timeoutMs: (rawTimeout === undefined ? 30 : positiveNumber('--timeout', rawTimeout)) * 1000,
    format: png || outIsPng ? 'png' : 'jpeg',
  };
}
