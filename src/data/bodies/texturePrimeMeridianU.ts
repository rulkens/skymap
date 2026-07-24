/**
 * TEXTURE_PRIME_MERIDIAN_U — the equirectangular-map registration offset that
 * puts the prime meridian (geographic longitude 0) at the texture's CENTRE
 * column, where every standard planetary map (Blue Marble, the Solar System
 * Scope set, the USGS Galilean maps) paints it. A raw `u = lon / 2π` would land
 * the ANTIMERIDIAN on the local +x axis the IAU rotation aims a body's prime
 * meridian at, rotating the whole surface 180° about the pole — continents on
 * the wrong hemisphere, the day/night terminator reading inverted against a live
 * clock, and a tidally-locked Moon showing its FAR side to Earth. Adding this
 * offset re-registers the map.
 *
 * ### One convention, three sites — greppable, not importable
 *
 * The same `+0.5` fact is encoded in three places that cannot share this symbol,
 * because one of them is a WESL shader and WESL cannot import a TS constant:
 *
 *   1. `src/utils/math/uvSphereMesh.ts` — bakes it into the shared sphere's
 *      vertex `u` (the textured planets, the Moon and the Galileans, Earth's
 *      cloud deck).
 *   2. `src/utils/math/cubeSphereMesh.ts` — bakes it into the Earth-only mesh's
 *      vertex `u`.
 *   3. `src/services/gpu/shaders/bodies/earth/fragment.wesl` — `dirToEquirectUv`
 *      re-encodes it to sample the identical texel a mesh vertex would, for the
 *      ground-shadow crossing point that has no interpolated uv.
 *
 * Sites 1 and 2 import this constant and are pinned by `uvSphereMesh.test.ts`
 * (lon 0 → u 0.5) and `tests/services/engine/frame/earthTerminator.test.ts` (the
 * terminator reads correct only if the mesh uv is registered right). The shader
 * half (site 3) has no TS-importable link, so it is guarded the honest minimum
 * way: that same terminator test exercises the shading path, and its comment
 * names the literal token `TEXTURE_PRIME_MERIDIAN_U` plus the other two sites, so
 * a `grep` for the token surfaces every place that must move together if the
 * map-authoring convention ever changes.
 */

/** Equirectangular u offset registering longitude 0 to the map centre (u = 0.5). */
export const TEXTURE_PRIME_MERIDIAN_U = 0.5;
