# Splash Screen — Stub Tour Implementation Plan (Part 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Companion plan:** `2026-05-20-splash-screen-01-core.md` — the splash dialog + AboutPill + useSplash hook + WebGPU gate. **This plan depends on Plan 1 landing first.** While Plan 1 is live the Tour button just dismisses; this plan replaces that no-op with a real stub camera tour.

**Goal:** Wire a short scripted camera tour (Powers-of-Ten-style: Milky Way → Local Group → Virgo Cluster → Boötes Void → Coma Cluster → wide view) to the Tour button. The tour is a chained sequence of `camera.focusOn(...)` calls with cancel-on-input, UI-hidden coordination, and end-state restoration.

**Architecture:** A pure async function `runSplashStubTour(deps)` takes the engine handle and a cancellation token, awaits a fixed dwell after each `focusOn` (matching `FOCUS_TWEEN_MS` plus a beat), and bails between beats if cancellation is requested. App.tsx owns a `tourActive` state that (1) replaces the previous no-op `onTour` wiring with a real invocation, (2) forces `uiHidden` while the tour runs, and (3) cancels on any pointer / key event captured at the window level.

**Tech Stack:** Existing engine handle (`camera.focusOn`, `filaments.setEnabled`), `services/camera/cameraTween.ts`'s `FOCUS_TWEEN_MS` constant, `buildStaticAnchorPois` for POI lookups, React useEffect for the input-cancel listener.

---

## Skymap conventions reminder (applies to every task below)

- `type` aliases only, never `interface`.
- Multi-paragraph didactic comments at module headers.
- No barrel exports; deep imports.
- Tests under `tests/` mirroring `src/`.
- Dev server is left running.

## Mitigation decision (Q8 follow-up)

The grill flagged the **Boötes Void** beat as risky in a snap-cut stub: a camera arriving at a location with no galaxies could read as "the app broke". Two mitigations were considered:

- **(a) reorder** — make wide view the climax; put the void mid-sequence.
- **(b) MSDF per-beat captions** — requires building new MSDF caption infra in the renderer (the existing labels system is per-galaxy / per-POI, not per-tour-beat).

**This plan picks (a).** Rationale: the existing renderer has no "ephemeral tour caption" API, and building one is a meaningful sub-project (atlas slot allocation, lifetime management, fade-in/fade-out coupled to tween completion). Caption infra is a natural piece of the real-tour plan; bundling it here would inflate scope past the "stub" framing. Reordering is free and addresses the ambiguity through positioning alone: the void is one beat in a longer sequence with a strong climax, so the user reads it as part of a tour through different scales, not as a broken final state.

The chosen itinerary (six beats, ~50 s wall time):

1. **Milky Way** (home view, pulled out slightly) — anchor; "you are here".
2. **Local Group** (M31 / Andromeda area via the famous-meta atlas) — "our neighbourhood".
3. **Virgo Cluster** (POI: `cluster-virgo-m87`) — "the nearest big cluster".
4. **Boötes Void** (POI: `void-bootes-void`) — "the strangest absence we know about". Mid-sequence; the next beat re-populates the frame.
5. **Coma Supercluster** with **filaments on** (POI: `supercluster-coma-sc`) — "the cosmic web in action".
6. **Wide view** (camera home) — climax; "this is the whole map".

Filaments are toggled on for beat 5 and restored to the user's pre-tour setting at end-of-tour.

---

## Task 1: `TourCancelToken` type + dependency types

**Files:**
- Create: `src/@types/splash/TourCancelToken.d.ts`
- Create: `src/@types/splash/SplashStubTourDeps.d.ts`

- [ ] **Step 1: Write the type files**

```ts
// src/@types/splash/TourCancelToken.d.ts
/**
 * TourCancelToken — a thin cooperative cancellation primitive used by the
 * splash stub tour.  We don't use AbortController because the tour does
 * not perform any fetch — the only thing to cancel is "skip the rest of
 * the beats and bail cleanly".  An AbortController would work but pulls
 * in DOM-typed surface and a heavier API than we need.
 *
 * The token is a plain mutable object with a single boolean.  The tour
 * runner reads `cancelled` between beats and short-circuits the await
 * chain if set.  Callers flip it by calling `cancel()`.
 *
 * Idempotent: calling `cancel()` multiple times is fine; the token is
 * single-shot from the runner's perspective.
 */
export type TourCancelToken = {
  readonly cancelled: boolean;
  cancel(): void;
};
```

```ts
// src/@types/splash/SplashStubTourDeps.d.ts
import type { EngineHandle } from '../engine/EngineHandle';
import type { TourCancelToken } from './TourCancelToken';

/**
 * SplashStubTourDeps — everything the tour runner needs from the outside.
 *
 * `handle` is the engine handle (we use `camera.focusOn`, `camera.focusOnHome`,
 * and `filaments.setEnabled`).  `token` is the cancellation token; the runner
 * checks it between beats.  `filamentsEnabledBefore` carries the user's
 * pre-tour filaments setting so the runner can restore it on the way out.
 *
 * `sleep` is injected to make the runner deterministically testable — tests
 * pass a synchronous fake that records the requested delays; production
 * passes a real `(ms) => new Promise(resolve => setTimeout(resolve, ms))`.
 */
export type SplashStubTourDeps = {
  handle: EngineHandle;
  token: TourCancelToken;
  filamentsEnabledBefore: boolean;
  sleep: (ms: number) => Promise<void>;
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS — types compile.

- [ ] **Step 3: Commit**

```bash
git add src/@types/splash/TourCancelToken.d.ts src/@types/splash/SplashStubTourDeps.d.ts
git commit -m "$(cat <<'EOF'
feat(splash-tour): add TourCancelToken + SplashStubTourDeps types

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `createTourCancelToken` factory

**Files:**
- Create: `src/components/Splash/createTourCancelToken.ts`
- Test: `tests/components/Splash/createTourCancelToken.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/components/Splash/createTourCancelToken.test.ts
import { describe, it, expect } from 'vitest';
import { createTourCancelToken } from '../../../src/components/Splash/createTourCancelToken';

describe('createTourCancelToken', () => {
  it('starts uncancelled', () => {
    const t = createTourCancelToken();
    expect(t.cancelled).toBe(false);
  });

  it('flips to cancelled after cancel()', () => {
    const t = createTourCancelToken();
    t.cancel();
    expect(t.cancelled).toBe(true);
  });

  it('is idempotent — calling cancel() twice is safe', () => {
    const t = createTourCancelToken();
    t.cancel();
    t.cancel();
    expect(t.cancelled).toBe(true);
  });

  it('returns a fresh token per call (independent state)', () => {
    const a = createTourCancelToken();
    const b = createTourCancelToken();
    a.cancel();
    expect(b.cancelled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/Splash/createTourCancelToken.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the factory**

```ts
// src/components/Splash/createTourCancelToken.ts
/**
 * createTourCancelToken — produce a fresh cooperative-cancellation token
 * for one tour run.
 *
 * ### Why a function rather than a class
 *
 * A class would work, but the token has only two fields (a flag + a
 * mutator) and no inheritance or polymorphism.  A factory returning an
 * object literal reads more honestly: the consumer reads `t.cancelled`
 * and calls `t.cancel()` — no `new`, no `this` capture pitfalls.
 *
 * The `cancelled` field is declared as a getter so external readers
 * can't mutate it directly (only `cancel()` can).  Keeps the contract
 * one-directional.
 */

import type { TourCancelToken } from '../../@types/splash/TourCancelToken';

export function createTourCancelToken(): TourCancelToken {
  let flag = false;
  return {
    get cancelled(): boolean {
      return flag;
    },
    cancel(): void {
      flag = true;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/Splash/createTourCancelToken.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Splash/createTourCancelToken.ts tests/components/Splash/createTourCancelToken.test.ts
git commit -m "$(cat <<'EOF'
feat(splash-tour): add createTourCancelToken factory

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `runSplashStubTour` — the runner

**Files:**
- Create: `src/components/Splash/splashStubTour.ts`
- Test: `tests/components/Splash/splashStubTour.test.ts`

**Why one big task:** the runner is ~80 lines, all of which is tested in one spec file. Splitting beats into separate tasks would create six near-identical copy-paste tasks with no payoff.

- [ ] **Step 1: Confirm the FOCUS_TWEEN_MS constant exists for reference**

Run: `grep -n "export const FOCUS_TWEEN_MS" /Users/rulkens/Development/js/skymap/src/services/engine/camera/focusTween.ts`
Expected output: `24:export const FOCUS_TWEEN_MS = 600;`

This is the duration of a single `focusOn` tween — the runner dwells at each beat for `FOCUS_TWEEN_MS + STUB_TOUR_DWELL_MS`.

- [ ] **Step 2: Write the failing test**

```ts
// tests/components/Splash/splashStubTour.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  runSplashStubTour,
  STUB_TOUR_BEATS,
  STUB_TOUR_DWELL_MS,
} from '../../../src/components/Splash/splashStubTour';
import { createTourCancelToken } from '../../../src/components/Splash/createTourCancelToken';
import type { EngineHandle } from '../../../src/@types/engine/EngineHandle';

function makeFakeHandle() {
  const calls: { method: string; arg?: unknown }[] = [];
  const handle = {
    camera: {
      focusOn: (target: unknown) => calls.push({ method: 'focusOn', arg: target }),
      focusOnHome: () => calls.push({ method: 'focusOnHome' }),
      focusOnMilkyWay: () => calls.push({ method: 'focusOnMilkyWay' }),
    },
    filaments: {
      setEnabled: (enabled: boolean) => calls.push({ method: 'setFilamentsEnabled', arg: enabled }),
    },
    selection: {
      selectFamous: (id: string) => calls.push({ method: 'selectFamous', arg: id }),
    },
  } as unknown as EngineHandle;
  return { handle, calls };
}

describe('runSplashStubTour', () => {
  it('plays all STUB_TOUR_BEATS in order when not cancelled', async () => {
    const { handle, calls } = makeFakeHandle();
    const sleep = vi.fn().mockResolvedValue(undefined);
    await runSplashStubTour({
      handle,
      token: createTourCancelToken(),
      filamentsEnabledBefore: false,
      sleep,
    });
    // One camera-effect call per beat (focusOnMilkyWay, selectFamous, focusOn x N, focusOnHome).
    const beatActions = calls.filter((c) =>
      ['focusOnMilkyWay', 'focusOn', 'selectFamous', 'focusOnHome'].includes(c.method),
    );
    expect(beatActions.length).toBe(STUB_TOUR_BEATS.length);
  });

  it('sleeps FOCUS_TWEEN_MS + STUB_TOUR_DWELL_MS between beats', async () => {
    const { handle } = makeFakeHandle();
    const sleep = vi.fn().mockResolvedValue(undefined);
    await runSplashStubTour({
      handle,
      token: createTourCancelToken(),
      filamentsEnabledBefore: false,
      sleep,
    });
    // FOCUS_TWEEN_MS = 600 (verified separately).
    const expected = 600 + STUB_TOUR_DWELL_MS;
    expect(sleep).toHaveBeenCalledWith(expected);
  });

  it('cancels cleanly between beats when token.cancel() is called', async () => {
    const { handle, calls } = makeFakeHandle();
    const token = createTourCancelToken();
    // Sleep cancels after the second beat.
    let beatIndex = 0;
    const sleep = vi.fn().mockImplementation(async () => {
      beatIndex += 1;
      if (beatIndex === 2) token.cancel();
    });
    await runSplashStubTour({
      handle,
      token,
      filamentsEnabledBefore: false,
      sleep,
    });
    const beatActions = calls.filter((c) =>
      ['focusOnMilkyWay', 'focusOn', 'selectFamous', 'focusOnHome'].includes(c.method),
    );
    // We ran two full beats, then cancelled before the third — so we
    // expect ≤ 2 beat actions to have fired.  (Restoration calls below
    // don't count as beat actions.)
    expect(beatActions.length).toBeLessThanOrEqual(2);
  });

  it('restores filaments to filamentsEnabledBefore=false on completion', async () => {
    const { handle, calls } = makeFakeHandle();
    await runSplashStubTour({
      handle,
      token: createTourCancelToken(),
      filamentsEnabledBefore: false,
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    // The final filaments call must restore to false.
    const filamentCalls = calls.filter((c) => c.method === 'setFilamentsEnabled');
    expect(filamentCalls[filamentCalls.length - 1]?.arg).toBe(false);
  });

  it('leaves filaments enabled on completion when filamentsEnabledBefore=true', async () => {
    const { handle, calls } = makeFakeHandle();
    await runSplashStubTour({
      handle,
      token: createTourCancelToken(),
      filamentsEnabledBefore: true,
      sleep: vi.fn().mockResolvedValue(undefined),
    });
    const filamentCalls = calls.filter((c) => c.method === 'setFilamentsEnabled');
    expect(filamentCalls[filamentCalls.length - 1]?.arg).toBe(true);
  });

  it('restores filaments even when cancelled mid-tour', async () => {
    const { handle, calls } = makeFakeHandle();
    const token = createTourCancelToken();
    let beatIndex = 0;
    const sleep = vi.fn().mockImplementation(async () => {
      beatIndex += 1;
      if (beatIndex === 1) token.cancel();
    });
    await runSplashStubTour({
      handle,
      token,
      filamentsEnabledBefore: false,
      sleep,
    });
    const filamentCalls = calls.filter((c) => c.method === 'setFilamentsEnabled');
    // At minimum, the restore call to false must be present at the end.
    expect(filamentCalls[filamentCalls.length - 1]?.arg).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/Splash/splashStubTour.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the runner**

```ts
// src/components/Splash/splashStubTour.ts
/**
 * splashStubTour — the rough-cut camera tour the splash launches from
 * its Tour CTA.
 *
 * ### What this is (and isn't)
 *
 * This is a STUB.  It's a chained sequence of `camera.focusOn(...)` calls
 * separated by fixed dwells — no rotation slerp, no narration text, no
 * easing polish.  The polished cinematic tour is a separate future plan
 * (see `docs/superpowers/specs/2026-05-07-tour-animation-design.md`, which
 * will be retired or rewritten as that plan's spec doc).  This file ships
 * now so the Tour button on the splash isn't a dead-end during the gap
 * between splash GA and the real tour.
 *
 * ### Why chained `focusOn` + `sleep` (and not a real tour state machine)
 *
 * The existing `cameraTween` machinery already does the heavy lifting:
 * each `focusOn` call snapshots the current camera and tweens to the new
 * target over `FOCUS_TWEEN_MS = 600` ms with an ease-out cubic.  Starting
 * a new tween while the previous one is in flight cancels the old one and
 * snapshots fresh, so a sleep-based driver is enough: wait
 * FOCUS_TWEEN_MS + dwell, fire the next tween, repeat.  This deliberately
 * accepts the "snap-rotate-then-dolly" artifact (decision 1 of the
 * original tour brainstorm) because the polished tour is the right place
 * to fix that, not the stub.
 *
 * ### Cancellation contract
 *
 * The runner checks `token.cancelled` between beats and short-circuits
 * the await chain if set.  Cancellation does NOT interrupt an in-flight
 * tween — that's intentional, because cancelling mid-tween would leave
 * the camera at a half-baked intermediate state.  Cancelling at a beat
 * boundary lets the camera settle at the last completed target, which
 * is a much cleaner end state for "any input cancels".  The try/finally
 * ensures filaments are restored to their pre-tour setting regardless
 * of whether the runner completes normally or bails on cancellation.
 *
 * ### Why `sleep` is injected
 *
 * Tests can pass a synchronous fake (`vi.fn().mockResolvedValue(...)`)
 * to avoid burning real wall-clock time and to control the order of
 * cancellation events relative to beat boundaries.  Production passes
 * a real `setTimeout`-based sleep from App.tsx.
 *
 * ### Why we reorder Boötes Void mid-sequence
 *
 * Per the 2026-05-20 grill (Q8 risk-mitigation pick (a)): the void as
 * the final beat reads ambiguously ("camera arrived somewhere with no
 * galaxies — is the app broken?").  Moving it mid-sequence and putting
 * the cosmic-web + wide-view climax after re-populates the frame
 * naturally, removing the ambiguity without needing per-beat caption
 * infrastructure (which is real-tour-plan territory).
 *
 * ### Why beats are an exported constant
 *
 * The beat list is the load-bearing piece of the tour's narrative.
 * Exposing it as `STUB_TOUR_BEATS` lets tests assert on the sequence
 * shape without re-stating it, and lets a future caller (e.g. a debug
 * panel that wants to jump to beat N for tuning) reuse the table.
 */

import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { SplashStubTourDeps } from '../../@types/splash/SplashStubTourDeps';
import { FOCUS_TWEEN_MS } from '../../services/engine/camera/focusTween';
import { buildStaticAnchorPois } from '../../data/buildStaticAnchorPois';

/**
 * Dwell after each tween completes.  Long enough to register the beat as
 * a deliberate pause; short enough that the six-beat tour finishes in
 * ~50 s wall time (~8 s per beat = 600 ms tween + 7400 ms dwell).
 */
export const STUB_TOUR_DWELL_MS = 2_500;

/**
 * Discriminated union of the action a beat performs.  Three shapes:
 *   - 'milky-way' → call camera.focusOnMilkyWay()
 *   - 'famous'    → call selection.selectFamous(id) (pins + focuses)
 *   - 'poi'       → look up the static POI by id, call camera.focusOn(poi)
 *   - 'home'      → call camera.focusOnHome()
 *
 * 'famous' uses selectFamous (which auto-focuses) because famous galaxies
 * have no static-POI counterpart — selectFamous is the canonical way to
 * land a focus on a famous-atlas galaxy from outside.
 */
export type StubTourBeat =
  | { kind: 'milky-way'; name: string }
  | { kind: 'famous'; name: string; id: string }
  | { kind: 'poi'; name: string; poiId: string; filamentsOn?: boolean }
  | { kind: 'home'; name: string };

/**
 * The exported beat sequence.  See module header for the "powers of ten"
 * reordering rationale (void mid-sequence, wide view as climax).
 */
export const STUB_TOUR_BEATS: readonly StubTourBeat[] = [
  { kind: 'milky-way', name: 'Milky Way' },
  // The Local Group is anchored on the M31 (Andromeda) famous-atlas
  // entry.  selectFamous handles the focus-tween + pin in one call.
  { kind: 'famous', name: 'Local Group (M31)', id: 'm31' },
  { kind: 'poi', name: 'Virgo Cluster', poiId: 'cluster-virgo-m87' },
  { kind: 'poi', name: 'Boötes Void', poiId: 'void-bootes-void' },
  {
    kind: 'poi',
    name: 'Coma Supercluster',
    poiId: 'supercluster-coma-sc',
    filamentsOn: true,
  },
  { kind: 'home', name: 'Wide View' },
];

/**
 * Run the stub tour to completion (or cancellation).  Returns a Promise
 * that resolves when the tour is done — either ran all beats, or bailed
 * on cancellation.  The try/finally restores filaments unconditionally.
 */
export async function runSplashStubTour(deps: SplashStubTourDeps): Promise<void> {
  const { handle, token, filamentsEnabledBefore, sleep } = deps;

  // Pre-build the POI lookup map once.  buildStaticAnchorPois returns a
  // fresh array per call, so we memoize at the runner's entry rather than
  // inside the per-beat dispatch (small win, but cleaner).
  const pois = buildStaticAnchorPois();
  const poiById = new Map(pois.map((p) => [p.id, p]));

  try {
    for (const beat of STUB_TOUR_BEATS) {
      if (token.cancelled) return;

      // Filaments toggle — only specific beats want it on; others leave
      // the current setting alone.  The end-of-tour restore (in the
      // finally block) returns to the user's pre-tour preference.
      if (beat.kind === 'poi' && beat.filamentsOn) {
        handle.filaments.setEnabled(true);
      }

      // Dispatch the beat's camera action.  Each call kicks off a
      // FOCUS_TWEEN_MS tween that the engine drives per-frame; we just
      // sleep through it before starting the next beat.
      switch (beat.kind) {
        case 'milky-way':
          handle.camera.focusOnMilkyWay();
          break;
        case 'famous':
          handle.selection.selectFamous(beat.id);
          break;
        case 'poi': {
          const poi = poiById.get(beat.poiId);
          if (poi) {
            handle.camera.focusOn(poi);
          }
          // If the POI is missing (renamed slug?), skip silently — the
          // tour proceeds to the next beat.  A misordered slug is a
          // catalog bug, not a tour bug; we don't want one beat to
          // crash the rest of the sequence.
          break;
        }
        case 'home':
          handle.camera.focusOnHome();
          break;
      }

      // Dwell for the tween + the pause.  Cancellation is re-checked
      // at the top of the next iteration; we don't poll inside the
      // sleep because the sleep is a single Promise and splitting it
      // would add complexity for negligible UX improvement.
      await sleep(FOCUS_TWEEN_MS + STUB_TOUR_DWELL_MS);
    }
  } finally {
    // Always restore filaments to the user's pre-tour setting.  Runs on
    // happy-path completion, cancellation, AND on any thrown error from
    // the engine handle.  Safe even if filaments were never toggled on
    // (setEnabled(false) when already false is a no-op).
    handle.filaments.setEnabled(filamentsEnabledBefore);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/components/Splash/splashStubTour.test.ts`
Expected: PASS — all six assertions green.

- [ ] **Step 6: Commit**

```bash
git add src/components/Splash/splashStubTour.ts tests/components/Splash/splashStubTour.test.ts
git commit -m "$(cat <<'EOF'
feat(splash-tour): add runSplashStubTour runner with cancel + filament restore

Six-beat Powers-of-Ten-style camera tour: Milky Way → Local Group → Virgo
Cluster → Boötes Void → Coma Supercluster (with filaments) → wide view.
Cancellation is cooperative at beat boundaries; filaments are restored
via try/finally regardless of completion path.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire the tour into App.tsx (start / cancel / UI hide)

**Files:**
- Modify: `src/components/App/App.tsx`

- [ ] **Step 1: Read the current Splash wiring**

Run: `grep -n "splash\|onTour\|Splash" /Users/rulkens/Development/js/skymap/src/components/App/App.tsx`
Expected to see: `useSplash` hook call, the `<Splash>` JSX block from Plan 1's Task 10, currently with `onTour={splash.dismissTour}`.

- [ ] **Step 2: Add the new imports near the top of App.tsx**

```tsx
import { runSplashStubTour } from '../Splash/splashStubTour';
import { createTourCancelToken } from '../Splash/createTourCancelToken';
import type { TourCancelToken } from '../../@types/splash/TourCancelToken';
```

- [ ] **Step 3: Add tour-active state + the start handler**

Add immediately after the `const splash = useSplash({ ... });` block:

```tsx
  // ── Tour state ─────────────────────────────────────────────────────────
  //
  // `tourActive` drives two effects: (1) it forces `uiHidden` while the
  // tour runs, and (2) it arms the window-level input listener that
  // cancels the tour on any pointer / key event.  `tourTokenRef` holds
  // the active cancellation token so the input listener (which is
  // mounted via a useEffect that can't directly close over `tourActive`'s
  // setter chain cleanly) can flip the token without state coupling.
  const [tourActive, setTourActive] = useState(false);
  const tourTokenRef = useRef<TourCancelToken | null>(null);

  const startStubTour = useCallback(() => {
    // Idempotent: if a tour is already running, do nothing (the splash
    // shouldn't be able to re-trigger but defending the entry point is
    // cheap).
    if (tourActive) return;
    const handle = handleRef.current;
    if (!handle) return;

    // Dismiss the splash first.  dismissTour bumps localStorage's
    // seenVersion — same effect as if the user had clicked Explore.
    splash.dismissTour();

    const token = createTourCancelToken();
    tourTokenRef.current = token;
    setTourActive(true);

    void runSplashStubTour({
      handle,
      token,
      filamentsEnabledBefore: filamentsEnabled,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }).finally(() => {
      // Whether the tour completed normally or was cancelled, clear the
      // active flag and the token so the UI restores and a future tour
      // run starts from a clean slate.
      setTourActive(false);
      tourTokenRef.current = null;
    });
  }, [tourActive, splash, filamentsEnabled]);
```

- [ ] **Step 4: Replace the existing `onTour` prop on `<Splash>` to call `startStubTour`**

Locate the `<Splash ... onTour={splash.dismissTour} ... />` block. Change `onTour={splash.dismissTour}` to:

```tsx
          onTour={startStubTour}
```

- [ ] **Step 5: Add the cancel-on-input listener**

Add a useEffect block alongside the existing input-handling hooks:

```tsx
  // ── Tour cancel-on-input ────────────────────────────────────────────────
  //
  // Any user input cancels the tour.  Per the 2026-05-20 grill (Q9 — 2A),
  // the stub uses the simplest cancel pattern: pointerdown / keydown /
  // wheel / touchstart all flip the cancellation token.  The tour
  // runner sees the flip at the next beat boundary and bails.
  //
  // The listener is armed only while `tourActive` is true so a normal
  // session doesn't pay for the listeners.  Capture-phase listeners on
  // window ensure we see the events before the canvas / palette absorb
  // them; passive: true on touch / wheel keeps default behaviours
  // (page scroll, etc.) intact.
  useEffect(() => {
    if (!tourActive) return;
    const cancel = () => tourTokenRef.current?.cancel();
    window.addEventListener('pointerdown', cancel, { capture: true });
    window.addEventListener('keydown', cancel, { capture: true });
    window.addEventListener('wheel', cancel, { capture: true, passive: true });
    window.addEventListener('touchstart', cancel, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', cancel, { capture: true } as EventListenerOptions);
      window.removeEventListener('keydown', cancel, { capture: true } as EventListenerOptions);
      window.removeEventListener('wheel', cancel, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchstart', cancel, { capture: true } as EventListenerOptions);
    };
  }, [tourActive]);
```

- [ ] **Step 6: Force `uiHidden` while tour is active**

Locate the current `uiStack` wrapper line (which Plan 1's Task 10 left as `(uiHidden || splash.splashVisible)`):

```tsx
      <div className={cx(appStyles.uiStack, (uiHidden || splash.splashVisible) && appStyles.uiStackHidden)}>
```

Update the condition to include `tourActive`:

```tsx
      <div className={cx(appStyles.uiStack, (uiHidden || splash.splashVisible || tourActive) && appStyles.uiStackHidden)}>
```

- [ ] **Step 7: Typecheck + run full test suite**

Run: `npm run typecheck && npm test`
Expected: PASS — no type errors; all existing tests still green.

- [ ] **Step 8: Commit**

```bash
git add src/components/App/App.tsx
git commit -m "$(cat <<'EOF'
feat(splash-tour): wire stub tour to Splash Tour button + cancel-on-input

Clicking Tour dismisses splash, starts a six-beat camera tour, and arms
window-level pointer/key listeners that cancel the tour cooperatively
at the next beat boundary.  UI chrome is auto-hidden while the tour
runs; the existing Tab toggle still works as an override.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Final smoke + integration check

**Files:** none modified; verification task.

- [ ] **Step 1: Run the full check suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 2: Manual smoke (ask the user)**

Confirm in the live dev server:
1. Tour button on the splash now triggers a six-beat camera tour, not just a dismiss.
2. UI chrome (left stack, top bar, status bar) is hidden while the tour plays.
3. Clicking, scrolling, or pressing any key during the tour stops the tour cleanly at the current beat.
4. Filaments are on for the Coma beat and turn off again at end-of-tour (assuming they were off before).
5. The void beat is mid-sequence; the Coma + wide-view beats follow as climax.
6. After the tour ends, normal UI returns and the user has free orbit control.
7. Clicking About on the top bar mid-tour: the splash reopens AND the tour cancels (the splash reopen click event triggers the cancel listener).

- [ ] **Step 3: Verify the deprecated tour spec is still in place**

The old `docs/superpowers/specs/2026-05-07-tour-animation-design.md` should still exist untouched. The grill explicitly deferred its retirement/rewrite to the real-tour plan — not this plan, not Plan 1.

Run: `ls /Users/rulkens/Development/js/skymap/docs/superpowers/specs/ | grep tour`
Expected output: `2026-05-07-tour-animation-design.md` present.

- [ ] **Step 4: Update plan cross-references if anything drifted**

If task numbering, file names, or behaviour drifted from Plan 1's assumptions during execution, edit Plan 1's Task 11 "deferred items" note to reflect reality before considering this plan complete.

---

## Self-review notes

- **Spec coverage check:** Q3 (stub tour shipped with splash) → Tasks 1-4. Q8 (six-beat powers-of-ten arc with void mitigation) → STUB_TOUR_BEATS in Task 3. Q9-1A (auto-hide UI on tour start, restore on end) → Task 4 step 6. Q9-2A (any input cancels) → Task 4 step 5. Q9-3A (stop at final position, restore UI) → STUB_TOUR_BEATS final beat is `home`; tourActive cleared in the .finally(). Side-effect (About pill mid-tour reopens splash + cancels tour) → the input listener fires on the About pill click, satisfying both conditions.
- **Type consistency:** `TourCancelToken` defined in Task 1, used identically in Task 2 (factory return type), Task 3 (runner input), Task 4 (App.tsx state). `SplashStubTourDeps` defined once in Task 1 and consumed only in Task 3 — no drift.
- **Placeholder scan:** No "TBD" / "implement appropriately" / "fill in details" entries. The `sleep` injection is a real pattern, not a placeholder.
- **Dependency on Plan 1:** the Splash component, the `useSplash` hook, the `dismissTour` setter, and the `<Splash onTour={...}>` prop all come from Plan 1's Task 10. This plan assumes that integration is in place; if Plan 1 didn't land, Task 4 step 4 will fail to find `<Splash>` and the integration step won't apply cleanly.
