import type { PhoneArgs } from './@types/PhoneArgs';
import { resolveTapTarget } from './resolveTapTarget';
import { touchSwipe } from './touchSwipe';
import { withInputTab } from './withInputTab';

const TAP_HOLD_MS = 50;

/** Tap a point or selector with a real touch (down, short hold, up); prints what was hit. */
export async function tapCommand(args: PhoneArgs): Promise<void> {
  const { target } = args;
  if (target === undefined) throw new Error('tap needs a target');
  await withInputTab(args, async (client, sessionId) => {
    const { point, label } = await resolveTapTarget(client, sessionId, target);
    await touchSwipe(client, sessionId, point, point, TAP_HOLD_MS);
    console.log(`tapped ${label} at ${Math.round(point.x)},${Math.round(point.y)}`);
  });
}
