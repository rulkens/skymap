# Cloud shell borrows the globe's cloud texture

**Readiness:** `ready`.

Earth's cloud map reaches the GPU twice. `commitBodyTexture` (`src/layers/body/textures/load/bodyTextureSlots.ts:29-33`)
hands the one bitmap to `earthRenderer.setMap('clouds', …)` (ring shadow, night occlusion, cloud shadows) and to
`cloudShellRenderer.setTexture(…)` (`src/layers/body/clouds/render/cloudShellRenderer.ts:192-214`), which creates,
uploads and mips its own copy. At the large tier that is a second 8192×4096 r8 texture with mips (~45 MB) and a second
upload on every daily-map or tier swap.

`surfaceTilesPass.ts:78` already borrows the globe's: `earthRenderer.getMapView('clouds')`
(`src/layers/body/earth/render/earthRenderer.ts:330`). The shell can do the same: drop its texture, sampler-only bind
group, and rebuild the bind group from `getMapView('clouds')` when the globe's map changes.

Check before the swap: both copies upload with `flipY: true` and a full mip chain in the same format today; keep it so,
or the shell and its shadow drift apart. The slot's commit/release then touches one sink for clouds, and the
`bodyTextureSlots.test.ts` "fans ONE bitmap to both" cases change with it.
