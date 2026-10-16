# Pick targets are canvas-sized to read one texel

**Readiness:** `needs-design`. **Surfaced:** 2026-10-13, [GPU memory audit](../research/engine/gpu-memory-audit-2026-10-13.md) finding 2.

Step 1 is #899: every slab shares one r32uint colour texture and one depth per
format (12 B/px instead of up to 32), and each pass is scissored to the cursor texel.
What remains is the textures' size: still canvas-sized, 25 MB at 1080p and 100 MB at
4K, to read one texel per slab. Debug pick targets (`debugTargets`) are evicted only
inside `renderForDebug`, so they outlive the overlay.

## Direction

Render into a small fixed target through a cropped projection: every pick shader
takes clip' = C · clip (scale the cursor's pixel to the target), and its viewport-size
uniform becomes the target's size, which keeps pixel-sized billboards and sub-pixel
culls exact. Needs a spec: it touches every pick pipeline's uniforms. Open: whether
the pick pad survives as a few-pixel target or becomes a shader-side radius.
