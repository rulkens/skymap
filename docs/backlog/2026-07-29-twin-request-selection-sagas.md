# `watchRequestFocusSaga` / `watchRequestSelectSaga` are exact twins

Surfaced during the 2026-07-29 refactor-ground pass for the URL-hash saga. Not prep for
that feature (its `selection.pending` need landed in `selectionSlice.extraReducers`
instead, touching neither saga), so it is recorded here rather than folded in.

## Current state

The two files are structurally identical, differing only in the action taken and the slot
written:

```ts
// src/state/selection/watchRequestFocusSaga.ts:19-24
export function* watchRequestFocusSaga() {
  yield* takeLatest(requestFocus, function* (action) {
    const ref = yield* resolveFocusRefDeferring(action.payload);
    yield* put(updateSelectionFocus(ref));
  });
}

// src/state/selection/watchRequestSelectSaga.ts:15-20
export function* watchRequestSelectSaga() {
  yield* takeLatest(requestSelect, function* (action) {
    const ref = yield* resolveFocusRefDeferring(action.payload);
    yield* put(updateSelectionSelect(ref));
  });
}
```

Same `takeLatest`, same shared `resolveFocusRefDeferring` loop, same `put` shape. Both are
forked separately in `rootSaga`, and both are dispatched together by the `focus` hash-param
source on every deep-link arrival.

## Why it matters

The duplication is latent, not active friction — it only bites when the resolution
behaviour changes, at which point two files must move in lockstep. It became visible
because the hash saga initially looked like it would need per-slot pending tracking added
to both, i.e. the same edit twice.

`selectionSlice` already speaks slot-keyed vocabulary (`setIfChanged(slot)`, three named
slots, and now `pending.{select,focus}`), so the consolidated form has an obvious shape:

```ts
const REQUEST_ROWS = [
  { request: requestFocus, commit: updateSelectionFocus },
  { request: requestSelect, commit: updateSelectionSelect },
] as const;

export function* watchSelectionRequestsSaga() {
  yield* all(
    REQUEST_ROWS.map((row) =>
      takeLatest(row.request, function* (action) {
        yield* put(row.commit(yield* resolveFocusRefDeferring(action.payload)));
      }),
    ),
  );
}
```

## Caveat before picking this up

Check whether `takeLatest` semantics must stay **per-row** — a `requestSelect` should not
cancel an in-flight `requestFocus` deferral. The sketch above preserves that (one
`takeLatest` per row), but a naive single-`takeLatest`-over-both would not, and that
regression would be invisible until a deep link with a slow catalog.

Also fold the two `rootSaga` forks and their two docblock lines into one.
