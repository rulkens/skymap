/**
 * /api/process/alpha-only — re-run only the alpha pass against the
 * cached starless.png from a previous /api/process call.  Used by the
 * UI to give live preview as the alpha sliders move, without paying
 * the 8-15 s StarNet cost per drag.
 *
 * Throws if starless.png is missing — that means the maintainer hit
 * the alpha sliders before running Process at least once.  The UI
 * should keep the Process button orange-dotted until Process succeeds,
 * so this error is a UI bug guard rather than user-facing prose.
 */
import sharp from 'sharp';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sessionPath } from '../tmpSession.ts';
import { applyLuminanceAsAlpha } from '../../../utils/image/applyLuminanceAsAlpha.ts';

const PREVIEW_PX = 512;

export type ProcessAlphaOnlyBody = {
  tmpId: string;
  alpha: { blackPoint: number; whitePoint: number; gamma: number };
};

export type ProcessAlphaOnlyResult = {
  alphaPreviewUrl: string;
};

export async function handleProcessAlphaOnly(opts: {
  body: ProcessAlphaOnlyBody;
  /** Test hook — defaults to sessionPath(tmpId). */
  sessionDirOverride?: string;
}): Promise<ProcessAlphaOnlyResult> {
  const { body } = opts;
  // `dir` resolves to the session directory written by a prior /api/process
  // call.  In production it comes from the tmpId; in tests an injected
  // mkdtempSync dir is used so no OS-level tmp setup is needed.
  const dir = opts.sessionDirOverride ?? sessionPath(body.tmpId);
  const starlessPath = resolve(dir, 'starless.png');

  // Guard: starless.png must exist before alpha-only is valid.  We throw
  // rather than silently returning an empty result because the caller (UI)
  // should have gated the alpha slider on a successful /api/process first.
  if (!existsSync(starlessPath)) {
    throw new Error(
      `starless.png missing for tmpId=${body.tmpId}.  Run /api/process before /api/process/alpha-only.`,
    );
  }

  // Read the cached starless PNG at full resolution so the alpha mask
  // retains maximum sharpness.  ensureAlpha() guarantees 4 channels even
  // if the file was saved as RGB.  We need raw bytes because
  // applyLuminanceAsAlpha operates on a Uint8ClampedArray.
  const { data, info } = await sharp(starlessPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  applyLuminanceAsAlpha(rgba, info.width, info.height, body.alpha);

  // Encode the post-alpha-pass buffer as a WebP preview.  We intentionally
  // do NOT write back to starless.png — the alpha pass is non-destructive
  // so the maintainer can re-run it with different slider values without
  // re-running StarNet.  Quality 82 + alphaQuality 90 matches /api/process.
  const alphaPreview = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(PREVIEW_PX, PREVIEW_PX, { fit: 'inside' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  writeFileSync(resolve(dir, 'alpha.webp'), alphaPreview);

  // ?v=<ms> is a defence-in-depth cache-buster — the preview route
  // already sends `Cache-Control: no-store`, but adding a unique query
  // string guarantees a re-fetch even through aggressive intermediate
  // caches or service workers a future setup might introduce.
  return { alphaPreviewUrl: `/api/preview/${body.tmpId}/alpha.webp?v=${Date.now()}` };
}
