import { parseShotLink } from '../utils/shot/parseShotLink';
import { parsePoint } from './parsePoint';
import { parseTapTarget } from './parseTapTarget';
import type { PhoneArgs } from './@types/PhoneArgs';
import type { PhoneCommand } from './@types/PhoneCommand';

const PHONE_USAGE = `usage: npm run phone -- <command> [link] [flags]
  devices                                   adb devices, DevTools sockets, browser version, open tabs
  serve [--build] [--port 4443]             HTTPS LAN preview of a production build (or how to reach dev)
  open <link> [--url URL]                   open the link in a new phone tab
  shot [link] [--wait MS] [--out FILE]      screenshot the last tab, or a new tab at the link
  net [link] [--for MS]                     cold-load the last tab and tabulate /data/ requests + console
  trace [link] [--wait MS] [--for MS]       trace the last tab; frame-time summary + raw trace
  tap <x,y|selector> [link] [--wait MS]     touch a CSS-pixel point or element on the last tab (or a new tab at the link)
  swipe <x,y> <x,y> [link] [--ms MS]        drag between two CSS-pixel points (default 300 ms)
URL defaults to https://<lan-ip>:<--port>, the server \`serve --build\` starts.`;

const COMMANDS: readonly PhoneCommand[] = [
  'serve',
  'open',
  'shot',
  'net',
  'trace',
  'devices',
  'tap',
  'swipe',
];
const VALUE_FLAGS: readonly string[] = ['--url', '--port', '--wait', '--out', '--for', '--ms'];

function nonNegative(flag: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${flag} must be a number ≥ 0 (got '${raw}')`);
  return n;
}

export function parsePhoneArgs(argv: readonly string[]): PhoneArgs {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command as PhoneCommand)) {
    throw new Error(`unknown command '${command ?? ''}'\n${PHONE_USAGE}`);
  }
  const values = new Map<string, string>();
  const positionals: string[] = [];
  let build = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (arg === '--build') build = true;
    else if (VALUE_FLAGS.includes(arg)) {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      values.set(arg, value);
    } else if (arg.startsWith('--')) throw new Error(`unknown flag '${arg}'\n${PHONE_USAGE}`);
    else positionals.push(arg);
  }
  const gestureArgs = command === 'tap' ? 1 : command === 'swipe' ? 2 : 0;
  if (positionals.length < gestureArgs)
    throw new Error(
      `${command} needs ${gestureArgs === 1 ? '<x,y|selector>' : '<x,y> <x,y>'}\n${PHONE_USAGE}`,
    );
  const links = positionals.slice(gestureArgs);
  const to = gestureArgs === 2 ? parsePoint(positionals[1] as string) : undefined;
  if (
    gestureArgs === 2 &&
    (to === undefined || parseTapTarget(positionals[0] as string).kind !== 'point')
  )
    throw new Error(`swipe takes two x,y points in CSS pixels\n${PHONE_USAGE}`);
  if (links.length > 1) throw new Error(`one link at most (got ${links.length})`);
  if (command === 'open' && links.length === 0)
    throw new Error(`open needs a link\n${PHONE_USAGE}`);
  const url = values.get('--url');
  if (url !== undefined && /[?#]/.test(url)) {
    throw new Error(`--url is a server origin, without query or hash (got '${url}')`);
  }
  return {
    command: command as PhoneCommand,
    link: links[0] === undefined ? undefined : parseShotLink(links[0]),
    url: url?.replace(/\/+$/, ''),
    build,
    port: nonNegative('--port', values.get('--port')) ?? 4443,
    waitMs: nonNegative('--wait', values.get('--wait')),
    out: values.get('--out'),
    target: gestureArgs === 0 ? undefined : parseTapTarget(positionals[0] as string),
    to,
    ms: nonNegative('--ms', values.get('--ms')),
    forMs: nonNegative('--for', values.get('--for')),
  };
}
