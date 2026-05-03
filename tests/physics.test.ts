/**
 * Tests for src/data/physics.ts — sexagesimal formatting, SDSS naming,
 * cosmological derivations, Earth-era anchors, galaxy colour classification,
 * and SDSS external URLs.
 *
 * Style mirrors tests/coords.test.ts: small helpers, grouped describe blocks,
 * plain numeric assertions with explicit tolerances.
 */

import { describe, it, expect } from 'vitest';
import {
  formatRaSexagesimal,
  formatDecSexagesimal,
  sdssName,
  lookbackTimeGyr,
  hubbleVelocityKmS,
  absoluteMagnitude,
  earthEraForLookback,
  galaxyTypeFromColor,
  sdssExplorerUrl,
  sdssThumbnailUrl,
} from '../src/data/physics';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Absolute-value closeness check. */
const close = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

// ─── A. formatRaSexagesimal ───────────────────────────────────────────────────

describe('formatRaSexagesimal', () => {
  it('formats 0° as 00h00m00.00s', () => {
    expect(formatRaSexagesimal(0)).toBe('00h00m00.00s');
  });

  it('formats 180° as 12h00m00.00s', () => {
    expect(formatRaSexagesimal(180)).toBe('12h00m00.00s');
  });

  it('formats 15° as 01h00m00.00s', () => {
    expect(formatRaSexagesimal(15)).toBe('01h00m00.00s');
  });

  it('formats 188.7365° as 12h34m56.76s', () => {
    // 188.7365 / 15 = 12.58243333…h → 12h, 0.58243333…×60 = 34.946m → 34m, 0.946×60 = 56.76s
    expect(formatRaSexagesimal(188.7365)).toBe('12h34m56.76s');
  });

  it('wraps -10° to 350° → 23h20m00.00s', () => {
    // -10° + 360° = 350°; 350/15 = 23.3333…h → 23h, 0.3333…×60 = 20m, 0s
    expect(formatRaSexagesimal(-10)).toBe('23h20m00.00s');
  });

  it('wraps 370° back to 10° → 00h40m00.00s', () => {
    // 370° - 360° = 10°; 10/15 = 0.6666…h → 0h, 0.6666…×60 = 40m, 0s
    expect(formatRaSexagesimal(370)).toBe('00h40m00.00s');
  });
});

// ─── A. formatDecSexagesimal ──────────────────────────────────────────────────

describe('formatDecSexagesimal', () => {
  it('formats 0° as +00°00\'00.0"', () => {
    expect(formatDecSexagesimal(0)).toBe('+00°00\'00.0"');
  });

  it('formats -45° as -45°00\'00.0"', () => {
    expect(formatDecSexagesimal(-45)).toBe('-45°00\'00.0"');
  });

  it('formats +90° as +90°00\'00.0"', () => {
    expect(formatDecSexagesimal(90)).toBe('+90°00\'00.0"');
  });

  it('formats 1.396° as +01°23\'45.6"', () => {
    // abs = 1.396; d=1°; 0.396×60=23.76' → 23'; 0.76×60=45.6"
    expect(formatDecSexagesimal(1.396)).toBe('+01°23\'45.6"');
  });

  it('formats -1.396° correctly with minus sign', () => {
    expect(formatDecSexagesimal(-1.396)).toBe('-01°23\'45.6"');
  });
});

// ─── B. sdssName ─────────────────────────────────────────────────────────────

describe('sdssName', () => {
  it('constructs SDSS J name for ra=188.7365, dec=+1.396', () => {
    // Mathematical ideal: 188.7365/15 = 12.58243333…h → 12h34m56.76s
    // and 1.396° → 01°23'45.6"
    // However, 188.7365 cannot be represented exactly in IEEE 754 float64:
    // the nearest double is slightly below 188.7365, so 188.7365 × 24000
    // evaluates to 4529675.999… — Math.trunc gives 4529675, not 4529676,
    // making the truncated seconds 56.75 (not 56.76). Likewise for Dec.
    // This is the correct behaviour for a name-stable truncating formatter:
    // the name encodes the coordinate *as stored*, not the decimal ideal.
    expect(sdssName(188.7365, 1.396)).toBe('SDSS J123456.75+012345.5');
  });

  it('handles ra=0, dec=0', () => {
    expect(sdssName(0, 0)).toBe('SDSS J000000.00+000000.0');
  });

  it('handles ra=0, dec=-45', () => {
    // Dec part: -DDMMSS.s → -450000.0
    expect(sdssName(0, -45)).toBe('SDSS J000000.00-450000.0');
  });

  it('handles near-edge ra=359.99999, dec=89.99999 without rounding up fields', () => {
    // Should truncate, not round — the name must not "roll over" to the next unit
    const name = sdssName(359.99999, 89.99999);
    expect(name).toMatch(/^SDSS J/);
    // RA: 359.99999/15 = 23.99999933…h → 23h, 59.999…m → 59m, 59.9…s → truncated to 59.99
    expect(name).toMatch(/^SDSS J235959\.\d{2}/);
  });
});

// ─── C. lookbackTimeGyr ──────────────────────────────────────────────────────

describe('lookbackTimeGyr', () => {
  it('returns 0 at z=0 (present epoch)', () => {
    expect(lookbackTimeGyr(0)).toBe(0);
  });

  it('returns ~1.27 Gyr at z=0.1 (within 0.05)', () => {
    // t_H ≈ 13.97 Gyr; z/(1+z) = 0.1/1.1 ≈ 0.0909; 0.0909 × 13.97 ≈ 1.27
    expect(close(lookbackTimeGyr(0.1), 1.27, 0.05)).toBe(true);
  });

  it('returns ~6.99 Gyr at z=1 (≈ half of Hubble time, within 0.05)', () => {
    // z/(1+z) = 0.5; 0.5 × 13.97 ≈ 6.985
    expect(close(lookbackTimeGyr(1), 6.99, 0.05)).toBe(true);
  });
});

// ─── C. hubbleVelocityKmS ────────────────────────────────────────────────────

describe('hubbleVelocityKmS', () => {
  it('returns 0 at z=0', () => {
    expect(hubbleVelocityKmS(0)).toBe(0);
  });

  it('returns ~29979.25 km/s at z=0.1', () => {
    // c × z = 299792.458 × 0.1 = 29979.2458
    expect(close(hubbleVelocityKmS(0.1), 29979.25, 0.01)).toBe(true);
  });
});

// ─── C. absoluteMagnitude ────────────────────────────────────────────────────

describe('absoluteMagnitude', () => {
  it('returns NaN when distanceMpc <= 0', () => {
    expect(absoluteMagnitude(18, 0)).toBeNaN();
    expect(absoluteMagnitude(18, -5)).toBeNaN();
  });

  it('computes M = m − 5·log10(d_Mpc) − 25 for d=100 Mpc, m=18', () => {
    // 18 - 5·log10(100) - 25 = 18 - 10 - 25 = -17
    expect(close(absoluteMagnitude(18, 100), -17, 0.001)).toBe(true);
  });

  it('computes M = m − 5·log10(d_Mpc) − 25 for d=1000 Mpc, m=20', () => {
    // 20 - 5·log10(1000) - 25 = 20 - 15 - 25 = -20
    expect(close(absoluteMagnitude(20, 1000), -20, 0.001)).toBe(true);
  });

  it('computes M for d=10 Mpc, m=15', () => {
    // 15 - 5·log10(10) - 25 = 15 - 5 - 25 = -15
    expect(close(absoluteMagnitude(15, 10), -15, 0.001)).toBe(true);
  });
});

// ─── D. earthEraForLookback ───────────────────────────────────────────────────

describe('earthEraForLookback', () => {
  it('returns "essentially now (modern era)" for < 0.001 Gyr', () => {
    expect(earthEraForLookback(0)).toBe('essentially now (modern era)');
    expect(earthEraForLookback(0.0005)).toBe('essentially now (modern era)');
    // strict upper boundary: 0.001 belongs to the next band
    expect(earthEraForLookback(0.0009999)).toBe('essentially now (modern era)');
  });

  it('returns "during the rise of human civilisation" for [0.001, 0.0026)', () => {
    expect(earthEraForLookback(0.001)).toBe('during the rise of human civilisation');
    expect(earthEraForLookback(0.002)).toBe('during the rise of human civilisation');
  });

  it('returns "before the first humans" for [0.0026, 0.066)', () => {
    expect(earthEraForLookback(0.0026)).toBe('before the first humans');
    expect(earthEraForLookback(0.01)).toBe('before the first humans');
  });

  it('returns "before the dinosaurs went extinct" for [0.066, 0.25)', () => {
    // 0.066 is the lower boundary of this band (strict less-than upper band)
    expect(earthEraForLookback(0.066)).toBe('before the dinosaurs went extinct');
    expect(earthEraForLookback(0.1)).toBe('before the dinosaurs went extinct');
  });

  it('returns "before the dinosaurs evolved" for [0.25, 0.54)', () => {
    expect(earthEraForLookback(0.25)).toBe('before the dinosaurs evolved');
    expect(earthEraForLookback(0.4)).toBe('before the dinosaurs evolved');
  });

  it('returns "before the Cambrian explosion" for [0.54, 1.0)', () => {
    expect(earthEraForLookback(0.54)).toBe('before the Cambrian explosion');
    expect(earthEraForLookback(0.8)).toBe('before the Cambrian explosion');
  });

  it('returns "during Earth\'s Mesoproterozoic" for [1.0, 1.6)', () => {
    expect(earthEraForLookback(1.0)).toBe("during Earth's Mesoproterozoic");
    expect(earthEraForLookback(1.3)).toBe("during Earth's Mesoproterozoic");
  });

  it('returns "before complex life appeared on Earth" for [1.6, 2.4)', () => {
    expect(earthEraForLookback(1.6)).toBe('before complex life appeared on Earth');
    expect(earthEraForLookback(2.0)).toBe('before complex life appeared on Earth');
  });

  it('returns "before Earth\'s atmosphere had oxygen" for [2.4, 3.5)', () => {
    expect(earthEraForLookback(2.4)).toBe("before Earth's atmosphere had oxygen");
    expect(earthEraForLookback(3.0)).toBe("before Earth's atmosphere had oxygen");
  });

  it('returns "near the time the first life emerged on Earth" for [3.5, 4.5)', () => {
    expect(earthEraForLookback(3.5)).toBe('near the time the first life emerged on Earth');
    expect(earthEraForLookback(4.0)).toBe('near the time the first life emerged on Earth');
  });

  it('returns "before Earth even existed" for [4.5, 13.7)', () => {
    expect(earthEraForLookback(4.5)).toBe('before Earth even existed');
    expect(earthEraForLookback(10.0)).toBe('before Earth even existed');
  });

  it('returns "near the dawn of the universe" for >= 13.7 Gyr', () => {
    expect(earthEraForLookback(13.7)).toBe('near the dawn of the universe');
    expect(earthEraForLookback(13.8)).toBe('near the dawn of the universe');
  });
});

// ─── E. galaxyTypeFromColor ───────────────────────────────────────────────────

describe('galaxyTypeFromColor', () => {
  it('classifies u−r = 2.5 as red, quiescent', () => {
    const result = galaxyTypeFromColor(2.5);
    expect(result.category).toBe('red');
    expect(result.description).toMatch(/^Red/);
  });

  it('classifies u−r = 2.2 (boundary) as red', () => {
    // u−r > 2.2 is red; exactly 2.2 is blue
    const above = galaxyTypeFromColor(2.201);
    expect(above.category).toBe('red');
    const at = galaxyTypeFromColor(2.2);
    expect(at.category).toBe('blue');
  });

  it('classifies u−r = 1.0 as blue, star-forming', () => {
    const result = galaxyTypeFromColor(1.0);
    expect(result.category).toBe('blue');
    expect(result.description).toMatch(/^Blue/);
  });

  it('classifies NaN as unknown (missing photometry)', () => {
    const result = galaxyTypeFromColor(NaN);
    expect(result.category).toBe('unknown');
  });
});

// ─── F. sdssExplorerUrl ───────────────────────────────────────────────────────

describe('sdssExplorerUrl', () => {
  it('builds the correct DR18 Quick Look URL for a given objId', () => {
    const url = sdssExplorerUrl(1237651738291011584n);
    expect(url).toBe(
      'http://skyserver.sdss.org/dr18/VisualTools/quickobj?objId=1237651738291011584',
    );
  });
});

// ─── F. sdssThumbnailUrl ──────────────────────────────────────────────────────

describe('sdssThumbnailUrl', () => {
  it('builds the correct cutout URL with default size 160', () => {
    const url = sdssThumbnailUrl(180, 0);
    expect(url).toContain('ra=180');
    expect(url).toContain('dec=0');
    expect(url).toContain('scale=0.4');
    expect(url).toContain('width=160');
    expect(url).toContain('height=160');
  });

  it('clamps sizePx above 2048 to 2048', () => {
    const url = sdssThumbnailUrl(180, 0, 4096);
    expect(url).toContain('width=2048');
    expect(url).toContain('height=2048');
  });

  it('clamps sizePx below 32 to 32', () => {
    const url = sdssThumbnailUrl(180, 0, 8);
    expect(url).toContain('width=32');
    expect(url).toContain('height=32');
  });

  it('uses the provided size when within [32, 2048]', () => {
    const url = sdssThumbnailUrl(45, 30, 256);
    expect(url).toContain('width=256');
    expect(url).toContain('height=256');
  });
});
