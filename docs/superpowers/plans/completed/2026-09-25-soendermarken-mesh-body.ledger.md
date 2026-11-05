# Ledger — 2026-09-25-soendermarken-mesh-body

Plan: docs/superpowers/plans/2026-09-25-soendermarken-mesh-body.md · PR #827 (draft) · branch worktree-soendermarken-mesh-body

Ruling: parallelism 1 plan, perf gate OFF — user afk, asked to proceed autonomously — cost if wrong: an unmeasured frame cost of a 470k-tri body, measurable later.

Dispatches:
- D1 Tasks 1–3 (prep) · Sonnet · BASE 6b673613b → 4efe874d5 · done · 102 tool calls · deviations: 3 extra test fixtures got `seat`, DEPLOY.md had no row text, generic `orderedTiers<T>`
- D2 Tasks 4–8 (build + rows + bake) · Sonnet · BASE 4efe874d5 → f76ea328a · done · 320 tool calls · small 149,997 / medium 470,046 tris, r 162.6 m, mean n.z 0.415, mask 442×502; deviations: Earth radius = SCENE_EARTH datum 6,371,000; simplify async; no weld fallback; two-pass bootstrap bake; perseverance site-height drift 3e-5 m hand-restored (worktree Mars tiles differ)
- D3 Tasks 9–12 (runtime + shader + docs) · Opus · BASE f76ea328a → da7bdfefb · done · 7095 targeted tests + naga validate of 3 linked shaders; deviations: mask owned by meshBodyRenderer (`holeMaskOf`), `holedMeshBodyByHost` data module, textureSampleLevel, failed `_hole` fetch fails the mesh load
- Final review · Opus · done · 28 tool calls · 5/5 review-focus clean, geo maths correct; 14 findings (1 bug: hole cut while mesh undrawn; 1 bug-risk: simplify unlocked border) — fix round split runtime (D3 agent, findings 1,8r,9,11,12) → build (fresh Sonnet, 2–8,10,13,14 + rebake)
- Fix runtime · Opus (D3 resumed) · → 62e3b5779 · done · 17 tool calls
- Fix build · Sonnet · → 8da1c5eae · done · small 149,998 tris with LockBorder; only soendermarken outputs changed
- Merge origin/main (#825 conflict in docs/RENDERER.md, kept both) → 4cf61ecbd · CI green
- Smoke round 1 (user, 2026-09-26): park very dark → scan GLB had glTF default metallicFactor 1 (rough metal, no diffuse). Fix 5fd3ea3cf: packMeshGlb writes metallicFactor 0; re-ran crop-mesh, replaced raw GLB + sha256, rebaked (only soendermarken files changed). If still darker than terrain: next lever = flatten scan shading normals toward up (mesh has no ambient floor; normals noisy, mean n.z 0.42).
- User ruling: geo (anchored) meshes carry no caption → c2811c4bc (sceneBodyLabels filters ANCHORED_MESH_BODY_IDS).

- Smoke round 2 (user, 2026-09-30): ruled DROP the terrain hole (tiles drawn under the scan) + lift 0.8 m via the site row's altitudeM → 3bccf9f75 (hole path deleted, ~-740 LOC) + bef276f56 + 99707f9fd (lift applied at runtime like any site; bake keeps bare anchor height). CI green. Open offer: drop anchored scans from the glint list (park becomes a dot below 3 px ≈ 160 km).

- /feature-done (2026-10-01): suite 14,833 green, typecheck clean; deletion audit −220 LOC found, safe-now −105 applied in 1b8a27b88 (output byte-identical); needs-ruling A–F + drop-glint ruled LEAVE by user. READY.

NEXT: user re-smokes on :5173 (dev server = bg task in the controller session; restart with `npm run dev` in the wt if gone) → /feature-done → merge on explicit word → add meshes/soendermarken-* + _hole to main's public/data, rebuild manifest, sync-r2-secure from main. No agents in flight.
