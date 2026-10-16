/** Free a decoded bitmap nothing will upload: a tile-stream arrival after
 *  destroy, or an asset-slot payload superseded before its commit. */
export function closeBitmap(bitmap: ImageBitmap): void {
  bitmap.close();
}
