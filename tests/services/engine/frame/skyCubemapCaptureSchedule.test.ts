/**
 * skyCubemapCaptureSchedule — unit tests for the black-hole sky cubemap's
 * amortized capture schedule. Pure function, no GPU/engine state: every
 * input is a plain value, so the round-robin/escape-valve logic is
 * exercised headlessly.
 */

import { describe, it, expect } from 'vitest';

import { skyCubemapCaptureSchedule } from '../../../../src/services/engine/frame/skyCubemapCaptureSchedule';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';

const ALL_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

describe('skyCubemapCaptureSchedule', () => {
  it('full 6-face capture when fullSweepTriggered (band entry or pinned-eye movement — the caller folds both reasons into this one flag)', () => {
    for (let frameIndex = 0; frameIndex < 12; frameIndex++) {
      const { facesToCapture } = skyCubemapCaptureSchedule({
        fullSweepTriggered: true,
        frameIndex,
        lastCapturedAtMs: new Map(),
        nowMs: 1000,
      });
      expect([...facesToCapture].sort()).toEqual([...ALL_FACES]);
    }
  });

  it('round-robins one face per frame otherwise', () => {
    const seen: CubeFace[] = [];
    for (let frameIndex = 0; frameIndex < 6; frameIndex++) {
      const { facesToCapture } = skyCubemapCaptureSchedule({
        fullSweepTriggered: false,
        frameIndex,
        lastCapturedAtMs: new Map(ALL_FACES.map((f) => [f, 1000])),
        nowMs: 1000,
      });
      expect(facesToCapture).toHaveLength(1);
      seen.push(facesToCapture[0]!);
    }
    expect([...seen].sort()).toEqual([...ALL_FACES]);
    expect(new Set(seen).size).toBe(6);
  });

  it('escape valve re-captures a stale face out of turn', () => {
    // Face 2 is the round-robin's own pick at frameIndex 2 (frameIndex % 6),
    // so pick a DIFFERENT frame (0) and make a DIFFERENT face (2) stale —
    // it must appear alongside the round-robin's own face (0).
    const lastCapturedAtMs = new Map<CubeFace, number>([
      [0, 100_000],
      [1, 100_000],
      [2, 0], // captured at t=0 — far older than the recapture threshold
      [3, 100_000],
      [4, 100_000],
      [5, 100_000],
    ]);
    const { facesToCapture } = skyCubemapCaptureSchedule({
      fullSweepTriggered: false,
      frameIndex: 0,
      lastCapturedAtMs,
      nowMs: 100_000,
    });
    expect(facesToCapture).toContain(0); // this frame's round-robin face
    expect(facesToCapture).toContain(2); // the stale escape-valve face
  });

  it('a face missing from lastCapturedAtMs (never captured) is always stale', () => {
    const { facesToCapture } = skyCubemapCaptureSchedule({
      fullSweepTriggered: false,
      frameIndex: 3, // round-robin would pick face 3 alone
      lastCapturedAtMs: new Map(), // every face uncaptured
      nowMs: 0,
    });
    expect([...facesToCapture].sort()).toEqual([...ALL_FACES]);
  });
});
