# Reddit — r/WebGPU

## Target

- **Submit URL:** `https://www.reddit.com/r/WebGPU/submit`
  _(source: https://reddit.com/r/WebGPU/ — confirmed active subreddit; retrieved 2026-05-06)_
- **Members:** small but on-topic. Reddit's Sept 2025 metrics change replaced public member counts with rolling-28-day-active-visitor numbers, so the subreddit's exact subscriber count is no longer surfaced in the sidebar. _(source: https://docs.bsky.app and Reddit's own modnews announcement; retrieved 2026-05-06)_ Engagement here is qualitatively different from r/Astronomy or r/dataisbeautiful — much smaller audience, but every reader is a graphics engineer who actually cares about the implementation.
- **Best window:** Day 3 of the campaign. By this point the r/Astronomy and r/dataisbeautiful posts are spent; r/WebGPU is the engineering-focused finale, and a separate-day stagger keeps Reddit's spam detection from flagging cross-sub posts.
- **Angle:** graphics engineering. Lead with the things that are interesting to read about as WebGPU code.

## Send checklist

- [ ] Read the current r/WebGPU posting rules — small subs sometimes have unwritten norms, and a quick sidebar read avoids friction.
- [ ] Open `https://www.reddit.com/r/WebGPU/submit` while logged in.
- [ ] Choose **Link** post type.
- [ ] Paste the **Title** below.
- [ ] Paste `https://github.com/rulkens/skymap` as the URL (the repo is the main draw for this audience, not the live demo).
- [ ] Paste the **Body** below into the post body.
- [ ] Submit.
- [ ] Update this file's `Status:` line to `sent YYYY-MM-DD URL=<permalink>`.

## Title

```
Skymap: instanced billboards + GPU picking + per-instance texture quads, ~3.5M galaxy points
```

## Body

```
Sharing a WebGPU project I've been building — happy to talk
implementation.

What's interesting graphics-wise:

- ~3.5M instanced point billboards across three surveys (SDSS, 2MRS,
  GLADE), one draw call per source, 52-byte / 13-slot per-instance
  vertex stride
- r32uint pick texture + copyTextureToBuffer for hover/click across
  the full set, sub-millisecond
- 2048x2048 LRU texture atlas with 16x16 grid of 128x128 slots
  (256 thumbnails); thumbnails streamed in based on per-galaxy
  apparent-pixel-size gating
- Render-on-demand main loop — idles cleanly when nothing's moving;
  CPU drops to ~0% when the camera is still
- Three-pass per-galaxy LOD (point billboard -> procedural 3D-oriented
  disk impostor -> textured thumbnail) with a smooth-step crossfade
  band where the per-galaxy alpha contributions sum to exactly 1.0

A bug that took me a week: queue.writeBuffer ordering isn't preserved
across submits in the same frame. Per-instance state has to be in the
vertex buffer, not a mid-frame-mutated uniform.

Live: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap (MIT, didactic comments
throughout)
DOI: https://doi.org/10.5281/zenodo.20037028
```

_Editorial note vs. the original draft: the draft said "28-byte
per-instance vertex stride" and "2048x2048 LRU texture atlas with
128x128 slots". Both numbers were stale. The current vertex stride
in `src/services/engine/buildPointInterleavedBuffer.ts` is
`SLOTS_PER_POINT = 13` × 4 = 52 bytes; the atlas is 2048×2048 carved
into a 16×16 grid of 128×128 slots = 256 slots total
(`src/services/gpu/textureAtlas.ts`). Updated to match the source._

## Maintenance

- [ ] Smaller sub means fewer comments but higher signal — engage with anyone who asks an implementation question, even if they're just curious about a single line in a shader.
- [ ] If a comment turns into a long technical thread, consider promoting the resolution back into the README or a dedicated `docs/` write-up.

## Status

`pending`

> Audit pass: 2026-05-06 — submit URL active; vertex stride re-verified at 52 bytes / 13 slots in `src/services/gpu/pointRenderer.ts` (`SLOTS_PER_POINT = 13`, `POINT_STRIDE = SLOTS_PER_POINT * 4 = 52`); atlas re-verified at 2048×2048 with 16×16 grid of 128×128 slots = 256 slots in `src/services/gpu/textureAtlas.ts`.

