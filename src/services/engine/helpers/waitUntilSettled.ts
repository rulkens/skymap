/**
 * waitUntilSettled — resolves after two still frames in a row, so a dispatch made
 * just before the call has been drawn, and a demand the landing frame turned on
 * has had a frame to start its load. Never times out: the caller owns the deadline.
 */
const STILL_FRAMES = 2;

export async function waitUntilSettled(
  nextFrame: () => Promise<void>,
  busyLastFrame: () => boolean,
): Promise<void> {
  for (let still = 0; still < STILL_FRAMES; ) {
    await nextFrame();
    still = busyLastFrame() ? 0 : still + 1;
  }
}
