import type { PhoneArgs } from './@types/PhoneArgs';
import { lanIp } from './lanIp';

/** `--url`, else the LAN origin `serve --build` listens on. Never localhost: that is the phone itself. */
export function serverOrigin(args: Pick<PhoneArgs, 'url' | 'port'>): string {
  return args.url ?? `https://${lanIp()}:${args.port}`;
}
