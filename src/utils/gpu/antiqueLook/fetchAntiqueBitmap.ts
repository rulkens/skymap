/**
 * fetchAntiqueBitmap — one of the look's static images (ornament atlas, paper
 * tile) from `public/antique/`, decoded for `copyExternalImageToTexture`.
 * Fetched only when the look first draws: a session that never opens it pays
 * nothing. Same static-shell route as the font atlases (`loadFontAtlases`).
 */

const ANTIQUE_BASE = '/antique/';

export async function fetchAntiqueBitmap(file: string): Promise<ImageBitmap> {
  const response = await fetch(`${ANTIQUE_BASE}${file}`);
  if (!response.ok) throw new Error(`antique look: ${file} answered ${response.status}`);
  return createImageBitmap(await response.blob());
}
