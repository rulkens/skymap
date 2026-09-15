/** `TileStreamDeps<ImageBitmap>.release` — frees a bitmap that arrived
 *  after the stream was destroyed and so has nowhere to be uploaded. */
export function closeBitmap(bitmap: ImageBitmap): void {
  bitmap.close();
}
