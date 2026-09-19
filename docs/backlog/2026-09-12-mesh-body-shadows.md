# Mesh bodies: sun shadows (self-shadowing and a cast ground shadow)

**Raised:** 2026-09-12, user visual pass on PR #693 (Mars rovers). User ruled:
backlog, not this PR.

The mesh shader (`shaders/bodies/meshBody/fragment.wesl`) has no shadow term of
any kind: the only occlusion is the CPU scalar `sunVisibleFraction` (host
umbra), the same analytic posture every body-lighting effect takes. A rover's
mast therefore lights the deck it stands on, the wheels light the chassis
above them, and the ground under the rover is as bright as the ground beside
it — the rover looks pasted onto Mars rather than standing on it.

## Stage 1 — contact shadow: MOVED

The soft dark blob under each hosted rover moved to
[mesh-body-contact-decal](2026-09-18-mesh-body-contact-decal.md): the same Cycles
bake that darkens a rover's underside already produces the decal texture.

## Stage 2 — sun shadows

- **Self-shadowing**: a per-body shadow map from the Sun's direction over the
  mesh's bounding sphere (one depth pass per drawn mesh body, ortho, a few
  hundred texels — the bodies are metres across). Sampled in the mesh fragment
  before the direct term.
- **Ground shadow**: the same map sampled by the HOST's surface fragment
  (`texturedBody`) for texels inside the body's footprint, so the rover casts
  onto Mars. A hostless body (a Voyager) has no ground and needs only the first.
- Both are Sun-only; the environment term stays unshadowed.

Sequencing: the PBR effort this waited on has shipped — the mesh shader carries
`envSplitSum` and the probe — so the mesh uniforms and bind groups a shadow map
would join are settled.
