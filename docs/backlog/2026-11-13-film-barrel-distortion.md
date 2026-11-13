# Film look: anamorphic barrel distortion

The film-look spike (branch `spike/film-look`, 2026-11-12) warped the tone-map's source read toward the
edges, more along the squeeze axis with the corner pinned (`uv = 0.5 + (uv − 0.5)·(1 + k·r²)/(1 + k)`,
`k = (distortion, distortion / squeeze)`). It was dropped from the production spec
(the 2026-11-13 film-look spec, R3) because the label, ring and marker overlays
draw after the tone-map on the swap chain and stayed put while the scene moved under them.

To bring it back the overlays need the same warp: either draw them before the film pass (an HDR-space
overlay target folded in ahead of the grade, which also lets grain and vignette touch them) or hand the
overlay shaders the same remap. Decide which with the overlays-under-film question, then re-add
`distortion` to `FilmGrade` as a uniform lane and a DebugPanel slider (0–0.3, default 0).
