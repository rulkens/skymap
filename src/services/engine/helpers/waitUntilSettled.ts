/**
 * waitUntilSettled — resolves after the first frame that reported no fade or
 * label animation. Always spends at least one frame, so a dispatch made just
 * before the call has been drawn. Never times out: the caller owns the deadline.
 */
export async function waitUntilSettled(
  nextFrame: () => Promise<void>,
  animatedLastFrame: () => boolean,
): Promise<void> {
  do {
    await nextFrame();
  } while (animatedLastFrame());
}
