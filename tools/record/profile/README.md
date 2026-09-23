# Dome recorder profilers (scratch)

Throwaway measurement scripts from the 2026-09-23 "why does a dome take cost
0.62 s/frame" investigation. Run from the repo root against a running server
(`URL=http://localhost:5174` to override the default `:5173`):

| Script               | Measures                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prof-dome.mts`      | the recorder loop on the real app (`?cinema&dome`): per-stage ms (poll, grant, capture, base64 decode, ffmpeg write), rAF callbacks and `GPUQueue.submit` calls **per virtual-time grant**. `SIZE=4096 FRAMES=30`; `DOME=0` for mono; `NOENC=1` skips ffmpeg. |
| `prof-gpu.mts`       | per-slot GPU timings under `?perf&dome`, summed per dome face vs the once-scope steps. `SIZE`, `FRAMES`, `Q` (query string).                                                                                                                                  |
| `prof-synth.mts`     | capture + encode on a synthetic 4096² dome frame (`synth.html`), no engine. `MODE=jpeg` (the recorder's path) or `MODE=raw` (getImageData + HTTP POST).                                                                                                       |
| `prof-webcodecs.mts` | which H.264/HEVC/AV1 `VideoEncoder` configs the recorder's Chromium accepts at 4096², and their throughput.                                                                                                                                                   |

```bash
SIZE=4096 FRAMES=30 npx tsx tools/record/profile/prof-dome.mts
```

Container findings (4-core Linux, SwiftShader, synthetic frame — ratios, not Mac
numbers): 3–9 rAF per 33 ms grant on a trivial page; JPEG q100 capture 618 ms;
current dome ffmpeg argv 557 ms/frame (JPEG decode + range scale 70, libx264
`medium` 380, `veryfast` 71, `superfast` 49, equal PSNR on the synthetic
frame); raw getImageData + POST 6.7 s; Playwright Chromium has no H.264
WebCodecs encoder (AV1 only).
