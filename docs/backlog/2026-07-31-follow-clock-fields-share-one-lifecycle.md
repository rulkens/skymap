# Four `CameraClock` follow fields share one lifecycle, carried only in prose

Found by `entanglement-radar` over PR #531.

## The problem

`followStartMs`, `followFrom`, `followDistanceTarget` and `followApproachMs` are nulled as a
group by `followElapsed` and seeded as a group by `followBody`'s first produce. The invariant —
"`followDistanceTarget !== null` ⟹ `followApproachMs !== null`" — holds, but lives in three
prose sites (`CameraClock.d.ts`, `cameraClock.ts`, `cameraDrivers.ts`) and nowhere in the types.

That is what forces `const approachMs = clock.followApproachMs ?? 0;` in the driver. The
fallback is unreachable — traced every writer to confirm — but it reads as a live branch to
anyone auditing the arm, hiding that the case is impossible.

**PR #531 added the fourth field to that group rather than folding it** — the
second-hardcoded-entry trigger, one entry late.

## The cost

The null-check discipline is per-field, so a fifth field can be added and half-nulled with no
compile error. The next person extending the follow approach gets no help from the type.

## Shape

One nullable record:

```ts
followApproach: { from: CameraPose; distanceTarget: number; approachMs: number } | null;
```

All-or-nothing becomes the type, one null-check replaces four, and the `?? 0` disappears.

`followStartMs` stays separate — it is owned by `followElapsed`, not by the driver.

## Care needed

The drag-interrupt edge writes `followDistanceTarget = base.distance` and `followApproachMs = 0`
together while leaving `followFrom` alone. That path is load-bearing (it is what stops a released
drag from yanking the camera back onto a half-flown geodesic) and has its own test — re-read it
before reshaping the record.
