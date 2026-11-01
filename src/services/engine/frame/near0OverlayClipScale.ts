/**
 * near0OverlayClipScale — the uniform clip scale the NEAR0 overlays (captions,
 * leader lines, selection ring, mission trails) multiply their eye-relative-Mpc
 * vp by. NDC is invariant under it; what it sets is the MAGNITUDE of clip `w`,
 * which rasterizers only interpolate faithfully inside a band (SwiftShader:
 * ~1e-12 … 1e11; hardware is wider but not unbounded). 1/near pins the nearest
 * drawn content at w = 1 and the farthest at far/near (≤ ~1e6 under
 * `foregroundFrustum`), whatever the camera's scale. The old fixed metre scale
 * put a caption 100 pc out at w ≈ 1e18, past the band: sheared glyph garbage.
 */

export function near0OverlayClipScale(nearMpc: number): number {
  return 1 / nearMpc;
}
