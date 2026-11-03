import type { Page } from '@playwright/test';
import type { UnknownAction } from '@reduxjs/toolkit';
import sharp from 'sharp';

import type { SiteShot } from '../../../packages/website/src/@types/SiteShot';
import type { SkymapWindow } from '../../../src/@types/automation/SkymapWindow';
import { setMatteWhite, setPassDisabled } from '../../../src/state/settings/core/debugSlice';
import { dispatchActions } from '../../utils/browser/dispatchActions';
import { readCanvas } from '../../utils/shot/readCanvas';
import { MATTE_HIDDEN_PASSES } from '../matteHiddenPasses';
import { differenceMatte } from './differenceMatte';
import { emissiveMatte } from './emissiveMatte';
import { shadowLayer } from './shadowLayer';

// The app's only cast shadow is a craft's baked contact decal, drawn by its own pass.
const SHADOW_CASTER_PASS = 'mission-meshes';
const SHADOW_PASS = 'contact-shadows';

const hide = (passes: readonly string[], disabled = true): UnknownAction[] =>
  passes.map((pass) => setPassDisabled({ pass, disabled }));

/**
 * The PNG masters of a `matte` row, on a page `openSiteShot` has opened: the
 * subject on transparency (`occluding`: from a black/white pair; `emissive`: from
 * black alone) and, with `shadow`, its multiply layer. The shadow
 * pair is drawn first, on the whole scene with the craft left out of both
 * frames, so the layer holds the shadow alone, under the craft too.
 */
export async function shootMatte(
  page: Page,
  shot: Pick<SiteShot, 'settings'>,
): Promise<{ master: Buffer; shadow?: Buffer }> {
  let size = { width: 0, height: 0 };
  const frame = async (actions: UnknownAction[]): Promise<Uint8Array> => {
    await dispatchActions(page, actions);
    await page.evaluate(() => (window as unknown as SkymapWindow).__skymap!.settled());
    const { data, info } = await sharp(await readCanvas(page, 'png'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    size = { width: info.width, height: info.height };
    return data;
  };
  const png = (data: Uint8Array) =>
    sharp(data, { raw: { ...size, channels: 4 } })
      .png()
      .toBuffer();

  let shadow: Buffer | undefined;
  if (shot.settings?.shadow) {
    const withShadow = await frame(hide([SHADOW_CASTER_PASS]));
    const without = await frame(hide([SHADOW_PASS]));
    shadow = await png(shadowLayer(withShadow, without));
    await dispatchActions(page, hide([SHADOW_CASTER_PASS, SHADOW_PASS], false));
  }
  const keep = shot.settings?.keepPasses ?? [];
  const sky = MATTE_HIDDEN_PASSES.filter((pass) => !keep.includes(pass));
  const black = await frame(hide([...sky, ...(shot.settings?.hidePasses ?? [])]));
  if (shot.settings?.matte === 'emissive') return { master: await png(emissiveMatte(black)) };
  const white = await frame([setMatteWhite(true)]);
  return { master: await png(differenceMatte(black, white)), shadow };
}
