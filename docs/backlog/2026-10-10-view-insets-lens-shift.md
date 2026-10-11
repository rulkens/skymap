# View centre avoids the UI (lens shift)

## Origin

Noticed in the Voyager mission exhibit (PR #854): the view centre should sit left of the right-hand info sidebar on desktop, and higher on mobile where the bottom of the page is UI. This is general, not only for missions.

## Rulings (user, 2026-10-10)

- **Lens shift via an off-centre frustum.** Not moving the camera target, and not shrinking or translating the canvas: the whole canvas still renders and the orbit pivot stays on the subject.
- **Panels register their measured rect** (e.g. a ResizeObserver hook) rather than fixed per-layout insets, so the shift follows open/close/rotation. Ease the shift when insets change.
- **Framing fits the subject inside the uncovered area:** exhibit fit (`sphereFitDistance`), the mission camera, and focus fly-to.
- **Applies always,** from whatever covers the view: the desktop sidebar and the mobile bottom UI alike.
- **Lands as its own PR off main.**

## Seam

- `ViewFrustum` is already in tangent form (`tanLeft`/`tanRight`/`tanDown`/`tanUp`).
- `src/utils/camera/mainViewSpec.ts` builds the main view's frustum via `symmetricFrustum`.
- `lib/camera.wesl` and `apparentSizePx` are already tangent-exact for an asymmetric frustum; dome and face view specs share the type.

## First step

Run the `refactor-ground` pass: sweep the CPU paths that assume a symmetric main view (picking/unproject, label projection, culling, `sphereFitDistance`, the galaxy-field `FieldCamera`, anything reading `fovY`/`aspect` directly). Then spec, then plan.
