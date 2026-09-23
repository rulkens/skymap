# How OpenSpace drives a multi-projector dome — and what it means for skymap

**Date:** 2026-09-23 · **Context:** Wisdome Malmö, after the 4K fisheye
pipeline (`docs/superpowers/specs/completed/2026-09-19-view-rigs-dome-fisheye-design.md`)
**Sources read:** `OpenSpace/OpenSpace@bdb7d9c` and `sgct/sgct@e876c7d`
(SGCT = Simple Graphics Cluster Toolkit, the windowing/cluster layer OpenSpace
runs on). File references below are into those two repos.

## TL;DR

- OpenSpace does no cluster work of its own. **SGCT** handles it, and SGCT
  uses **lockstep state replication**. Every node is a full OpenSpace instance
  with the full dataset on its own disk. Each frame the master sends a small
  state packet (camera pose, sim time, queued scripts). Every node renders its
  own slice from that state. Pixels never cross the network.
- There are **two sync layers**:
  1. A **TCP frame lock**: clients block until they have frame N's state, and
     the master blocks before its swap until every client has acknowledged it.
  2. A **hardware swap lock** (NVIDIA Quadro Sync / `WGL_NV_swap_group` swap
     barrier), so all GPUs flip buffers on the same genlocked vsync.
- **Projection per node:** each projector's node renders an **asymmetric
  perspective frustum** aimed at that projector's patch of the dome (or a
  cropped fisheye). A **warp mesh plus blend/black-level masks** from the dome
  calibration vendor then reshapes the image. At runtime **no 4K fisheye
  master exists** in a live multi-node show.
- Skymap's recorded **4096² equidistant fisheye master is the film path**. The
  dome's playback system slices, warps and blends it across the projectors, so
  none of the above is needed for Friday. It only matters if we ever want
  **live, interactive** skymap in the dome.

## 1. Cluster topology

A single JSON config (`OpenSpace/config/two_nodes.json`, schema in
`sgct/sgct.schema.json`) describes the whole cluster: `masteraddress`, then
`nodes[]`, each with `address`, `port`, optional `swaplock`, and
`windows[] → viewports[] → projection`. Every machine launches with the **same
file** and finds its own entry by matching its IP address (or `--local N` for
local testing). Site configs for real planetaria are not in the repo. They
ship with the dome's calibration data.

## 2. The per-frame loop (`sgct/src/engine.cpp` `Engine::exec`, ~L794)

```
            MASTER                                    CLIENT (×N)
 preSync()  input, navigation, advance time by dt     (nothing app-side)
 encode()   serialize syncables → byte buffer
 frameLockPreStage:
            send buffer + frame# to every client ──▶  block on condvar until frame N
                                                      arrives; decode(); send ACK
 postSyncPreDraw()   apply state (clients: double-buffered SyncData → live values)
 draw()              every window/viewport renders its own projection
 frameLockPostStage:
            block until every client ACKed frame N
 swapBuffers()  ──── with swaplock: NV swap barrier flips all GPUs on one vsync ────
```

Details that matter:

- **Transport:** plain TCP with `TCP_NODELAY` (`network.cpp` ~L86). Each
  message has a 13-byte header: id byte, frame number, payload size, and an
  unused compression field. A separate "data transfer" connection type carries
  bulk one-off payloads, but per-frame sync does not use it.
- **Clients ACK on receipt, not after rendering** (`frameLockPreStage` ends
  with `nm.sync(Acknowledge)` before `draw`). The master's post-stage wait
  only guarantees that no client is more than one frame of state behind.
  Render time is aligned by the swap barrier, not by the network.
- **`firmsync`** (cluster config flag, `network.cpp` `Network::isUpdated`)
  makes the check exact: the master requires `recvFrame == sendFrame` for each
  client. Loose mode (the default) only checks that something arrived.
- **Timeouts:** after 1 s a client logs "Waiting for master" and the master
  logs "Waiting for IG n". After `syncTimeout` the program throws. A node that
  stalls stalls the whole dome, which is intended.
- **Swap lock** is Windows + NVIDIA-pro only (`window.cpp` `initNvidiaSwapGroups`,
  `wglJoinSwapGroupNV` / `wglBindSwapBarrierNV`). Without it, nodes present
  whenever their own vsync lands, so there can be up to about one refresh of
  skew between projectors. That skew is visible as a seam "tear" during fast
  camera motion.

## 3. What OpenSpace actually syncs

`SyncEngine` (`OpenSpace/src/engine/syncengine.cpp`) walks a list of
`Syncable`s. On the master it calls `encode` on each, and on clients it calls
`decode` on each. The registered set (`openspaceengine.cpp` ~L921,
`globals.cpp` ~L417) is small:

| Syncable                  | Payload                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `Camera`                  | position `dvec3`, rotation `dquat`, scaling `float`          |
| `TimeManager`             | current `Time`, `integrateFromTime`                          |
| `OrbitalNavigator`        | anchor node name (string)                                    |
| `ScriptEngine`            | Lua scripts queued this frame (property changes ride these) |
| `VideoPlayer` (module)    | playback state                                               |

Consequences:

- **Clients never integrate time or navigation.** Only the master runs input
  and `dt` (`OpenSpaceEngine::preSynchronization` ~L1184; when recording
  frames it uses a fixed `dt`). Clients get the absolute result.
- **UI changes are replicated as scripts.** Changing a property goes through
  the script queue, which runs on all nodes, so settings stay coherent without
  syncing the whole property tree.
- Anything that is **not** in the packet must be **deterministic** from it:
  LOD choice, async tile loading, random seeds, per-node-`dt` animations.
  Otherwise neighbouring projectors disagree at the blend seam.

## 4. Projection: how each machine gets its slice

Every SGCT viewport has a `projection`. The dome-relevant types are:

- **`PlanarProjection`**: an off-axis frustum given as `fov: {up, down,
  left, right}` in degrees (asymmetric) plus `orientation {yaw, pitch, roll}`.
  This is **exactly our `ViewSpec`** (`rotation` + tangent-form `ViewFrustum`).
  In a multi-projector dome, each node gets one of these, aimed from the sweet
  spot at the patch its projector covers.
- **`FisheyeProjection`**: renders a 4-, 5- or 6-face cube (the choice depends
  on `fov`) and resamples it into a fisheye. Its parameters are `quality`
  (cube face size), `tilt`, `diameter`, and `crop` (render only the part of
  the fisheye this projector needs). It is used for single-projector fisheye
  domes or when the calibration mesh is fisheye-referenced. See
  `sgct/src/projection/fisheye.cpp`.
- **Correction on top of either:** `viewport.mesh` is a warp mesh.
  `correctionmesh.cpp` picks the parser by file extension: Domeprojection
  `.csv`, Scalable `.ol`, Sciss `.sgc`, SkySkan `.skyskan`, SimCAD `.simcad`,
  `.pfm`, Paul Bourke `.data`, `.obj`. `blendmask` and `blacklevelmask` are
  per-projector textures multiplied in at the end (`Window::renderFBOTexture`).
  The **SkySkan** format carries `Dome Azimuth / Elevation / Horizontal FOV /
  Vertical FOV`, and SGCT sets the planar frustum from it directly
  (`skyskan.cpp` ~L148). That is the vendor → frustum hand-off in its plainest
  form.

In short, a 5-projector live dome is **5 × (one aimed asymmetric frustum →
vendor warp mesh → blend mask)**, each at roughly its projector's native
resolution. A full fisheye is never assembled.

## 5. Implications for skymap

1. **For Friday: no change.** The Wisdome spec asks for a 4096² fisheye mp4
   that is played back directly. Their media server does the slicing, warping
   and blending. Our pipeline already produces the one artifact that crosses
   that boundary.
2. **Perf finding for the dome rig:** SGCT crops the four side faces to the
   half that lies inside the 180° hemisphere (`cropLevel = 0.5` at
   `fov = 180`, `fisheye.cpp` ~L333). `domeFaceSpecs` gives every side face
   the full square 90° frustum at `canvas.canvasSize`. Half of each side face
   falls outside the circle and is discarded by the resample. That is
   1 + 4 × ½ = 3 faces' worth of used pixels out of 5 rendered, so **about 40%
   of cube-face fragments are wasted**. An asymmetric half-height
   `ViewFrustum` + `sizePx` for the side faces would recover it, since the
   view rig already takes tangent-form frusta. This is worth measuring with
   `npm run perf` before and after if recording time matters.
3. **Live dome (future), if ever:** the SGCT model maps onto what we have:
   - **State packet:** camera pose (f64), sim time, tour beat/time, and
     settings-change events, sent from one master browser over WebSocket.
     That is tiny, like OpenSpace's.
   - **Per-node rig:** a `ViewRig` with one `ViewSpec` built from the
     projector's frustum (straight from a SkySkan/Domeprojection file) plus a
     warp/blend pass. Alternatively, keep the fisheye rig and apply a
     fisheye-referenced warp mesh with `crop`.
   - **Main limitation:** the browser has **no swap barrier or genlock**.
     WebGPU gives no control over present timing, so we would only get the
     network frame lock, with up to about one frame of cross-projector skew.
     A native wrapper (or SGCT itself) would be needed to close that gap.
   - **Determinism audit first:** anything adaptive per node (dynamic
     resolution, streaming/LOD, time-based fades that read local `dt`) would
     show up as seams.
