import { parseSize } from '../utils/record/parseSize';
import type { MockOptions } from './@types/MockOptions';

const USAGE =
  "usage: npm run mock -- <name> ['<hash>'] --url http://localhost:<port> [--size WxH | --phone]";
const DESKTOP_SIZE = '1728x1000';
const PHONE_SIZE = '400x850';

export function parseMockArgs(argv: readonly string[]): MockOptions {
  const positional: string[] = [];
  let url: string | undefined;
  let size: string | undefined;
  let phone = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === '--phone') phone = true;
    else if (arg === '--url' || arg === '--size') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--'))
        throw new Error(`${arg} requires a value\n${USAGE}`);
      if (arg === '--url') url = value;
      else size = value;
    } else if (arg.startsWith('--')) throw new Error(`unknown flag '${arg}'\n${USAGE}`);
    else positional.push(arg);
  }
  const [name, hash = '', ...extra] = positional;
  if (name === undefined) throw new Error(`no mock name given\n${USAGE}`);
  // The name lands in a glob key and a file name, so it stays one path segment.
  if (!/^[\w-]+$/.test(name)) throw new Error(`mock name must be [A-Za-z0-9_-]+ (got '${name}')`);
  if (extra.length > 0) throw new Error(`unexpected argument '${extra[0]}'\n${USAGE}`);
  // A mock re-renders through Vite's HMR, so there is no build or self-served mode.
  if (url === undefined) throw new Error(`--url is required: the dev server to mock on\n${USAGE}`);
  if (/[?#]/.test(url))
    throw new Error(`--url must not carry its own query or hash (got '${url}')`);
  if (phone && size !== undefined) throw new Error('--phone sets its own size; drop --size');
  const { width, height } = parseSize(size ?? (phone ? PHONE_SIZE : DESKTOP_SIZE));
  return { name, hash: hash.replace(/^#/, ''), url: url.replace(/\/+$/, ''), width, height, phone };
}
