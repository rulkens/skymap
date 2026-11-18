# CPU present route for domes on two graphics cards

**Raised:** 2026-11-17, on-site dome test. One system measured; no code from that day is in the repo.

## Symptom

A dome PC with two NVIDIA RTX A5000 cards (driver 31.0.15.5222) joined into one desktop, Windows 10 21H2,
Chrome 157. Chrome sees one display (2195 x 1852 at scale 3.5) and two adapters; GPU0 is active. The
projectors on the second card show the interface but never a WebGPU canvas. The `opacity: 0.99` field
test (#944) and `--disable-direct-composition` changed nothing.

## Measured on the second card's projectors

| Canvas | Result |
| --- | --- |
| WebGPU, any power preference, premultiplied or opaque | Black |
| WebGPU copied into a 2D canvas (`drawImage`) | Black |
| WebGPU handed to a bitmap canvas (`transferToImageBitmap`) | Black |
| WebGPU drawn into a 2D canvas asked to be software | Black |
| WebGL | Shows |
| 2D canvas | Shows |
| Interface (DOM) | Shows |
| WebGPU read back to the CPU, shown by a 2D canvas | Shows |
| WebGPU read back to the CPU, shown by WebGL | Shows |

## Verified in source (Chromium 157.0.8103.79, Dawn 106245fa)

- WebGPU defaults to Dawn's D3D12 backend on Windows. The compositor (Skia Graphite) defaults to Dawn
  D3D11 and shares ANGLE's D3D11 device, so compositor, 2D canvas and WebGL sit on one D3D11 device
  (`gpu/command_buffer/service/dawn_context_provider.cc`, `webgpu_decoder_impl.cc`).
- A WebGPU canvas's swap buffer is a D3D11 texture made on the compositor's device with a shared NT
  handle; Dawn's D3D12 device opens the handle and renders into it, with no copy
  (`webgpu_swap_buffer_provider.cc`, `shared_image/d3d_image_backing_factory.cc`, `d3d_image_backing.cc`,
  Dawn `SharedTextureMemoryD3D12.cpp`).
- A page cannot choose the card: WebGPU is tied to ANGLE's adapter, and `powerPreference` is ignored on
  Windows (`webgpu_decoder_impl.cc` `CreatePreferredAdapter`, Dawn `BackendD3D.cpp`,
  `modules/webgpu/gpu.cc`, crbug.com/369219127).
- Switches that exist in M157: `--skia-graphite-dawn-backend` (`d3d11`, `d3d12`, …;
  `gpu/config/gpu_switches.cc`), `--use-webgpu-adapter` (`service_utils.cc`), `--use-adapter-luid`
  (`ui/gl/gl_switches.cc`). `--skia-graphite-backend` does not exist. No switch puts WebGPU and the
  compositor on one device.

Inferred from the above, matching the table: WebGPU pixels are the only ones on the page that enter a
D3D11 texture from a D3D12 device.

## Not verified

- What the NVIDIA driver does per card. Two hypotheses fit every observation: (A) D3D11 work reaches both
  cards and D3D12 work one card; (B) D3D12 reaches both, but the shared handle opens on one card only.
  Neither is documented by NVIDIA or Microsoft.
- Whether the cards run NVIDIA Mosaic. A linked Mosaic should enumerate as one adapter; this PC shows
  two. Check the NVIDIA Control Panel on the dome PC.
- Whether the "software" 2D canvas was software; Chrome may not have honoured the request.
- `--use-webgpu-adapter=d3d11 --enable-unsafe-webgpu` (also with `--ignore-gpu-blocklist`) made
  `requestAdapter()` return null, though the source says it should yield an adapter. Re-run with
  `--enable-logging=stderr --v=1` and read Dawn Info in `chrome://gpu`.
- The desktop kiosk and dome app (`packages/desktop`, Electron) embeds Chromium, so the same exposure is
  expected. Not tested.

Bug search: no matching Chromium, Dawn, Electron or gpuweb issue found. Pages on issues.chromium.org
could not be opened, so crbug entries were read as search snippets only.

## Measured speed of the CPU route on that PC

| What | Square | Frames a second |
| --- | --- | --- |
| Test page, untuned (one read-back, copy per row, 2D canvas) | 2048 px | 40.7 |
| Test page, untuned | 4096 px | 10.7 |
| Test page, tuned (3 in flight, no row copy, WebGL) | 4096 px | 34–40 |
| Test page, tuned, 6 in flight | 4096 px | 30–37 |
| Skymap, shown | 2205 px | 56 median (340 samples) |
| Skymap, shown (drawn about 48) | 3528 px | 20 median (57 samples) |

## Prototype shape

WebGPU draws into an `OffscreenCanvas`; each frame `copyTextureToBuffer` then `mapAsync`; a WebGL2
context on the page canvas takes the bytes with `texSubImage2D`. Three read-backs in flight; more did not
help. It put Skymap on every projector. It was uncommitted test code behind a temporary URL switch.

## Why it needs design

At full sharpness (3528 px) the route shows 20 of about 48 drawn frames, too slow to fly. Ideas, none
measured: a compressed or chroma-subsampled read-back, a lower present resolution with upscale. Also
open: when the route turns on (a switch, or detection), and what it costs on single-card machines.

## Next dome visit, before any build

Start Chrome with `--skia-graphite-dawn-backend=d3d12`, confirm the Skia backend row in `chrome://gpu`,
then look at the second card's projectors without the CPU route:

| Seen | Meaning |
| --- | --- |
| WebGPU and interface show, WebGL black | The cross-API share is the broken link (B); WebGL is the price |
| Whole window black | D3D12 output never reaches the second card (A) |
| Everything shows | The switch is the fix; no CPU route needed |

## Ruling (owner, 2026-11-17)

The switch test comes first. Whether to build the CPU route is decided after it.
