# Barycentric orbit pairs (+ Pluto's minor moons)

From the [add-Pluto/Charon grill session](../grill-sessions/add-pluto-charon-2026-08-16.md) (Q3, Q5).

## Problem

The focus graph is strictly one-hop: `OrbitalElements.focusId` makes a body orbit its parent's *center* (`src/services/engine/frame/deriveBodyStates.ts` resolves positions along `focusResolveOrder`). Real binary-ish systems orbit a shared barycentre:

- **Pluto–Charon**: Charon is ~12% of Pluto's mass; the barycentre sits ~1.8 Pluto radii *outside* Pluto. The shipped model (Charon as a Moon-style satellite of Pluto) pins Pluto at its heliocentric position — an error of ~10% of the pair separation, visible only when parked near the barycentre with time running. The same approximation already applies to Earth–Moon (Earth doesn't wobble around the EMB), just less visibly.
- **Pluto's minor moons** — Styx, Nix, Kerberos, Hydra — orbit the *barycentre*, not Pluto, at wider radii where the approximation grows proportionally worse. They are deliberately absent until this lands (grill Q5): four sub-pixel irregular rocks drawn dishonestly around Pluto's center add clutter without honesty.

## Shape of a fix

An invisible barycentre node in the focus graph that both partners orbit. Touchpoints that currently assume focus-graph nodes are visible bodies: pick tables (`resolvePickTable.ts` maps source → seed table by index), region extents (`bodyRegions.ts` maxes over members), labels/captions (every `SCENE_PLANETS` row gets one), glint partition. Either a `visible: false` body kind or a separate node table that only `deriveBodyStates` sees.

## Follow-on once landed

- Let Pluto (and optionally Earth) wobble: re-parent Pluto → `pluto-barycentre` with a ~2,035 km semi-major element row; delete the "looks wrong, don't fix" comment on Charon's row.
- Add Styx/Nix/Kerberos/Hydra as ordinary satellite rows parented on the barycentre node (no textures — no usable maps exist; flat albedo + glint only).
