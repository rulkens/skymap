# Heliospheric current sheet Layer ("ballerina skirt")

**Origin:** brainstorm 2026-10-04 on what to show between the solar system and the nearest stars. A render spike proved the look and the data: [`docs/research/heliospheric-current-sheet/`](../research/heliospheric-current-sheet/README.md) (offline film, 1976–2025). User ruling 2026-10-05: the heliosphere shell and light-time rings are built first; this follows inside that shell.

## What it would be

A Layer drawing the Sun's heliospheric current sheet — the warped surface separating outward from inward magnetic field — driven by the TimeBar. Scrubbing across years shows it flatten at solar minimum, fold up at maximum, and turn inside out when the poles flip (about every 11 years).

## What already exists

- **Data path:** `npm run fetch-wso` and `npm run build-current-sheet-maps` (`tools/fetch/fetchWso.ts`, `tools/parsers/parseWso*.ts`, `tools/heliosphere/`). 661 Carrington rotations (CR 1642–2302) of Wilcox Solar Observatory source-surface maps, each a 72 × 30 grid, with rotation start times. Provenance in [`data/raw/wso/README.md`](../../data/raw/wso/README.md).
- **Look:** the spike's `render.html` (WebGL2): marching-tetrahedra B = 0 surface, additive Fresnel tinted by the polarity each side faces, Parker-spiral field lines, bloom.

Today the build emits only the spike's `hcs.js`; there is no `public/data/` artefact and no renderer code in `src/`.

## Open design questions

- **Meshing cost.** The spike rebuilds a 150 × 144 × 30 volume and a ~200k–430k-triangle surface on the CPU every frame (~0.4 s). Live options: bake one mesh per rotation offline (661 meshes; size unmeasured), or do it on the GPU. The sheet is single-valued in latitude only near solar minimum, so a heightfield over (r, φ) does not cover maximum.
- **Time model.** The film strobes at one sidereal rotation (25.38 d) per frame so the Sun's spin cancels. At TimeBar rates near real time the sheet co-rotates every 25 days; at years-per-second it must not blur. How the Layer samples time across those rates is undecided.
- **Scale and fade.** The sheet spans roughly 0.1 AU to the termination shock (~90 AU). It needs a fade row between the planets and the heliosphere shell, and an outer cutoff tied to that shell.
- **Honesty.** Only the neutral line at 2.5 R☉ is from data, and that is itself WSO's potential-field model of measured photospheric fields. Everything outward is an ideal constant 400 km/s Parker spiral. The UI must say so.
- **Format.** Whether the baked product is a new binary family or reuses SHEL (the Local Bubble shell format) per rotation.

## Blocker before shipping data

WSO has a data use policy, not a licence: notify, acknowledge, send resulting papers; it is written for research and is silent on redistribution. Ask J. T. Hoeksema before WSO-derived data ships in the public app (details in `data/raw/wso/README.md`).
