# Mesh bodies: self-shadowing and a shadow on the ground

**Raised:** 2026-09-12, user visual pass on PR #693 (Mars rovers). User ruled:
backlog, not this PR.

The mesh shader (`shaders/bodies/meshBody/fragment.wesl`) has no shadow term of
any kind: the only occlusion is the CPU scalar `sunVisibleFraction` (host
umbra), the same analytic posture every body-lighting effect takes. A rover's
mast therefore lights the deck it stands on, the wheels light the chassis
above them, and the ground under the rover is as bright as the ground beside
it — the rover looks pasted onto Mars rather than standing on it.

## What it needs

- **Self-shadowing**: a per-body shadow map from the Sun's direction over the
  mesh's bounding sphere (one depth pass per drawn mesh body, ortho, a few
  hundred texels — the bodies are metres across). Sampled in the mesh fragment
  before the direct term.
- **Ground shadow**: the same map sampled by the HOST's surface fragment
  (`texturedBody`) for texels inside the body's footprint, so the rover casts
  onto Mars. A hostless body (a Voyager) has no ground and needs only the first.
- Both are Sun-only; host-shine and the ambient floor stay unshadowed.

Sequencing: after the PBR effort
(`docs/superpowers/specs/2026-09-12-mesh-body-pbr-design.md`), which reshapes the
mesh uniforms and bind groups the shadow map would join.
