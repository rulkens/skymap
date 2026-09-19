# Mesh bodies: the contact decal

**Raised:** 2026-09-18, split from the mesh-body AO item once the AO bake landed.
Stage 1 of [mesh-body-shadows](2026-09-12-mesh-body-shadows.md); that item keeps
stage 2.

The data already ships. `meshPrebake.py` bakes the seated ground plane's own AO with
the body as occluder into `<key>.prebaked.contact.png`, and stamps the plane on the
GLB node as `extras.contactDecal {centre, u, v}` in the glTF source frame (+Y up).
Sun-independent, so one texture serves every hour. Nothing draws it yet.

Ruled 2026-09-19: a **projected box decal**, contact-shadow specific (no general
decal stage). Draw a box per seated mesh body with the body's model matrix,
reconstruct the ground position from depth in the rover-local frame, multiply-blend
the texture. No offset, no z-fighting, no coupling to terrain tiles or their LOD.

Findings for the design:

- `foreground:0` depth is `RENDER_ATTACHMENT` only (`renderTargets.ts:105-118`) — it
  needs `TEXTURE_BINDING` to be sampled; `executeFrame` already has an unused
  `depth: 'sample'` step mode.
- Order: after `'surface-tiles'`, before `'atmosphere-shell'` (`frameOrder.ts:216-229`),
  so aerial perspective lands over the decal; mesh bodies still draw last.
- `buildMeshes.ts` must carry `contact.png` and the decal box, converted into the body
  frame, to `public/data/meshes/`.

## Ground preparation

Not run. `refactor-ground` goes before the spec.
