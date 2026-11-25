# Mesh bodies in terrain shadow (with self-shading)

**Raised:** 2026-11-25. The owner ruled this a follow-up PR after terrain horizon shadows, paired
with mesh self-shading.

**Blocked by:** the terrain horizon shadows feature PR (horizon tiles + atlas).

## Terrain → mesh

`meshBody/fragment.wesl:59-61` dims direct sun by `uniforms.sunVisibleFraction`, a CPU scalar
that only knows host umbra (`src/utils/occlusion/sunVisibleFraction.ts`). A rover is metres
across and terrain shadows are tens of metres, so the plan is one horizon lookup per mesh body,
at its anchor:

- the CPU finds the drawn leaf under the anchor (the cut already resolves each leaf's horizon
  rect) and passes that rect plus the anchor's uv in the mesh uniforms;
- the mesh shader reads the horizon there with the terrain's own lookup and multiplies the disc
  visibility into the direct term. One value per body keeps the mast and deck in step with the
  ground beneath them.

Cost: the horizon atlas binding on the mesh pipeline and a few uniform fields.

## Self-shading in the same PR

Self-shadowing and a cast ground shadow: stage 2 of
[Mesh bodies: sun shadows](2026-09-12-mesh-body-shadows.md) and
[Self-shadowing for mesh bodies](2026-11-03-mesh-body-self-shadowing.md). Design those together
with the terrain term, so all three dim the same direct term in one place.

Not covered: the environment probe still reflects a sunlit scene.
