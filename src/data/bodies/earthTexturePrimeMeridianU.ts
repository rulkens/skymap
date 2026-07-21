/**
 * EARTH_TEXTURE_PRIME_MERIDIAN_U — the equirectangular-map registration offset
 * that puts the prime meridian (geographic longitude 0) at the texture's CENTRE
 * column, where every standard planetary map (Blue Marble and the rest) paints
 * it. A raw `u = lon / 2π` would land the ANTIMERIDIAN on the local +x axis the
 * IAU rotation aims a body's Greenwich at, rotating the whole surface 180° about
 * the pole (continents on the wrong hemisphere, the day/night terminator reading
 * inverted against a live clock). Adding this offset re-registers the map.
 *
 * ### One convention, three sites — greppable, not importable
 *
 * The same `+0.5` fact is encoded in three places that cannot share this symbol,
 * because two of them are WESL shaders and WESL cannot import a TS constant:
 *
 *   1. `src/utils/math/cubeSphereMesh.ts` — bakes it into the Earth-mesh vertex
 *      `u` (imports THIS constant, the single TS home).
 *   2. `src/services/gpu/shaders/bodies/earth/fragment.wesl` — `dirToEquirectUv`
 *      re-encodes it to sample the identical texel a mesh vertex would, for the
 *      ground-shadow crossing point that has no interpolated uv.
 *   3. `src/services/gpu/shaders/bodies/cloudShell/fragment.wesl` — re-encodes it
 *      for the cloud deck, which rides the shared `uvSphereMesh` (no baked offset).
 *
 * Site 1's use of this constant is pinned end-to-end by
 * `tests/services/engine/frame/earthTerminator.test.ts` (the terminator reads
 * correct only if the mesh uv is registered right). The two shader halves (sites
 * 2 & 3) have no TS-importable link, so they are guarded the honest minimum way:
 * that same terminator test exercises the shading path, and each shader comment
 * names the literal token `EARTH_TEXTURE_PRIME_MERIDIAN_U` plus the other two
 * sites, so a `grep` for the token surfaces every place that must move together
 * if the map-authoring convention ever changes.
 */

/** Equirectangular u offset registering longitude 0 to the map centre (u = 0.5). */
export const EARTH_TEXTURE_PRIME_MERIDIAN_U = 0.5;
