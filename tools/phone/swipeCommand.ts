import type { PhoneArgs } from './@types/PhoneArgs';
import { touchSwipe } from './touchSwipe';
import { withInputTab } from './withInputTab';

const DEFAULT_SWIPE_MS = 300;

/** Drag one finger between two CSS-pixel points over `--ms`. */
export async function swipeCommand(args: PhoneArgs): Promise<void> {
  const { target, to } = args;
  if (target?.kind !== 'point' || to === undefined) throw new Error('swipe needs <x,y> <x,y>');
  const from = target.point;
  await withInputTab(args, async (client, sessionId) => {
    await touchSwipe(client, sessionId, from, to, args.ms ?? DEFAULT_SWIPE_MS);
    console.log(`swiped ${from.x},${from.y} -> ${to.x},${to.y}`);
  });
}
