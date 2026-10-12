/**
 * phone — on-device checks on an Android phone over USB (`npm run phone -- <command>`).
 *
 * DevTools rides `adb forward`; the page and its data ride WiFi from a LAN
 * HTTPS server. See tools/phone/README.md and the phone skill for the traps.
 */
import type { PhoneArgs } from './@types/PhoneArgs';
import type { PhoneCommand } from './@types/PhoneCommand';
import { devicesCommand } from './devicesCommand';
import { netCommand } from './netCommand';
import { openCommand } from './openCommand';
import { parsePhoneArgs } from './parsePhoneArgs';
import { serveCommand } from './serveCommand';
import { shotCommand } from './shotCommand';
import { traceCommand } from './traceCommand';

const COMMANDS: Record<PhoneCommand, (args: PhoneArgs) => Promise<void>> = {
  devices: devicesCommand,
  serve: serveCommand,
  open: openCommand,
  shot: shotCommand,
  net: netCommand,
  trace: traceCommand,
};

async function main(): Promise<void> {
  const args = parsePhoneArgs(process.argv.slice(2));
  await COMMANDS[args.command](args);
  // `serve --build` keeps its server up; everything else is done (a CDP timer must not hold the process).
  if (!(args.command === 'serve' && args.build)) process.exit(0);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
