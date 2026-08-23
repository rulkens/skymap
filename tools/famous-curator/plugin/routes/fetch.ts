/**
 * /api/fetch handler.
 *
 * Two input shapes:
 *
 *   { url: 'https://...' }  — download via imageFetcher, then write.
 *   { bytes: Buffer, mediaType: 'image/jpeg' }  — multipart drag-drop
 *                                                  path; bytes already in
 *                                                  hand, just write.
 *
 * Outputs (on disk in the session dir):
 *
 *   source.png  — full-resolution PNG, the canonical input for StarNet
 *                 (the spec discusses 8-bit; PNG is lossless + sharp
 *                 handles it).
 *   source.webp — 512² preview for the canvas (resized + encoded).
 *
 * Returns the tmpId + true source dimensions + preview URL.  Caller
 * (the apiPlugin route table) sets the response headers + body.
 *
 * Note: files are written to `session.dir` (the value returned by the
 * sessionFactory), NOT via sessionFilePath().  This is intentional: the
 * factory owns where the dir lives, and we consume that contract rather
 * than re-deriving the path ourselves.  For real sessions, `session.dir`
 * and `sessionFilePath(session.tmpId, …)` resolve to the same location,
 * but using `session.dir` directly keeps the handler honest and testable
 * with any injected factory (e.g. mkdtempSync in tests).
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 50 * 1024 * 1024;
const PREVIEW_PX = 512;

export type FetchBody = { url: string } | { bytes: Buffer; mediaType: string };

export type FetchResult = {
  tmpId: string;
  width: number;
  height: number;
  previewUrl: string;
  mediaType: string;
};

export type ImageFetcher = (url: string) => Promise<{ bytes: Buffer; mediaType: string }>;
export type SessionFactory = () => { tmpId: string; dir: string };

export async function handleFetch(opts: {
  body: FetchBody;
  imageFetcher: ImageFetcher;
  sessionFactory: SessionFactory;
}): Promise<FetchResult> {
  let bytes: Buffer;
  let mediaType: string;

  if ('url' in opts.body) {
    const fetched = await opts.imageFetcher(opts.body.url);
    bytes = fetched.bytes;
    mediaType = fetched.mediaType;
  } else {
    bytes = opts.body.bytes;
    mediaType = opts.body.mediaType;
  }

  // Guard: reject before decoding so we don't waste time on giant buffers.
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`source exceeds 50 MB limit (${bytes.byteLength} bytes)`);
  }

  // Guard: only accept image/* content types.  text/html or application/json
  // arriving here means the fetch URL was an error page, not an image.
  if (!mediaType.startsWith('image/')) {
    throw new Error(`source is not an image (Content-Type: ${mediaType})`);
  }

  // Allocate the session dir only after the guards pass — no leftover
  // empty dirs from rejected requests.
  const session = opts.sessionFactory();

  // Decode once to confirm validity + extract dimensions.  sharp validates
  // the image header; an unreadable file throws here, not later.
  const meta = await sharp(bytes).metadata();
  if (typeof meta.width !== 'number' || typeof meta.height !== 'number') {
    throw new Error('source has no decodable dimensions');
  }

  // Write the full-resolution PNG (transcode JPEG→PNG so StarNet always
  // sees a lossless input — sharp's PNG re-encoder is fast enough that
  // this isn't a meaningful cost for source images up to ~50 MB).
  const pngBytes = await sharp(bytes).png().toBuffer();
  writeFileSync(join(session.dir, 'source.png'), pngBytes);

  // Write the preview WebP (fit-inside, no crop, transparent letterbox).
  // 512² is large enough for the curator canvas; quality 85 keeps it small.
  const previewBytes = await sharp(bytes)
    .resize(PREVIEW_PX, PREVIEW_PX, { fit: 'inside' })
    .webp({ quality: 85 })
    .toBuffer();
  writeFileSync(join(session.dir, 'source.webp'), previewBytes);

  return {
    tmpId: session.tmpId,
    width: meta.width,
    height: meta.height,
    previewUrl: `/api/preview/${session.tmpId}/source.webp`,
    mediaType,
  };
}
