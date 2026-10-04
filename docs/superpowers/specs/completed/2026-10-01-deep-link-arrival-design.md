# Deep-link arrival — links open on their subject

**Status:** design approved 2026-10-01 (brainstorm + refactor-ground checkpoint), awaiting spec review.
**Branch:** `worktree-deep-links-open-on-subject`. One PR: prep commits first, then the feature.

## Goal

Every deep link opens with the camera already on its subject. No camera move happens on arrival: no fly-in from the Earth home view, no exhibit fly, no follow re-ease. The capture tools (`capture-featured`, `record-tour`, `perf`, the future `npm run shot`) get one reliable "this view is final" signal in place of timeouts and pose re-application.

The link kinds:

- **Existing:** `#focus=`, `#pose=`, `#t=`, `#orientation=`.
- **New, read-only:** `#exhibit=<id>`, `#tour=<id>`, `#clip=<id>`.

## Rulings (from the brainstorm)

1. **The veil holds until arrival.** While a link's subject is unresolved (a catalog galaxy before its `.bin` loads, say), an opaque veil with the load progress covers the screen. It lifts only once the camera sits on the subject. No home view, no visible jump.
2. **A takeover starts at its first frame and then plays.** For an exhibit, that frame is its landed pose with the copy showing and auto-rotate running; the ~11 s fly is skipped. A tour plays from its first beat as authored, as when the splash's Tour button starts it. A fixed-start clip begins at its `start` pose. A live-start clip starts from the home framing, since starting from wherever the camera is is what that clip is authored to do. A tour's first beat can fly from the home view: that is the tour's own animation, not an arrival move. A "skip enter" seam was considered and rejected.
3. **Precedence.** A takeover key (`exhibit`/`tour`/`clip`) beats `focus` and `pose`. `t` and `orientation` apply to every link. A link carries at most one takeover. Takeover keys mirror what is running (amended 2026-10-03 after the smoke): while an exhibit, tour or clip plays, its key is in the hash, however it was started (link or palette), and the hash drops it when that one ends. A hash navigation that leaves out the running takeover's key, such as Back to the pre-tour URL, exits that takeover.
4. **One navigation path.** Boot, a later hash edit and back/forward all go through `navigateSaga`, which takes an explicit `Transition`. Boot uses `'cut'`; a hash change uses `'fly'`, today's behaviour.
5. **Failure.** An unresolvable subject lifts the veil on the home view with `status: 'failed'`. That covers an unknown id, a catalog that loaded without the id, and the ~30 s backstop. `ready` rejects with the reason, so a capture fails loudly instead of shooting home.

## Ground preparation

Refactor-ground checkpoint 2026-10-01: the user signed off the shape and one-PR packaging. Each prep item below is its own commit, sequenced before any feature commit.

### Ideal shape

```ts
// src/@types/url/LinkView.d.ts — precedence is a parse rule, never a runtime branch
type LinkView =
  | { kind: 'home' }
  | { kind: 'focus'; id: string; pose?: CameraPose }
  | { kind: 'pose'; pose: CameraPose }
  | { kind: 'exhibit' | 'tour' | 'clip'; id: string };
// src/@types/url/LinkIntent.d.ts
type LinkIntent = { view: LinkView; t?: number; orientation?: OrientationFrameId };
// src/@types/navigation/Transition.d.ts — a property of the request, never of its source
type Transition = 'cut' | 'fly';
// src/@types/state/arrival/ArrivalState.d.ts
type ArrivalState = { status: 'pending' | 'arrived' | 'failed'; reason?: 'unknown-id' | 'timeout' };
```

- **`HashParamSource.read(value)`** returns `Partial<LinkIntent>`; it used to return `Action[]`. `utils/url/linkIntentFrom.ts` merges the rows' contributions into one `LinkIntent` and applies the precedence rule. Table order then fixes only the write layout; it no longer fixes read order.
- **`services/engine/camera/framingPose.ts`** `(row, runtime) → CameraPose` is the single framing source, built on the existing per-kind `focusFraming` (`focusFraming.ts:71`).
- **`state/navigation/navigateSaga.ts`** turns `(intent, transition)` into: apply `t`/`orientation`, resolve the subject, make one camera commit, then set focus/selection or start the takeover.
- **`state/arrival/`** holds the slice and `arrivalSaga`. After `wireInput`, the saga calls `navigate(bootIntent ?? home, 'cut')`, waits for a rendered frame, and dispatches `arrived`.
- **`requestFocus(id, { transition })`**: the focus tween runs only on `'fly'`.
- **`openExhibit({ id, entry: Transition })`**: `TakeoverSource` records `entry`, and the overlay delay derives from it.
- **New hash rows** `exhibit`, `tour`, `clip` get `deepLink: true`; `hasDeepLink` derives them with no edit.
- **A registry clip is a third takeover kind** (amended 2026-10-03, reversing the brainstorm ruling). `takeover.active` is the one record of what runs: `{ kind: 'tour' | 'exhibit' | 'clip', id, entry? }`. One watcher gives mutual exclusion across all three, `exitTakeover` is the one exit verb, and every takeover hash row writes from it. Each kind brings its own bracket: tours and exhibits snapshot and restore the scene and pin the FOV, while a clip freezes and restores the clock and leaves the scene alone. `camera.clip` stays on the camera slice, because it is the motion being played and not the identity of the run.

### Joints and verdicts

| Touchpoint | Verdict | Blocker |
|---|---|---|
| Hash rows emit actions, not intent; `pose` must precede `focus` | bolt-on → prep 2 | `src/@types/state/url/HashParamSource.d.ts:53-78`, `hashParamSources.ts:286` |
| Body framing distance has three sources | bolt-on → prep 1 | `cameraDrivers.ts:160` (`bodyFocusDistance` ignores `focusDistanceRadii`, unlike `bodyLikeFraming.ts:41-43`), `bodyHomePose.ts:71`, `watchFlyToLonLatSaga.ts:77` |
| No focus without a move | bolt-on → prep 3 | `watchFocusTweenSaga.ts:35`; the only bypass today is the `urlPose` park (`:42-56`) |
| `wireInput` picks the boot pose and seeds Earth | bolt-on → feature (home becomes an arrival subject) | `wireInput.ts:119-170`; `selectHasSelectionIntent` is a hand list (`selection/selectors.ts:151`) |
| `openExhibit` always flies; overlay delay is a constant | bolt-on, small → feature | `exhibitBodySaga.ts:61-64`, `ExhibitOverlayContainer.tsx:57` |
| `whenStablyReady` | growth: its predicate becomes "arrival not pending and load idle" | `whenStablyReady.ts:21-24` |
| Deep-link detection | growth | `hasDeepLink.ts:51-53` derives from the table |

### Prep commits (behaviour-preserving unless noted)

1. **One framing source.** Extract `framingPose(row, runtime)` from `focusTweenDescriptor`. Route the follow driver's distance (`cameraDrivers.ts:160`), fly-to-lon/lat and the home pose through `focusFraming`. This deliberately changes one behaviour: a followed body now uses its own `focusDistanceRadii`. A failing test reproduces the wrong distance first.
2. **Hash rows contribute to a `LinkIntent`.** Rows return `Partial<LinkIntent>`, `linkIntentFrom` merges them, and a temporary `applyLinkIntent` turns the intent into exactly today's actions. All existing `state/url/` tests stay green.
3. **`requestFocus` gains `transition`.** Every existing caller passes `'fly'`, so nothing changes.

### Adjacent findings (backlogged, not in this PR)

- `?tour` is a debug gate and also a hand-added deep-link query key (`hasDeepLink.ts:49`): a second, unrelated notion of "tour".
- The palette's `RUN_ACTION` (`CommandPaletteContainer.tsx:31-45`) duplicates the focus, exhibit and tour dispatches by hand. `navigate(intent, 'fly')` could absorb it.
- `waitSettled`'s busy list (`tools/utils/browser/waitSettled.ts:23-25`) misses the follow approach. This goes away if no caller survives this PR (see Tools).

## Design

### Arrival lifecycle

1. **Parse.** On boot, `watchHashReadSaga` builds the `LinkIntent` (or `{ view: home }` when there is no hash) and stores it as the arrival with `status: 'pending'`.
2. **Boot.** `wireInput` no longer chooses the boot pose and no longer seeds the Earth focus; it commits a neutral home base only so the runtime has a pose. The veil covers that base. The `urlPose ?? homeFraming` choice moves out of `wireInput` (`wireInput.ts:132-150`).
3. **Navigate.** Once `cameraRuntime()` exists, `arrivalSaga` calls `navigateSaga(intent, 'cut')`. `t` and `orientation` apply first, so framing uses the linked instant; this fixes `#t=` framing Earth at wall-clock time. The subject then resolves, using the existing deferring resolver (`resolveFocusRefDeferringSaga`) for late catalog ids. Finally one outside commit lands on the destination pose, which frame 1 adopts as settled (#788).
4. **Moving bodies.** The commit uses `framingPose`, now the same distance the follow driver holds (prep 1), and the follow memory must read saturated, so `followApproach` (`cameraEpochs.ts:74`) has no debt to re-ease. The plan's first task verifies this against a real `#focus=body-mars` boot before relying on it.
5. **Reveal.** After the engine renders one frame on the destination, `arrived` is dispatched and the veil fades. No frame-presented signal exists, so "rendered" means two `requestAnimationFrame`s after the commit (the render loop runs on rAF), the same wait the perf hook's `setPose` uses.
6. **Deletions.** `CameraState.urlPose`, `applyUrlPose`, `spendUrlPose`, `selectUrlPose`, the parked-pose branch in `watchFocusTweenSaga` and `applyLinkIntent` (the prep-2 shim) all go. `#pose=` is now the `pose` subject.

### Subjects

- **`focus`.** `requestSelect` plus `requestFocus(id, { transition })`. With a `pose`, that pose is committed, focus is set, and nothing tweens.
- **`pose`.** The pose is committed with no focus.
- **`exhibit`.** `openExhibit({ id, entry })`. With `entry: 'cut'`, `exhibitBodySaga` commits the fitted pose in place of `playClip(flyToPoseClip)`. The settings merge, no-focus and auto-rotate steps run unchanged, and the overlay copy shows at once.
- **`tour`.** `startTour(id)` runs unchanged.
- **`clip`.** `startClip(id)`; the veil lifts only after the clip has started (`clipStarted`) and rendered its first frame. A fixed-`start` clip therefore reveals on `start`, with no pre-commit: the jump from the home base to `start` happens behind the veil. The same "reveal after the first `clipStarted`" rule covers `tour`, so `grandTour`'s 0 s opening snap lands behind the veil too.
- **`home`.** Commit the home framing and seed the Earth focus. This is what `wireInput` does today, moved.
- **Unknown registry ids and unresolvable focus ids** take the failure path (ruling 5).

### Post-boot hash changes

A hashchange runs `navigateSaga(intent, 'fly')` and leaves the arrival slice alone. `readAbsent` semantics are unchanged: an absent `focus` clears the selection on hashchange only. The write half's replaceState canonicalization keys on `hashArrivalApplied` today (`watchHashWriteSaga.ts:99`); it keys on `arrival.status !== 'pending'` instead.

### Veil

The veil is a new `ArrivalVeil` component (via `create-component`): opaque, showing `SplashProgress`, and visible while `arrival.status === 'pending'` and the boot had a deep link. A plain boot shows the existing splash, so the veil is never rendered there, though `arrival` still runs to `arrived` for the tools.

### Tools

- **`ready`.** `whenStablyReady` waits for `arrival.status !== 'pending'` plus the existing load-idle hold. It resolves on `arrived` and rejects on `failed`. Every tool already awaits `ready`, so call sites don't change.
- **`captureScene`.** The boot `waitSettled`, the 1.5 s `POST_ESC_WAIT_MS` and the pose re-apply-and-verify (`readLiveCameraState`) are deleted; the documented "fly-in overwrites an early pose" landmine no longer exists. Exhibit cards open `#exhibit=<id>` instead of hand-merging settings plus pose.
- **`record`.** The clip frame-0 guess is deleted; `ready` means the clip's start pose is on screen.
- **`waitSettled`.** It is deleted if no caller remains, which the plan counts.
- **`npm run shot`** stays its own follow-up PR (open URL → `ready` → PNG).

## Testing

- **`arrivalSaga`/`navigateSaga`.** One test per subject (immediate body, late catalog id, unresolvable id → `failed`, pose, focus+pose, exhibit, tour, fixed- and live-start clip, home). Each asserts exactly one camera commit and no `startCameraTween`.
- **`linkIntentFrom`.** Per-key parse, the precedence rule, and `t`/`orientation` composing with every subject.
- **Prep 1.** A failing test first: a followed body's held distance equals its `framingPose` distance.
- **Hashchange.** An edit after boot flies (a tween is dispatched) and leaves `arrival` untouched.
- **Manual smoke, once and not in CI.** A headless boot per link kind (`body-mars`, `pgc-43149`, `#pose=`, `#t=`, each exhibit, each tour, `cosmicFlows` clip). The first revealed frame must equal the frame 2 s later, give or take the authored animation.

## Out of scope

- The `npm run shot` tool.
- Seeking a tour or clip to a time offset.
- Earth lon/lat in the hash (`docs/backlog/2026-09-15-earth-point-url-hash.md`).
- The twin request sagas (`docs/backlog/2026-07-29-twin-request-selection-sagas.md`).
