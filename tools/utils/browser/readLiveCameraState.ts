import type { ConsoleMessage, Page } from '@playwright/test';
import { logCameraState } from '../../../src/state/camera/logCameraState';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { SkymapPerfHook } from '../../../src/state/perf/@types/SkymapPerfHook';

const CAMERA_LOG_TIMEOUT_MS = 15_000;

/**
 * Dispatches the `l`-key action and reads the resulting `[engine] camera
 * state (full precision)` console line's second argument — the raw JSON blob
 * `logCameraState` prints — rather than string-matching the formatted line.
 */
export async function readLiveCameraState(
  page: Page,
): Promise<Pick<CameraPose, 'yaw' | 'pitch' | 'distance'>> {
  const messagePromise = new Promise<ConsoleMessage>((resolve, reject) => {
    const onMessage = (msg: ConsoleMessage): void => {
      if (msg.text().includes('camera state (full precision)')) {
        page.off('console', onMessage);
        clearTimeout(timer);
        resolve(msg);
      }
    };
    // Bounded like every other wait here: if the `l`-key log stops arriving —
    // unwired saga, renamed line — the card fails and the run goes on, rather
    // than the whole run hanging on one silent page.
    const timer = setTimeout(() => {
      page.off('console', onMessage);
      reject(new Error(`no camera state logged within ${CAMERA_LOG_TIMEOUT_MS} ms`));
    }, CAMERA_LOG_TIMEOUT_MS);
    page.on('console', onMessage);
  });
  await page.evaluate((action) => {
    (window as unknown as { __skymapPerf: SkymapPerfHook }).__skymapPerf.dispatch(action);
  }, logCameraState());
  const msg = await messagePromise;
  const jsonArg = msg.args()[1];
  if (jsonArg === undefined) {
    throw new Error('camera state console message carried no JSON argument');
  }
  const parsed = JSON.parse((await jsonArg.jsonValue()) as string) as {
    yaw: number;
    pitch: number;
    distanceMpc: number;
  };
  const live = { yaw: parsed.yaw, pitch: parsed.pitch, distance: parsed.distanceMpc };
  // LANDMINE: `poseMismatch` compares with `>`, and every comparison against a
  // NaN is false — a renamed key here would turn the verification step into a
  // silent pass, shipping whatever the fly-in happened to leave on screen.
  for (const [field, value] of Object.entries(live)) {
    if (!Number.isFinite(value)) {
      throw new Error(`camera state '${field}' came back as ${String(value)}, not a number`);
    }
  }
  return live;
}
