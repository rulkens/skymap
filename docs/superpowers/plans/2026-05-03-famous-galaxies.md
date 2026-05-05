# Famous Galaxies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated catalog of well-known galaxies (Messier + NGC greatest-hits) renderable as a fourth source layer alongside SDSS / 2MRS / GLADE, searchable via a Cmd+K command palette, with curated transparent-background thumbnails and cross-match links to the existing catalogs in the InfoCard.

**Architecture:** A hand-written seed JSON (`data/famous_galaxies.seed.json`) feeds two build-time scripts: one (`tools/fetchFamousImages.ts`) downloads DESI Legacy cutouts and processes them into transparent WebPs; another (`tools/buildFamous.ts`) cross-matches each entry against the existing 2MRS/GLADE bins and writes both `public/data/famous.bin` (v4 PointCloud, same format as the other catalogs) and a `public/data/famous_xrefs.json` sidecar. At runtime, the renderer treats Famous as a normal `Source`, but the engine's per-frame quad pass special-cases it to (a) skip the apparent-size threshold (always show landmark thumbnails) and (b) load images from `/images/famous/<id>.webp` rather than the dynamic SDSS/DSS fetcher. A new `<CommandPalette>` React component triggered by Cmd+K lets the user search the catalog by name and focus the camera on any entry.

**Tech Stack:** TypeScript, WebGPU + WGSL, Vite, React, Vitest, `sharp` (image processing — new dependency).

---

## File Structure

### New files

- **`data/famous_galaxies.seed.json`** — hand-curated seed catalog (~20 Messier galaxies to start; expandable).
- **`tools/parsers/famousSeed.ts`** — parse + validate the seed JSON.
- **`tools/famousImageProcessor.ts`** — pure image-processing helpers (corner-sample background subtraction + radial alpha fade). Pure-function module so we can unit-test the algorithm without hitting the network.
- **`tools/fetchFamousImages.ts`** — CLI that walks the seed JSON, fetches DESI cutouts, runs the processor, writes WebPs.
- **`tools/buildFamous.ts`** — CLI that walks the seed JSON, cross-matches against existing `.bin` files, writes `famous.bin` + `famous_xrefs.json` + `famous_meta.json`.
- **`public/data/famous_xrefs.json`** — runtime sidecar: per-id cross-match record.
- **`public/data/famous_meta.json`** — runtime sidecar: per-localIdx → id + names + description (so `pointInfoBuilder` can look up famous metadata).
- **`public/images/famous/<id>.webp`** — one per famous galaxy.
- **`src/services/engine/famousMetaLoader.ts`** — fetches + caches `famous_meta.json` and `famous_xrefs.json` at startup.
- **`src/components/CommandPalette/CommandPalette.tsx`** — React component for the search overlay.
- **`src/components/CommandPalette/CommandPalette.module.css`** — its styles.
- **Tests** mirroring each src/tools file under `tests/`.

### Modified files

- **`src/data/sources.ts`** — add `Source.Famous = 4`.
- **`src/services/engine/cloudLoader.ts`** — load `famous.bin` alongside the other three.
- **`src/services/engine/engine.ts`** — special-case Famous in the quad pass (always include, skip apparent-size gate, use local WebP path).
- **`src/services/gpu/galaxyImageFetcher.ts`** — add a Famous branch that loads `/images/famous/<id>.webp`.
- **`src/services/engine/pointInfoBuilder.ts`** — extend with optional `famousMeta` lookup; populate new `PointInfo.famous` field when source is Famous.
- **`src/@types/PointInfo.d.ts`** — add optional `famous` block (`{ id, names, description, xref }`).
- **`src/@types/EngineHandle.d.ts`** — add `selectFamous(id: string): void` so the command palette can pin a galaxy from outside the engine.
- **`src/components/InfoCard/FullCard.tsx`** — render the famous-block when present.
- **`src/App.tsx`** — mount `<CommandPalette>` and wire up the Cmd+K binding.
- **`package.json`** — add `sharp` dependency, add `build-famous` and `fetch-famous-images` scripts.
- **`README.md`** — document the new feature + commands.

---

## Task 0: Pre-flight — confirm clean baseline

**Files:** none (read-only check)

- [ ] **Step 1: Verify typecheck and full suite are green before starting**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: typecheck clean, **all tests pass** (211 + at the time of writing). If any failure, stop and report — this plan assumes the pre-existing real-sizes work is fully landed.

- [ ] **Step 2: Verify the existing `.bin` files exist (cross-match needs them)**

Run:

```
ls -lh /Users/rulkens/Development/js/skymap/public/data/2mrs.bin /Users/rulkens/Development/js/skymap/public/data/glade.bin
```

Expected: both files present. If absent, run `npm run build-all` first — `tools/buildFamous.ts` (Task 9) reads them.

- [ ] **Step 3: Sanity-probe the DESI Legacy cutout endpoint**

Run:

```
curl -sIL --max-time 15 "https://www.legacysurvey.org/viewer/cutout.jpg?ra=10.6847&dec=41.2687&layer=ls-dr10&pixscale=2&size=256" | head -3
```

Expected: `HTTP/2 200`, `content-type: image/jpeg`. The endpoint is the canonical DESI Legacy Imaging cutout service. If it has moved, search for the current endpoint at `https://www.legacysurvey.org/` before continuing — every other task that touches images depends on this URL.

---

## Task 1: Add `Source.Famous` enum value + per-source metadata entries

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/data/sources.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tests/data/sources.test.ts` (verify or create)

- [ ] **Step 1: Add a failing test for the new enum value**

Open or create `/Users/rulkens/Development/js/skymap/tests/data/sources.test.ts`. Append:

```ts
import { describe, it, expect } from 'vitest';
import {
  Source,
  ALL_SOURCES,
  ALL_VISIBLE_MASK,
  sourceLabel,
  sourceIsAllSky,
  sourceMaxDistanceMpc,
  bandLabels,
  maskHas,
} from '../../src/data/sources';

describe('Source.Famous', () => {
  it('has integer value 4 (next free slot after Glade=3)', () => {
    expect(Source.Famous).toBe(4);
  });

  it('appears in ALL_SOURCES', () => {
    expect(ALL_SOURCES).toContain(Source.Famous);
  });

  it('is included in ALL_VISIBLE_MASK', () => {
    expect(maskHas(ALL_VISIBLE_MASK, Source.Famous)).toBe(true);
  });

  it('has a non-empty display label', () => {
    expect(sourceLabel(Source.Famous).length).toBeGreaterThan(0);
  });

  it('is treated as all-sky (cherry-picked entries from anywhere)', () => {
    expect(sourceIsAllSky(Source.Famous)).toBe(true);
  });

  it('has a sensible default max-distance for camera framing', () => {
    // Famous nearby galaxies span M31 (0.78 Mpc) to NGC 4889 (~94 Mpc);
    // pad to 200 Mpc so the camera frames the whole catalog comfortably.
    expect(sourceMaxDistanceMpc(Source.Famous)).toBeGreaterThanOrEqual(200);
  });

  it('exposes the SDSS-like band layout (curated metadata uses optical bands)', () => {
    // Curated entries don't carry photometry; the band layout is cosmetic
    // — InfoCard uses it to label colour rows. We mirror SDSS so the
    // existing FullCard markup renders cleanly without a new branch.
    const bands = bandLabels(Source.Famous);
    expect(bands.g).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```
npx vitest run tests/data/sources.test.ts
```

Expected: at least 5 of 7 new tests fail (compile error from `Source.Famous` undefined or label undefined).

- [ ] **Step 3: Add `Source.Famous` and metadata entries**

In `/Users/rulkens/Development/js/skymap/src/data/sources.ts`, modify the `Source` enum to add a new member after `Glade`:

```ts
export enum Source {
  Synthetic = 0,
  SDSS = 1,
  TwoMRS = 2,
  Glade = 3,
  /**
   * Curated atlas of well-known galaxies (Messier + NGC greatest-hits).
   * Distinct from the survey-derived sources because entries are
   * hand-picked + carry curated descriptions and high-quality processed
   * thumbnails.  Many entries (M31, M33, M81, NGC 253) sit too close to
   * us to survive 2MRS/GLADE's small-z filtering, so they need their own
   * positions rather than just tagging existing rows.
   */
  Famous = 4,
}
```

Add entries to every per-source metadata table:

```ts
const LABELS: Record<Source, string> = {
  [Source.Synthetic]: 'Synthetic',
  [Source.SDSS]: 'SDSS',
  [Source.TwoMRS]: '2MRS',
  [Source.Glade]: 'GLADE',
  [Source.Famous]: 'Famous',
};
```

```ts
const ALL_SKY: Record<Source, boolean> = {
  [Source.Synthetic]: true,
  [Source.SDSS]: false,
  [Source.TwoMRS]: true,
  [Source.Glade]: true,
  [Source.Famous]: true, // hand-picked entries from across the sky
};
```

```ts
const MAX_DIST_MPC: Record<Source, number> = {
  [Source.Synthetic]: 1000,
  [Source.SDSS]: 3000,
  [Source.TwoMRS]: 250,
  [Source.Glade]: 1500,
  [Source.Famous]: 200, // covers the curated set: M31 → NGC 4889
};
```

```ts
const BAND_LABELS: Record<Source, BandLabels> = {
  [Source.Synthetic]: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  [Source.SDSS]: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
  [Source.TwoMRS]: { u: '—', g: 'J', r: 'H', i: 'K', z: '—' },
  [Source.Glade]: { u: '—', g: 'B', r: 'J', i: 'H', z: 'K' },
  // Famous entries don't carry per-row photometry (we don't repeat what
  // the source survey already measured).  Mirror the SDSS labels purely
  // so the InfoCard markup renders generic "(g)" tags without a new
  // branch — the actual mag values stored on the cloud are NaN, which
  // FullCard already gracefully renders as "N/A".
  [Source.Famous]: { u: 'u', g: 'g', r: 'r', i: 'i', z: 'z' },
};
```

Append to `ALL_SOURCES`:

```ts
export const ALL_SOURCES: readonly Source[] = [
  Source.Synthetic,
  Source.SDSS,
  Source.TwoMRS,
  Source.Glade,
  Source.Famous,
];
```

`ALL_VISIBLE_MASK` is computed from `ALL_SOURCES` so it picks up the new bit automatically.

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```
npx vitest run tests/data/sources.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Run the full suite to make sure nothing else broke**

Run:

```
npm run typecheck && npm test
```

Expected: typecheck clean, no test regressions. Some adjacent code (e.g. exhaustive-switch checks elsewhere) may now flag missing `Source.Famous` cases — fix those inline by adding `case Source.Famous:` arms that mirror Glade's behaviour, since Famous is rendered the same way as the survey sources at the GPU level.

- [ ] **Step 6: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/data/sources.ts tests/data/sources.test.ts && git commit -m "feat(sources): add Source.Famous as the curated atlas slot (enum value 4)"
```

---

## Task 2: Define + author the seed catalog JSON schema

**Files:**

- Create: `/Users/rulkens/Development/js/skymap/data/famous_galaxies.seed.json`
- Create: `/Users/rulkens/Development/js/skymap/tools/parsers/famousSeed.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/parsers/famousSeed.test.ts`

- [ ] **Step 1: Author the seed JSON with 20 Messier galaxies**

Create `/Users/rulkens/Development/js/skymap/data/famous_galaxies.seed.json`:

```json
[
  {
    "id": "m31",
    "names": ["M31", "NGC 224", "Andromeda Galaxy"],
    "ra": 10.6847,
    "dec": 41.2687,
    "distanceMpc": 0.778,
    "diameterKpc": 67.5,
    "type": "SA(s)b",
    "description": "The nearest large spiral galaxy, M31 (Andromeda) sits 778 kpc away and spans about 220,000 light-years — roughly twice the Milky Way's diameter.  Visible to the naked eye as a faint smudge, it is on a collision course with our own galaxy."
  },
  {
    "id": "m33",
    "names": ["M33", "NGC 598", "Triangulum Galaxy"],
    "ra": 23.4621,
    "dec": 30.6602,
    "distanceMpc": 0.84,
    "diameterKpc": 18.5,
    "type": "SA(s)cd",
    "description": "The third-largest member of the Local Group, M33 is a flocculent spiral about half the size of the Milky Way.  Its distance has been used as a key calibrator on the cosmic distance ladder."
  },
  {
    "id": "m51",
    "names": ["M51", "NGC 5194", "Whirlpool Galaxy"],
    "ra": 202.4696,
    "dec": 47.1952,
    "distanceMpc": 7.22,
    "diameterKpc": 23.6,
    "type": "SA(s)bc pec",
    "description": "M51 is the canonical face-on grand-design spiral, currently interacting with the dwarf companion NGC 5195.  Hubble's most-photographed galaxy after M31."
  },
  {
    "id": "m58",
    "names": ["M58", "NGC 4579"],
    "ra": 189.4313,
    "dec": 11.8181,
    "distanceMpc": 19.3,
    "diameterKpc": 33.7,
    "type": "SAB(rs)b",
    "description": "A barred spiral in the Virgo cluster, M58 hosts a low-luminosity active galactic nucleus and is one of the brightest galaxies in the cluster's central concentration."
  },
  {
    "id": "m59",
    "names": ["M59", "NGC 4621"],
    "ra": 190.5093,
    "dec": 11.6469,
    "distanceMpc": 16.5,
    "diameterKpc": 24.3,
    "type": "E5",
    "description": "M59 is an elliptical galaxy in Virgo containing one of the most massive black holes known in the local universe (≈ 5 billion solar masses)."
  },
  {
    "id": "m61",
    "names": ["M61", "NGC 4303"],
    "ra": 185.479,
    "dec": 4.4737,
    "distanceMpc": 16.0,
    "diameterKpc": 31.0,
    "type": "SAB(rs)bc",
    "description": "A starburst spiral and one of the largest galaxies in the Virgo cluster, M61 has hosted six observed supernovae since 1926 — an unusually high rate."
  },
  {
    "id": "m64",
    "names": ["M64", "NGC 4826", "Black Eye Galaxy"],
    "ra": 194.1818,
    "dec": 21.6822,
    "distanceMpc": 5.2,
    "diameterKpc": 16.5,
    "type": "(R)SA(rs)ab",
    "description": "Named for the prominent dust band absorbing light in front of its bright nucleus, M64's gas in the outer disk rotates in the opposite direction to the inner disk — evidence of a past minor merger."
  },
  {
    "id": "m77",
    "names": ["M77", "NGC 1068", "Cetus A"],
    "ra": 40.6696,
    "dec": -0.0133,
    "distanceMpc": 14.4,
    "diameterKpc": 36.4,
    "type": "(R)SA(rs)b",
    "description": "M77 is the closest type-2 Seyfert galaxy and one of the brightest active galactic nuclei in the local universe — a textbook case of an obscured supermassive black hole."
  },
  {
    "id": "m81",
    "names": ["M81", "NGC 3031", "Bode's Galaxy"],
    "ra": 148.8882,
    "dec": 69.0653,
    "distanceMpc": 3.66,
    "diameterKpc": 29.0,
    "type": "SA(s)ab",
    "description": "A grand-design spiral 3.7 Mpc away, M81 is the largest member of its eponymous galaxy group and a popular target for amateur astronomers in the spring sky."
  },
  {
    "id": "m82",
    "names": ["M82", "NGC 3034", "Cigar Galaxy"],
    "ra": 148.9697,
    "dec": 69.6798,
    "distanceMpc": 3.53,
    "diameterKpc": 11.5,
    "type": "I0",
    "description": "An edge-on starburst galaxy in the M81 group, M82 is being gravitationally disturbed by M81 — driving an enormous nuclear starburst with hot gas streaming kiloparsecs above the disk."
  },
  {
    "id": "m83",
    "names": ["M83", "NGC 5236", "Southern Pinwheel"],
    "ra": 204.2538,
    "dec": -29.8654,
    "distanceMpc": 4.66,
    "diameterKpc": 16.3,
    "type": "SAB(s)c",
    "description": "A face-on barred spiral with a prominent star-forming bar, M83 has hosted six supernovae and is one of the closest barred spirals to us."
  },
  {
    "id": "m84",
    "names": ["M84", "NGC 4374"],
    "ra": 186.2654,
    "dec": 12.887,
    "distanceMpc": 18.4,
    "diameterKpc": 26.4,
    "type": "E1",
    "description": "A giant elliptical near the heart of the Virgo cluster, M84 displays radio jets emerging from a central supermassive black hole."
  },
  {
    "id": "m86",
    "names": ["M86", "NGC 4406"],
    "ra": 186.5494,
    "dec": 12.9462,
    "distanceMpc": 16.9,
    "diameterKpc": 41.0,
    "type": "S0",
    "description": "A lenticular giant in the Virgo cluster, M86 has the highest blueshift of any Messier object — it's plunging toward us at over 400 km/s as it falls through the cluster core."
  },
  {
    "id": "m87",
    "names": ["M87", "NGC 4486", "Virgo A"],
    "ra": 187.7059,
    "dec": 12.3911,
    "distanceMpc": 16.4,
    "diameterKpc": 40.5,
    "type": "E0-1",
    "description": "The supergiant elliptical at the heart of the Virgo cluster, M87 hosts the first black hole ever directly imaged (Event Horizon Telescope, 2019).  Its relativistic jet is visible from optical to radio wavelengths."
  },
  {
    "id": "m88",
    "names": ["M88", "NGC 4501"],
    "ra": 187.9966,
    "dec": 14.4203,
    "distanceMpc": 16.5,
    "diameterKpc": 33.6,
    "type": "SA(rs)b",
    "description": "A multi-armed spiral in the Virgo cluster, M88 is one of the cluster's brightest spirals and shows clear signs of ram-pressure stripping by intracluster gas."
  },
  {
    "id": "m90",
    "names": ["M90", "NGC 4569"],
    "ra": 188.5938,
    "dec": 13.1626,
    "distanceMpc": 16.5,
    "diameterKpc": 39.7,
    "type": "SAB(rs)ab",
    "description": "A blueshifted Virgo spiral whose gas is being progressively stripped by the cluster — leaving behind an anaemic disk with truncated star formation."
  },
  {
    "id": "m99",
    "names": ["M99", "NGC 4254", "Virgo Cluster Pinwheel"],
    "ra": 184.7065,
    "dec": 14.4163,
    "distanceMpc": 16.2,
    "diameterKpc": 25.4,
    "type": "SA(s)c",
    "description": "An asymmetric grand-design spiral on the outskirts of the Virgo cluster.  Its lopsided structure is thought to result from a recent high-speed encounter with the cluster's hot gas."
  },
  {
    "id": "m100",
    "names": ["M100", "NGC 4321"],
    "ra": 185.7287,
    "dec": 15.8224,
    "distanceMpc": 16.4,
    "diameterKpc": 33.4,
    "type": "SAB(s)bc",
    "description": "A face-on grand-design spiral in Virgo and one of the brightest galaxies in its cluster, M100 was used by Hubble's Cepheid distance ladder to anchor the local distance scale."
  },
  {
    "id": "m101",
    "names": ["M101", "NGC 5457", "Pinwheel Galaxy"],
    "ra": 210.8023,
    "dec": 54.3486,
    "distanceMpc": 6.86,
    "diameterKpc": 52.6,
    "type": "SAB(rs)cd",
    "description": "M101 is one of the largest and most luminous spirals in the local universe — a grand-design spiral nearly 70% larger than the Milky Way, with a famously asymmetric arm pattern from a past encounter with NGC 5474."
  },
  {
    "id": "m104",
    "names": ["M104", "NGC 4594", "Sombrero Galaxy"],
    "ra": 189.9976,
    "dec": -11.6231,
    "distanceMpc": 9.55,
    "diameterKpc": 15.0,
    "type": "SA(s)a",
    "description": "Famous for its bright nucleus and prominent dust lane, M104 is a near edge-on spiral with an unusually large central bulge.  Hosts a billion-solar-mass black hole."
  }
]
```

- [ ] **Step 2: Add a failing test for the parser/validator**

Create `/Users/rulkens/Development/js/skymap/tests/parsers/famousSeed.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFamousSeed, validateFamousEntry } from '../../tools/parsers/famousSeed';

describe('parseFamousSeed', () => {
  it('parses a minimal one-entry seed', () => {
    const json = JSON.stringify([
      {
        id: 'm31',
        names: ['M31', 'Andromeda Galaxy'],
        ra: 10.68,
        dec: 41.27,
        distanceMpc: 0.778,
        diameterKpc: 67.5,
        type: 'SA(s)b',
        description: 'Andromeda.',
      },
    ]);
    const entries = parseFamousSeed(json);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe('m31');
    expect(entries[0]!.names).toContain('Andromeda Galaxy');
  });

  it('rejects entries with duplicate ids', () => {
    const dup = [
      {
        id: 'm31',
        names: ['M31'],
        ra: 10,
        dec: 41,
        distanceMpc: 0.778,
        diameterKpc: 67,
        type: 'Sb',
        description: 'a',
      },
      {
        id: 'm31',
        names: ['M31 alt'],
        ra: 11,
        dec: 42,
        distanceMpc: 0.8,
        diameterKpc: 68,
        type: 'Sb',
        description: 'b',
      },
    ];
    expect(() => parseFamousSeed(JSON.stringify(dup))).toThrow(/duplicate id/i);
  });

  it('rejects ra outside [0, 360)', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 360.1,
        dec: 0,
        distanceMpc: 1,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
      } as never),
    ).toThrow(/ra/);
  });

  it('rejects dec outside [-90, 90]', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 0,
        dec: 90.1,
        distanceMpc: 1,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
      } as never),
    ).toThrow(/dec/);
  });

  it('rejects non-positive distance or diameter', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 0,
        dec: 0,
        distanceMpc: 0,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
      } as never),
    ).toThrow(/distance/);
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: ['x'],
        ra: 0,
        dec: 0,
        distanceMpc: 1,
        diameterKpc: 0,
        type: 'E',
        description: 'x',
      } as never),
    ).toThrow(/diameter/);
  });

  it('rejects empty names array (a galaxy without names is unaddressable)', () => {
    expect(() =>
      validateFamousEntry({
        id: 'x',
        names: [],
        ra: 0,
        dec: 0,
        distanceMpc: 1,
        diameterKpc: 10,
        type: 'E',
        description: 'x',
      } as never),
    ).toThrow(/names/);
  });

  it('parses the real seed file we ship', async () => {
    const fs = await import('node:fs');
    const path = '/Users/rulkens/Development/js/skymap/data/famous_galaxies.seed.json';
    const raw = fs.readFileSync(path, 'utf8');
    const entries = parseFamousSeed(raw);
    // Sanity: at least 20 Messier seeds; every entry has a name and an RA.
    expect(entries.length).toBeGreaterThanOrEqual(20);
    for (const e of entries) {
      expect(e.names.length).toBeGreaterThan(0);
      expect(Number.isFinite(e.ra)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```
npx vitest run tests/parsers/famousSeed.test.ts
```

Expected: every test fails with `Cannot find module '../../tools/parsers/famousSeed'`.

- [ ] **Step 4: Implement the parser/validator**

Create `/Users/rulkens/Development/js/skymap/tools/parsers/famousSeed.ts`:

```ts
/**
 * famousSeed — parse + validate the hand-curated `famous_galaxies.seed.json`.
 *
 * The seed file is the single source of truth for which galaxies the
 * curated atlas knows about.  Two scripts read it: `fetchFamousImages.ts`
 * (downloads and processes thumbnails) and `buildFamous.ts` (cross-matches
 * against the survey bins and emits the runtime artefacts).  Centralising
 * parsing + validation here means a single typo in the JSON surfaces as
 * one clear error, not two cryptic crashes from two different scripts.
 *
 * The schema is small enough that we hand-roll validation rather than
 * pulling in zod/ajv — six fields, all primitive, fail-loud throws make
 * for clearer error messages than nested validator output.
 *
 * Why are duplicate IDs a hard error?  The id is the URL-safe key that
 * names the WebP file, the cross-ref entry, and the `famousId` lookup
 * key in `pointInfoBuilder.ts`.  A duplicate would silently overwrite
 * an entry's images at fetch time and confuse the cross-ref lookup at
 * runtime.
 */

/**
 * One curated entry — exactly the shape stored in `famous_galaxies.seed.json`.
 *
 * Why a `type` (not `interface`)?  Project convention — see CLAUDE.md.
 */
export type FamousEntry = {
  /**
   * URL-safe lower-case identifier (e.g. `'m31'`, `'ngc-5128'`).  Used
   * as the WebP filename and as the cross-ref/meta lookup key.
   */
  id: string;
  /**
   * One or more human-readable names, ordered by preference (primary
   * first).  E.g. `['M31', 'NGC 224', 'Andromeda Galaxy']`.  The command
   * palette searches all names; the InfoCard shows the first as the
   * headline and the rest as "also known as".
   */
  names: string[];
  /** Right Ascension in degrees, [0, 360). */
  ra: number;
  /** Declination in degrees, [-90, 90]. */
  dec: number;
  /**
   * Distance in megaparsecs.  Curated value (NED / HyperLEDA), not
   * derived from a tiny redshift.  Famous nearby galaxies (M31, M33)
   * have peculiar velocities that dominate over Hubble flow, so
   * `redshiftToDistanceMpc(z)` would be wildly wrong.
   */
  distanceMpc: number;
  /** Physical isophotal diameter in kpc. */
  diameterKpc: number;
  /** Hubble morphological type as a free-form string (e.g. `'SA(s)b'`). */
  type: string;
  /** 1-3 sentence curated blurb shown in the InfoCard. */
  description: string;
};

/**
 * Validate a single entry from the seed file.  Throws on any malformed
 * field with a message naming the offending entry's id.  Returning the
 * input unchanged lets callers chain through `validateFamousEntry`
 * without re-typing the variable.
 */
export function validateFamousEntry(e: FamousEntry): FamousEntry {
  if (typeof e.id !== 'string' || e.id.length === 0) {
    throw new Error(`famous seed: missing id on entry ${JSON.stringify(e).slice(0, 60)}`);
  }
  if (!Array.isArray(e.names) || e.names.length === 0) {
    throw new Error(`famous seed: ${e.id} has empty names array`);
  }
  if (!Number.isFinite(e.ra) || e.ra < 0 || e.ra >= 360) {
    throw new Error(`famous seed: ${e.id} has out-of-range ra ${e.ra}`);
  }
  if (!Number.isFinite(e.dec) || e.dec < -90 || e.dec > 90) {
    throw new Error(`famous seed: ${e.id} has out-of-range dec ${e.dec}`);
  }
  if (!Number.isFinite(e.distanceMpc) || e.distanceMpc <= 0) {
    throw new Error(`famous seed: ${e.id} has non-positive distance ${e.distanceMpc}`);
  }
  if (!Number.isFinite(e.diameterKpc) || e.diameterKpc <= 0) {
    throw new Error(`famous seed: ${e.id} has non-positive diameter ${e.diameterKpc}`);
  }
  if (typeof e.type !== 'string') {
    throw new Error(`famous seed: ${e.id} missing morphological type`);
  }
  if (typeof e.description !== 'string') {
    throw new Error(`famous seed: ${e.id} missing description`);
  }
  return e;
}

/**
 * Parse and validate the entire seed JSON.  Throws on any per-entry
 * problem AND on duplicate ids across the catalog.
 */
export function parseFamousSeed(rawJson: string): FamousEntry[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) {
    throw new Error('famous seed: root must be an array');
  }
  const seen = new Set<string>();
  const out: FamousEntry[] = [];
  for (const e of parsed) {
    validateFamousEntry(e as FamousEntry);
    const id = (e as FamousEntry).id;
    if (seen.has(id)) {
      throw new Error(`famous seed: duplicate id "${id}"`);
    }
    seen.add(id);
    out.push(e as FamousEntry);
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```
npx vitest run tests/parsers/famousSeed.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 6: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add data/famous_galaxies.seed.json tools/parsers/famousSeed.ts tests/parsers/famousSeed.test.ts && git commit -m "feat(famous): seed catalog JSON + parser/validator (20 Messier galaxies)"
```

---

## Task 3: Image processor (pure background-removal helpers)

**Files:**

- Create: `/Users/rulkens/Development/js/skymap/tools/famousImageProcessor.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/famousImageProcessor.test.ts`

- [ ] **Step 1: Add `sharp` as a dev dependency**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm install --save-dev sharp
```

Expected: `package.json` gains `"sharp": "..."` under `devDependencies`. Verify by running `npm ls sharp` — should show a single entry without errors. If install fails on macOS, add `npm install --save-dev sharp --include=optional --foreground-scripts` (sharp ships native binaries).

- [ ] **Step 2: Write a failing test for the processor**

Create `/Users/rulkens/Development/js/skymap/tests/famousImageProcessor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sampleCornerColor, applyTransparency, type RGBA } from '../tools/famousImageProcessor';

/**
 * Build a 4x4 RGBA buffer where the corners are dark (sky) and the
 * centre is a bright greenish "galaxy" blob.  Layout (RGBA bytes):
 *   row 0: BG BG BG BG
 *   row 1: BG GAL GAL BG
 *   row 2: BG GAL GAL BG
 *   row 3: BG BG BG BG
 *
 * Each pixel is 4 bytes (R, G, B, A).  We initialise alpha=255
 * everywhere — the processor's job is to set sky pixels to alpha=0.
 */
function makeFixture(): { buf: Uint8ClampedArray; width: number; height: number } {
  const width = 4;
  const height = 4;
  const buf = new Uint8ClampedArray(width * height * 4);
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * width + x) * 4;
    buf[i + 0] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  };
  // Sky: dark navy (10, 10, 20)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      set(x, y, 10, 10, 20);
    }
  }
  // Galaxy blob in the central 2x2: bright green (40, 200, 60)
  for (const [x, y] of [
    [1, 1],
    [2, 1],
    [1, 2],
    [2, 2],
  ] as const) {
    set(x, y, 40, 200, 60);
  }
  return { buf, width, height };
}

describe('sampleCornerColor', () => {
  it('returns the average of the four corner pixels', () => {
    const { buf, width, height } = makeFixture();
    const c = sampleCornerColor(buf, width, height);
    expect(c.r).toBeCloseTo(10, 0);
    expect(c.g).toBeCloseTo(10, 0);
    expect(c.b).toBeCloseTo(20, 0);
    expect(c.a).toBe(255);
  });
});

describe('applyTransparency', () => {
  it('sets corner pixels to alpha 0 (matches sky color exactly)', () => {
    const { buf, width, height } = makeFixture();
    const sky: RGBA = { r: 10, g: 10, b: 20, a: 255 };
    applyTransparency(buf, width, height, sky, { skyTolerance: 5, fadeOuterFraction: 0 });
    // Top-left corner alpha = 0
    expect(buf[3]).toBe(0);
    // Top-right corner alpha = 0
    expect(buf[(0 * width + 3) * 4 + 3]).toBe(0);
    // Galaxy centre alpha unchanged
    expect(buf[(1 * width + 1) * 4 + 3]).toBe(255);
  });

  it('preserves galaxy pixels (color far from sky)', () => {
    const { buf, width, height } = makeFixture();
    const sky: RGBA = { r: 10, g: 10, b: 20, a: 255 };
    applyTransparency(buf, width, height, sky, { skyTolerance: 5, fadeOuterFraction: 0 });
    // All four galaxy pixels keep alpha=255.
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ] as const) {
      expect(buf[(y * width + x) * 4 + 3]).toBe(255);
    }
  });

  it('applies a radial fade in the outer ring when fadeOuterFraction > 0', () => {
    // 8x8 fixture, all pixels white, fade fraction = 0.5 (outer 50%).
    const width = 8;
    const height = 8;
    const buf = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < buf.length; i += 4) {
      buf[i + 0] = 200;
      buf[i + 1] = 200;
      buf[i + 2] = 200;
      buf[i + 3] = 255;
    }
    applyTransparency(
      buf,
      width,
      height,
      { r: 0, g: 0, b: 0, a: 255 },
      {
        skyTolerance: 0,
        fadeOuterFraction: 0.5,
      },
    );
    // Centre pixel alpha unchanged
    const centreIdx = (3 * width + 3) * 4 + 3;
    expect(buf[centreIdx]).toBeGreaterThan(200);
    // Edge pixel alpha reduced
    const edgeIdx = (0 * width + 0) * 4 + 3;
    expect(buf[edgeIdx]).toBeLessThan(200);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```
npx vitest run tests/famousImageProcessor.test.ts
```

Expected: every test fails (`Cannot find module '../tools/famousImageProcessor'`).

- [ ] **Step 4: Implement the processor**

Create `/Users/rulkens/Development/js/skymap/tools/famousImageProcessor.ts`:

```ts
/**
 * famousImageProcessor — pure helpers for turning a raw RGBA pixel buffer
 * into a transparent-background WebP suitable for the curated atlas.
 *
 * The DESI Legacy cutout service serves us a JPEG with a featureless dark
 * sky background and the galaxy in the middle.  We want a soft-edged WebP
 * with the sky cut out so the galaxy floats over the renderer's existing
 * particle field instead of sitting inside an opaque rectangle.
 *
 * Two stages, both pure functions over a Uint8ClampedArray of RGBA bytes:
 *
 *   1. `sampleCornerColor(buf, w, h)` — average the four corner pixels to
 *      establish a "what does sky look like in this image?" colour.  The
 *      cutout is sized to 1.3× the galaxy's diameter, so the corners are
 *      reliably outside the disk in all but the most extended objects.
 *
 *   2. `applyTransparency(buf, w, h, sky, opts)` — walk every pixel,
 *      compute its colour distance from `sky`, and set alpha = 0 when
 *      within `skyTolerance`.  Optionally apply a radial alpha fade in
 *      the outer `fadeOuterFraction` of the image so abrupt edges
 *      (galaxies that fill more of the frame than expected) still
 *      blend smoothly into the renderer.
 *
 * The actual fetch + WebP encoding is wired up in `fetchFamousImages.ts`
 * — keeping the processor a pure module makes the algorithm trivially
 * unit-testable and reusable if we ever swap image sources.
 */

/** RGBA tuple expressed as four `[0, 255]` integers + a 0..255 alpha. */
export type RGBA = { r: number; g: number; b: number; a: number };

/**
 * Sample the four corner pixels of an RGBA buffer and return their
 * average colour.  Used to establish the "sky" colour for the
 * transparency pass below.
 */
export function sampleCornerColor(buf: Uint8ClampedArray, width: number, height: number): RGBA {
  const corners: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of corners) {
    const i = (y * width + x) * 4;
    r += buf[i + 0]!;
    g += buf[i + 1]!;
    b += buf[i + 2]!;
  }
  return {
    r: r / corners.length,
    g: g / corners.length,
    b: b / corners.length,
    a: 255,
  };
}

/**
 * Options for `applyTransparency`.
 */
export type TransparencyOptions = {
  /**
   * Maximum Euclidean RGB distance (in 0..255 space) from the sky
   * reference colour for a pixel to be treated as background.  A pixel
   * within `skyTolerance` is set to alpha 0; further pixels keep their
   * original alpha (or get faded by the radial pass below).
   *
   * Tuning: 8-16 works for typical DESI cutouts; raise if sky still
   * shows through faintly, lower if dim galaxy halos get aggressively
   * cut.
   */
  skyTolerance: number;
  /**
   * Fraction of the image radius (0..1) that should fade out radially.
   * 0 disables the radial fade entirely (rely solely on colour-cut);
   * 0.2 fades the outer 20%; 1 fades from the centre out (probably too
   * aggressive — galaxy disks would lose contrast).
   */
  fadeOuterFraction: number;
};

/**
 * Mutate `buf` in place: set alpha=0 for sky-colour pixels and apply
 * a radial fade in the outer ring.
 */
export function applyTransparency(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  sky: RGBA,
  opts: TransparencyOptions,
): void {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxR = Math.hypot(cx, cy);
  // Inner radius below which the radial fade is identity (alpha unchanged).
  // Outside this we ramp linearly from 1 → 0 at the corners.
  const fadeInnerR = maxR * (1 - opts.fadeOuterFraction);
  const fadeBand = Math.max(1, maxR - fadeInnerR);

  const tolSq = opts.skyTolerance * opts.skyTolerance;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // ── Colour-cut against the sky reference ───────────────────────
      const dr = buf[i + 0]! - sky.r;
      const dg = buf[i + 1]! - sky.g;
      const db = buf[i + 2]! - sky.b;
      const distSq = dr * dr + dg * dg + db * db;
      if (distSq <= tolSq) {
        buf[i + 3] = 0;
        continue;
      }
      // ── Radial fade in the outer ring ─────────────────────────────
      if (opts.fadeOuterFraction > 0) {
        const r = Math.hypot(x - cx, y - cy);
        if (r > fadeInnerR) {
          const t = Math.min(1, (r - fadeInnerR) / fadeBand);
          // Smoothstep cubic — same shape WGSL's smoothstep uses.
          const fade = 1 - t * t * (3 - 2 * t);
          buf[i + 3] = Math.round(buf[i + 3]! * fade);
        }
      }
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:

```
npx vitest run tests/famousImageProcessor.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add tools/famousImageProcessor.ts tests/famousImageProcessor.test.ts package.json package-lock.json && git commit -m "feat(famous): pure RGBA → transparent-background image processor"
```

---

## Task 4: Image fetcher CLI

**Files:**

- Create: `/Users/rulkens/Development/js/skymap/tools/fetchFamousImages.ts`
- Modify: `/Users/rulkens/Development/js/skymap/package.json` (add npm script)

- [ ] **Step 1: Implement the fetcher CLI**

Create `/Users/rulkens/Development/js/skymap/tools/fetchFamousImages.ts`:

```ts
#!/usr/bin/env node
/**
 * fetchFamousImages — for every entry in `data/famous_galaxies.seed.json`,
 * download a DESI Legacy Imaging cutout sized to 1.3× the galaxy's
 * diameter, run it through the transparency processor, and write a
 * 256×256 WebP at `public/images/famous/<id>.webp`.
 *
 * Idempotent by default: skips entries whose WebP already exists.  Pass
 * `--force` to re-fetch every entry.
 *
 * DESI Legacy URL pattern (verified live during plan-write):
 *   https://www.legacysurvey.org/viewer/cutout.jpg
 *     ?ra=<deg>&dec=<deg>&layer=ls-dr10&pixscale=<arcsec/px>&size=<px>
 *
 * Sizing formula:
 *   angular_diameter_arcsec = (diameterKpc / distanceMpc) / pi * 180 * 3600 / 1000
 *                           = diameterKpc / distanceMpc * 206.265
 *   target_arcsec = angular_diameter_arcsec * 1.3
 *   size_px = 512  (high-res input, downsampled to 256 after processing)
 *   pixscale = target_arcsec / size_px
 *
 * We fetch at 512 px and downsample to 256 in WebP encoding so the
 * background-cut + alpha fade have more pixels to work with.
 *
 * Concurrency capped at 4 to avoid hammering DESI's servers; sequential
 * fallback on persistent errors.  Per-entry failures log loudly but
 * don't abort the run — the user gets every image they can.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parseFamousSeed, type FamousEntry } from './parsers/famousSeed.js';
import { sampleCornerColor, applyTransparency, type RGBA } from './famousImageProcessor.js';

const CONCURRENCY = 4;
const FETCH_PX = 512; // input resolution (DESI cutout)
const OUT_PX = 256; // output WebP resolution
/**
 * Pixel colour-distance threshold for the sky-cut.  16 is permissive
 * enough that DESI's slightly-noisy backgrounds get fully cut, but
 * tight enough that dim galaxy halos survive.  Tune per-entry only if
 * a galaxy looks wrong in the dev server.
 */
const SKY_TOLERANCE = 16;
/**
 * Outer radial fade fraction.  10% means the outermost 10% of the
 * image fades smoothly to transparent, hiding any sky pixels the
 * colour cut missed.
 */
const FADE_OUTER_FRACTION = 0.1;

/**
 * Compute the DESI cutout URL for a given famous entry.
 */
function buildCutoutUrl(e: FamousEntry): string {
  const arcsecDiameter = (e.diameterKpc / e.distanceMpc) * 206.265;
  const targetArcsec = arcsecDiameter * 1.3;
  const pixscale = targetArcsec / FETCH_PX;
  const params = new URLSearchParams({
    ra: e.ra.toString(),
    dec: e.dec.toString(),
    layer: 'ls-dr10',
    pixscale: pixscale.toFixed(4),
    size: FETCH_PX.toString(),
  });
  return `https://www.legacysurvey.org/viewer/cutout.jpg?${params.toString()}`;
}

/**
 * Fetch one entry, process, write WebP.  Returns true on success, false
 * on any failure (logged to stderr).
 */
async function fetchOne(e: FamousEntry, force: boolean): Promise<boolean> {
  const outDir = resolve('public/images/famous');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${e.id}.webp`);
  if (existsSync(outPath) && !force) {
    process.stderr.write(`  skip ${e.id} (cached)\n`);
    return true;
  }

  const url = buildCutoutUrl(e);
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    process.stderr.write(`  fail ${e.id}: network ${(err as Error).message}\n`);
    return false;
  }
  if (!res.ok) {
    process.stderr.write(`  fail ${e.id}: HTTP ${res.status}\n`);
    return false;
  }
  const jpegBuf = Buffer.from(await res.arrayBuffer());

  // Decode JPEG → raw RGBA via sharp.  Resize to FETCH_PX up front in
  // case DESI returned a different size (it sometimes clamps small).
  const { data, info } = await sharp(jpegBuf)
    .resize(FETCH_PX, FETCH_PX, { fit: 'cover' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const sky: RGBA = sampleCornerColor(rgba, info.width, info.height);
  applyTransparency(rgba, info.width, info.height, sky, {
    skyTolerance: SKY_TOLERANCE,
    fadeOuterFraction: FADE_OUTER_FRACTION,
  });
  // Re-encode RGBA → WebP at OUT_PX, with quality tuned for ~10-20 KB.
  const webp = await sharp(Buffer.from(rgba), {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(OUT_PX, OUT_PX, { fit: 'cover' })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
  writeFileSync(outPath, webp);
  process.stderr.write(`  ok   ${e.id}  ${(webp.byteLength / 1024).toFixed(1)} KB\n`);
  return true;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const seedPath = resolve('data/famous_galaxies.seed.json');
  const entries = parseFamousSeed(readFileSync(seedPath, 'utf8'));
  process.stderr.write(`fetching ${entries.length} famous galaxy thumbnails…\n`);

  // Simple promise-pool: keep CONCURRENCY in flight at once.
  let i = 0;
  let ok = 0;
  let fail = 0;
  async function worker(): Promise<void> {
    while (i < entries.length) {
      const e = entries[i++]!;
      const success = await fetchOne(e, force);
      if (success) ok++;
      else fail++;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  process.stderr.write(`done; ${ok} ok, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Add the npm script**

In `/Users/rulkens/Development/js/skymap/package.json`, add `"fetch-famous-images"` to the `scripts` block, alongside the existing fetch scripts:

```json
    "fetch-famous-images": "tsx tools/fetchFamousImages.ts",
```

- [ ] **Step 3: Run the script for real (smoke test)**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run fetch-famous-images
```

Expected: 20 lines of `ok <id>  XX.X KB`, total runtime ~30-60 seconds. Inspect `public/images/famous/m31.webp` in any image viewer — should show M31 with a transparent background. If a galaxy comes out wrong (sky still visible, or galaxy got over-cut), tune `SKY_TOLERANCE` or `FADE_OUTER_FRACTION` in the script and re-run with `--force`.

- [ ] **Step 4: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add tools/fetchFamousImages.ts package.json public/images/famous/ && git commit -m "feat(famous): DESI Legacy cutout fetcher with transparent-background processing"
```

---

## Task 5: Famous .bin builder + cross-match + sidecars

**Files:**

- Create: `/Users/rulkens/Development/js/skymap/tools/buildFamous.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/buildFamous.test.ts`
- Modify: `/Users/rulkens/Development/js/skymap/package.json` (add npm script)

- [ ] **Step 1: Add a failing test for the cross-match helper**

Create `/Users/rulkens/Development/js/skymap/tests/buildFamous.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findNearestPoint } from '../tools/buildFamous';

/**
 * Build a tiny PointCloud-shaped fixture with three Cartesian points so
 * we can exercise `findNearestPoint` without hitting disk.
 */
function makeCloud(xyz: ReadonlyArray<readonly [number, number, number]>) {
  const count = xyz.length;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = xyz[i]![0];
    positions[i * 3 + 1] = xyz[i]![1];
    positions[i * 3 + 2] = xyz[i]![2];
  }
  return { count, positions };
}

describe('findNearestPoint', () => {
  it('returns the closest index when one point is much closer', () => {
    const cloud = makeCloud([
      [10, 10, 10],
      [1, 1, 1],
      [-5, 0, 0],
    ]);
    const result = findNearestPoint(cloud, [1.1, 1.0, 1.0], 5);
    expect(result).not.toBeNull();
    expect(result!.localIdx).toBe(1);
  });

  it('returns null when nothing is within the threshold', () => {
    const cloud = makeCloud([
      [100, 100, 100],
      [99, 99, 99],
    ]);
    const result = findNearestPoint(cloud, [0, 0, 0], 1);
    expect(result).toBeNull();
  });

  it('returns the angular distance approximation in arcsec', () => {
    // Two points 1 Mpc apart at distance 100 Mpc → angular sep
    //   arctan(1/100) rad ≈ 0.01 rad ≈ 2063 arcsec.
    const cloud = makeCloud([[100, 0, 0]]);
    const result = findNearestPoint(cloud, [100, 1, 0], Infinity);
    expect(result).not.toBeNull();
    // Tolerate ±100 arcsec (small-angle approximation slop).
    expect(result!.distanceArcsec).toBeGreaterThan(1900);
    expect(result!.distanceArcsec).toBeLessThan(2200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```
npx vitest run tests/buildFamous.test.ts
```

Expected: `Cannot find module '../tools/buildFamous'`.

- [ ] **Step 3: Implement the builder**

Create `/Users/rulkens/Development/js/skymap/tools/buildFamous.ts`:

```ts
#!/usr/bin/env node
/**
 * buildFamous — assemble the curated `Famous` source layer.
 *
 * Reads:
 *   - `data/famous_galaxies.seed.json`           (curated entries)
 *   - `public/data/2mrs.bin`, `public/data/glade.bin`  (for cross-match)
 *
 * Writes:
 *   - `public/data/famous.bin`         (v4 PointCloud, normal renderer input)
 *   - `public/data/famous_xrefs.json`  (cross-match sidecar)
 *   - `public/data/famous_meta.json`   (per-localIdx → id + names + description)
 *
 * Why three artefacts instead of one fat .bin?  The .bin has to stay in
 * the v4 PointCloud format so the existing decoder + renderer code paths
 * work unchanged.  That format has no slot for human-readable strings.
 * Sidecar JSONs carry the curated metadata + cross-refs, loaded once at
 * startup and indexed by local-idx parallel to the .bin's count.
 *
 * Cross-match strategy:
 *   For each famous entry, compute its Cartesian (x, y, z) and find the
 *   nearest 2MRS or GLADE point within MATCH_THRESHOLD_ARCSEC.  We
 *   compare positions using a small-angle great-circle approximation
 *   (Euclidean distance / target_distance, in radians, converted to
 *   arcseconds) — exact enough at the < 30 arcsec scale we care about,
 *   no trig.
 *
 * Run order: this script depends on the survey .bin files, so always
 * after `npm run build-all`.  The npm script lives at `build-famous`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFamousSeed, type FamousEntry } from './parsers/famousSeed.js';
import { encodePointCloud, decodePointCloud } from '../src/data/pointCloudFormat.js';
import { Source } from '../src/data/sources.js';
import type { PointCloud } from '../src/@types/index.js';

/** Threshold (arcsec) within which a 2MRS/GLADE point is treated as the same galaxy. */
const MATCH_THRESHOLD_ARCSEC = 30;

/** A subset of PointCloud sufficient for our nearest-neighbour search. */
type CloudPositions = { count: number; positions: Float32Array };

/**
 * Public for tests: find the closest point in `cloud` to `xyz`, returning
 * its local index and approximate angular distance in arcsec, or null
 * when nothing falls within `thresholdArcsec`.
 *
 * Why an angular threshold (not Euclidean Mpc)?  A 30-arcsec catalog
 * cross-match tolerance is the standard astronomical convention, and it
 * scales naturally with distance (1 arcsec is bigger in Mpc at GLADE
 * scales than at 2MRS scales).
 */
export function findNearestPoint(
  cloud: CloudPositions,
  xyz: readonly [number, number, number],
  thresholdArcsec: number,
): { localIdx: number; distanceArcsec: number } | null {
  const [tx, ty, tz] = xyz;
  const targetDist = Math.hypot(tx, ty, tz);
  if (targetDist === 0) return null;

  let bestIdx = -1;
  let bestSep = Infinity;
  for (let i = 0; i < cloud.count; i++) {
    const dx = tx - cloud.positions[i * 3 + 0]!;
    const dy = ty - cloud.positions[i * 3 + 1]!;
    const dz = tz - cloud.positions[i * 3 + 2]!;
    const sep = Math.hypot(dx, dy, dz);
    if (sep < bestSep) {
      bestSep = sep;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return null;
  // Convert linear separation in Mpc → angular sep in arcsec via small-angle.
  // theta_rad ≈ sep / targetDist; arcsec = rad * 206265.
  const distanceArcsec = (bestSep / targetDist) * 206265;
  if (distanceArcsec > thresholdArcsec) return null;
  return { localIdx: bestIdx, distanceArcsec };
}

/**
 * Convert a curated entry's (RA, Dec, distanceMpc) to Cartesian (x, y, z).
 * Same convention as `raDecZToCartesian` but with an explicit distance
 * (we don't have a redshift for nearby objects).
 */
function entryToXyz(e: FamousEntry): [number, number, number] {
  const ra = (e.ra * Math.PI) / 180;
  const dec = (e.dec * Math.PI) / 180;
  const cosDec = Math.cos(dec);
  const d = e.distanceMpc;
  return [d * cosDec * Math.cos(ra), d * cosDec * Math.sin(ra), d * Math.sin(dec)];
}

type Xref = { source: 'TwoMRS' | 'Glade'; localIdx: number; distanceArcsec: number };

async function main(): Promise<void> {
  const seedPath = resolve('data/famous_galaxies.seed.json');
  const outDir = resolve('public/data');
  const twomrsPath = resolve(outDir, '2mrs.bin');
  const gladePath = resolve(outDir, 'glade.bin');
  if (!existsSync(twomrsPath) || !existsSync(gladePath)) {
    process.stderr.write(
      'error: 2mrs.bin and/or glade.bin missing.  Run `npm run build-all` first.\n',
    );
    process.exit(1);
  }

  const entries = parseFamousSeed(readFileSync(seedPath, 'utf8'));
  process.stderr.write(`loaded ${entries.length} famous entries from seed\n`);

  // Decode the survey clouds for cross-match.  Both files load fully into
  // memory — fine at our scale (~2 + ~127 MB).
  const twomrs = decodePointCloud(readFileSync(twomrsPath).buffer.slice(0));
  const glade = decodePointCloud(readFileSync(gladePath).buffer.slice(0));
  process.stderr.write(`cross-match against ${twomrs.count} 2MRS + ${glade.count} GLADE\n`);

  // ── Build the PointCloud + sidecar maps in lock-step ─────────────────
  const count = entries.length;
  const cloud: PointCloud = {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count).fill(NaN),
    magG: new Float32Array(count).fill(NaN),
    magR: new Float32Array(count).fill(NaN),
    magI: new Float32Array(count).fill(NaN),
    magZ: new Float32Array(count).fill(NaN),
    axisRatio: new Float32Array(count).fill(NaN),
    positionAngleDeg: new Float32Array(count).fill(NaN),
    diameterKpc: new Float32Array(count),
  };
  const xrefs: Record<string, Xref | null> = {};
  const metaByIdx: Array<{
    id: string;
    names: string[];
    description: string;
    type: string;
  }> = [];

  for (let i = 0; i < count; i++) {
    const e = entries[i]!;
    const xyz = entryToXyz(e);
    cloud.objIDs[i] = BigInt(i); // sequential placeholder; not a real SDSS objID
    cloud.positions[i * 3 + 0] = xyz[0];
    cloud.positions[i * 3 + 1] = xyz[1];
    cloud.positions[i * 3 + 2] = xyz[2];
    cloud.diameterKpc[i] = e.diameterKpc;

    // Cross-match against 2MRS first (denser at the famous-galaxy scale),
    // then GLADE for entries 2MRS missed.
    const m2 = findNearestPoint(twomrs, xyz, MATCH_THRESHOLD_ARCSEC);
    let xr: Xref | null;
    if (m2) {
      xr = { source: 'TwoMRS', localIdx: m2.localIdx, distanceArcsec: m2.distanceArcsec };
    } else {
      const mG = findNearestPoint(glade, xyz, MATCH_THRESHOLD_ARCSEC);
      xr = mG
        ? { source: 'Glade', localIdx: mG.localIdx, distanceArcsec: mG.distanceArcsec }
        : null;
    }
    xrefs[e.id] = xr;
    metaByIdx.push({ id: e.id, names: e.names, description: e.description, type: e.type });
    process.stderr.write(
      `  ${e.id.padEnd(12)} → ${xr ? `${xr.source}#${xr.localIdx} (${xr.distanceArcsec.toFixed(1)}\")` : 'no match'}\n`,
    );
  }

  // ── Write the artefacts ──────────────────────────────────────────────
  const binBuf = encodePointCloud(cloud);
  writeFileSync(resolve(outDir, 'famous.bin'), Buffer.from(binBuf));
  process.stderr.write(`wrote ${count} points to famous.bin (${binBuf.byteLength} bytes)\n`);
  writeFileSync(resolve(outDir, 'famous_xrefs.json'), JSON.stringify(xrefs, null, 2));
  process.stderr.write(`wrote famous_xrefs.json\n`);
  writeFileSync(resolve(outDir, 'famous_meta.json'), JSON.stringify(metaByIdx, null, 2));
  process.stderr.write(`wrote famous_meta.json\n`);

  // Quick sanity reference: log the Source enum value baked into the
  // renderer.  The renderer keys per-source pipelines on this number,
  // so a mismatch would silently misroute Famous draws into the wrong
  // pipeline — better to have it in the build log too.
  process.stderr.write(`Source.Famous = ${Source.Famous}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```
npx vitest run tests/buildFamous.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Add the npm script**

In `/Users/rulkens/Development/js/skymap/package.json`, add:

```json
    "build-famous": "tsx tools/buildFamous.ts",
```

next to the existing `build-all` script.

- [ ] **Step 6: Run the script for real (smoke test)**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run build-famous
```

Expected: 20 cross-match lines, 99% of which should resolve to a 2MRS row (Messier galaxies are nearby; 2MRS covers the entire local universe at K≤11.75). Outputs at `public/data/famous.bin`, `famous_xrefs.json`, `famous_meta.json`. Spot-check `head -c 16 public/data/famous.bin | xxd` should show magic `53 4b 4d 50` (`SKMP`) followed by `04 00 00 00` (version 4).

- [ ] **Step 7: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add tools/buildFamous.ts tests/buildFamous.test.ts package.json public/data/famous.bin public/data/famous_xrefs.json public/data/famous_meta.json && git commit -m "feat(famous): build famous.bin + cross-match sidecars"
```

---

## Task 6: Load `famous.bin` at startup

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/cloudLoader.ts`
- Modify: `/Users/rulkens/Development/js/skymap/tests/services/engine/cloudLoader.test.ts` (if it exists; otherwise skip)

- [ ] **Step 1: Add the new survey entry**

In `/Users/rulkens/Development/js/skymap/src/services/engine/cloudLoader.ts`, modify the `CloudSource` type union to include the new file:

```ts
export type CloudSource = 'sdss.bin' | '2mrs.bin' | 'glade.bin' | 'famous.bin' | 'synthetic';
```

Add a new entry to `SURVEY_FILES`:

```ts
const SURVEY_FILES: readonly SurveyFile[] = [
  { source: Source.SDSS, url: '/data/sdss.bin', cloudSource: 'sdss.bin' },
  { source: Source.TwoMRS, url: '/data/2mrs.bin', cloudSource: '2mrs.bin' },
  { source: Source.Glade, url: '/data/glade.bin', cloudSource: 'glade.bin' },
  // Curated atlas — small (~1 KB for 20 entries, ~10 KB for 150).
  // Loaded last so its result lands instantly even on slow connections.
  { source: Source.Famous, url: '/data/famous.bin', cloudSource: 'famous.bin' },
];
```

No further code changes — `loadAllClouds` already iterates `SURVEY_FILES` and reports each per-survey result via the callback.

- [ ] **Step 2: Run typecheck and tests**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: clean. The renderer should now upload `Source.Famous` alongside the other three at startup.

- [ ] **Step 3: Manual smoke test**

The dev server should already be running. Reload the browser and check the JS console — you should see one of these (per the existing engine log conventions):

```
[cloudLoader] loaded famous.bin (Source 4)
```

If `famous.bin` 404s, run `npm run build-famous` first. Famous galaxies will now render as ordinary instanced billboards using the existing point pipeline (no thumbnails yet — Task 8 wires the local-WebP path).

- [ ] **Step 4: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/engine/cloudLoader.ts && git commit -m "feat(loader): fetch famous.bin alongside the survey catalogs"
```

---

## Task 7: Load `famous_meta.json` + `famous_xrefs.json` at startup

**Files:**

- Create: `/Users/rulkens/Development/js/skymap/src/services/engine/famousMetaLoader.ts`
- Create: `/Users/rulkens/Development/js/skymap/tests/services/engine/famousMetaLoader.test.ts`

- [ ] **Step 1: Add a failing test for the loader's parsed shape**

Create `/Users/rulkens/Development/js/skymap/tests/services/engine/famousMetaLoader.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFamousMeta, parseFamousXrefs } from '../../../src/services/engine/famousMetaLoader';

describe('parseFamousMeta', () => {
  it('returns a per-localIdx array', () => {
    const json = JSON.stringify([
      { id: 'm31', names: ['M31'], description: 'a', type: 'Sb' },
      { id: 'm51', names: ['M51', 'Whirlpool'], description: 'b', type: 'Sbc' },
    ]);
    const meta = parseFamousMeta(json);
    expect(meta).toHaveLength(2);
    expect(meta[0]!.id).toBe('m31');
    expect(meta[1]!.names).toContain('Whirlpool');
  });

  it('throws on a non-array root', () => {
    expect(() => parseFamousMeta('{}')).toThrow(/array/);
  });
});

describe('parseFamousXrefs', () => {
  it('parses a record keyed by id', () => {
    const json = JSON.stringify({
      m31: { source: 'TwoMRS', localIdx: 12345, distanceArcsec: 4.2 },
      m32: null,
    });
    const xrefs = parseFamousXrefs(json);
    expect(xrefs.m31).not.toBeNull();
    expect(xrefs.m31!.source).toBe('TwoMRS');
    expect(xrefs.m32).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```
npx vitest run tests/services/engine/famousMetaLoader.test.ts
```

Expected: `Cannot find module '../../../src/services/engine/famousMetaLoader'`.

- [ ] **Step 3: Implement the loader module**

Create `/Users/rulkens/Development/js/skymap/src/services/engine/famousMetaLoader.ts`:

```ts
/**
 * famousMetaLoader — fetch + parse the runtime sidecars that accompany
 * `famous.bin`.  Two JSON files:
 *
 *   - `famous_meta.json`  (per-localIdx → { id, names, description, type })
 *   - `famous_xrefs.json` (per-id → { source, localIdx, distanceArcsec } | null)
 *
 * Why two files?  `famous_meta` is indexed by the famous catalog's local
 * index — the index the renderer's pick code returns.  `famous_xrefs`
 * is indexed by the human-readable `id` so the InfoCard can look up
 * the cross-match by name without a reverse pass.  Either could be
 * derived from the other, but eating the duplication at build time
 * (both written by `tools/buildFamous.ts`) keeps the runtime lookup
 * paths O(1) and avoids stitching state inside the engine.
 *
 * Both files are tiny — even a 150-entry catalog fits in well under
 * 100 KB combined — so we load them both at startup before the first
 * pick.  No streaming or lazy-load complexity.
 */

/** One famous-galaxy metadata record, indexed by its local position in famous.bin. */
export type FamousMetaEntry = {
  id: string;
  names: string[];
  description: string;
  type: string;
};

/** One cross-match record. `null` means "no match within MATCH_THRESHOLD_ARCSEC". */
export type FamousXref = {
  source: 'TwoMRS' | 'Glade';
  localIdx: number;
  distanceArcsec: number;
};

/** The whole xrefs object, keyed by famous id. */
export type FamousXrefMap = Record<string, FamousXref | null>;

/**
 * Parse `famous_meta.json` content.  Throws on schema mismatch.  Public
 * to allow unit testing without hitting the network.
 */
export function parseFamousMeta(rawJson: string): FamousMetaEntry[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) {
    throw new Error('famous_meta.json: root must be an array');
  }
  return parsed as FamousMetaEntry[];
}

/**
 * Parse `famous_xrefs.json` content.  Throws on schema mismatch.
 */
export function parseFamousXrefs(rawJson: string): FamousXrefMap {
  const parsed = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('famous_xrefs.json: root must be an object');
  }
  return parsed as FamousXrefMap;
}

/**
 * Fetch and parse both sidecars in parallel.  Returns null/empty values
 * when either file 404s — most users will never run `npm run
 * build-famous`, so absent sidecars must not break the engine.
 */
export async function loadFamousSidecars(): Promise<{
  meta: FamousMetaEntry[];
  xrefs: FamousXrefMap;
}> {
  const [metaRes, xrefsRes] = await Promise.allSettled([
    fetch('/data/famous_meta.json'),
    fetch('/data/famous_xrefs.json'),
  ]);
  const meta =
    metaRes.status === 'fulfilled' && metaRes.value.ok
      ? parseFamousMeta(await metaRes.value.text())
      : [];
  const xrefs =
    xrefsRes.status === 'fulfilled' && xrefsRes.value.ok
      ? parseFamousXrefs(await xrefsRes.value.text())
      : {};
  return { meta, xrefs };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```
npx vitest run tests/services/engine/famousMetaLoader.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/services/engine/famousMetaLoader.ts tests/services/engine/famousMetaLoader.test.ts && git commit -m "feat(engine): famous-catalog sidecar loader (meta + xrefs)"
```

---

## Task 8: Engine — wire sidecars + special-case the quad pass for Famous

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/@types/PointInfo.d.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/pointInfoBuilder.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/services/gpu/galaxyImageFetcher.ts`

- [ ] **Step 1: Extend the `PointInfo` type with an optional `famous` block**

In `/Users/rulkens/Development/js/skymap/src/@types/PointInfo.d.ts`, find the `/** @group Orientation */` block and add this section just before it:

```ts
  /** @group Famous-atlas attributes (only present when source === Source.Famous) */

  /**
   * Curated metadata for galaxies in the `Source.Famous` layer.
   *
   * Populated by `pointInfoBuilder` from the `famous_meta.json` sidecar
   * when (and only when) the row's source is the curated atlas.  Survey
   * rows leave this `undefined`, so the InfoCard can branch on
   * `info.famous !== undefined` without a per-source guard.
   *
   * `xref` carries the cross-match result against the survey catalogs
   * (see `tools/buildFamous.ts`), and is `null` when no nearby 2MRS or
   * GLADE row was found within 30 arcsec.
   */
  famous?: {
    id: string;
    names: string[];
    description: string;
    type: string;
    xref:
      | { source: 'TwoMRS' | 'Glade'; localIdx: number; distanceArcsec: number }
      | null;
  };
```

- [ ] **Step 2: Pass the sidecars into `buildPointInfo`**

In `/Users/rulkens/Development/js/skymap/src/services/engine/pointInfoBuilder.ts`, change the function signature to accept the optional sidecars and populate the new `famous` field:

Replace the existing `buildPointInfo` declaration line:

```ts
export function buildPointInfo(cloud: PointCloud, idx: number, source: Source): PointInfo {
```

with:

```ts
import type { FamousMetaEntry, FamousXrefMap } from './famousMetaLoader';

export function buildPointInfo(
  cloud: PointCloud,
  idx: number,
  source: Source,
  famousMeta?: FamousMetaEntry[],
  famousXrefs?: FamousXrefMap,
): PointInfo {
```

At the end of the function (before `return { ... }`), build the `famous` block:

```ts
// ── Famous-atlas metadata ─────────────────────────────────────────────────
//
// For Source.Famous rows, look up the curated metadata + cross-match by
// local index.  The sidecars are loaded at engine startup; both default
// to empty when the build-famous artefacts haven't shipped, in which
// case we silently fall back to no `famous` field.  The InfoCard then
// renders the row generically (still useful: gives the user a position
// and a galaxyType chip).
let famous: PointInfo['famous'] | undefined;
if (source === Source.Famous && famousMeta && famousMeta[idx]) {
  const meta = famousMeta[idx]!;
  const xref = (famousXrefs && famousXrefs[meta.id]) ?? null;
  famous = {
    id: meta.id,
    names: meta.names,
    description: meta.description,
    type: meta.type,
    xref,
  };
}
```

In the returned object literal, add `famous,` next to `orientation:` (or anywhere after the `diameterProvenance` field).

- [ ] **Step 3: Wire the sidecars into the engine**

In `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`, near the top with the other imports, add:

```ts
import { loadFamousSidecars, type FamousMetaEntry, type FamousXrefMap } from './famousMetaLoader';
```

Find the engine's local state declarations (the block where `clouds`, `selectedIndex`, `hoveredIndex` etc. live — around line 150) and add:

```ts
let famousMeta: FamousMetaEntry[] = [];
let famousXrefs: FamousXrefMap = {};
```

Find where the engine kicks off the cloud loader (search for `loadAllClouds`) and add a parallel sidecar load. Just before or just after the existing `loadAllClouds(...)` call, add:

```ts
// Fetch the famous-atlas sidecars concurrently with the .bin files.
// Both fail-safely return empty defaults when the artefacts are absent,
// so the engine still works on a fresh checkout where build-famous
// hasn't run yet.
loadFamousSidecars()
  .then((sc) => {
    famousMeta = sc.meta;
    famousXrefs = sc.xrefs;
  })
  .catch((err) => {
    console.warn('[engine] famous sidecars failed to load:', err);
  });
```

Find every call to `buildPointInfo(...)` in this file (likely 1-2 places — hover and select) and add the sidecars as the new trailing arguments:

```ts
buildPointInfo(cloud, localIdx, source, famousMeta, famousXrefs);
```

- [ ] **Step 4: Special-case the Famous source in the quad-pass**

Still in `engine.ts`, locate the per-frame loop that builds `quads[]` / `disks[]` (around line 966, the `for (const cloud of clouds.values()) {` block).

Replace the inner-loop's apparent-size gate so Famous rows always proceed:

Find:

```ts
const camDistSq = dx * dx + dy * dy + dz * dz;
if (camDistSq <= 0 || camDistSq > maxCamDistSqUpper) continue;

// Survived the cheap cull; pay for the per-galaxy diameter
// read + sqrt + exact apparent-size compare.
const dKpcRow = cloud.diameterKpc[i]!;
const dMpcRow = dKpcRow / 1000;
const camDist = Math.sqrt(camDistSq);
const px = (dMpcRow / camDist) * pxPerRad;
if (px < APPARENT_SIZE_THRESHOLD_PX) continue;
```

…and modify the threshold check so Famous rows skip it. (We KEEP the cheap squared-distance early-out so far-away famous galaxies don't trigger a useless quad; just remove the apparent-size gate.) Replace with:

```ts
const camDistSq = dx * dx + dy * dy + dz * dz;
if (camDistSq <= 0 || camDistSq > maxCamDistSqUpper) continue;

// Survived the cheap cull; pay for the per-galaxy diameter
// read + sqrt + exact apparent-size compare.
const dKpcRow = cloud.diameterKpc[i]!;
const dMpcRow = dKpcRow / 1000;
const camDist = Math.sqrt(camDistSq);
const px = (dMpcRow / camDist) * pxPerRad;
// Famous-atlas rows always show a thumbnail — they're
// landmarks, the user expects them visible regardless of
// angular size.  Survey rows still gate on the threshold so
// we don't load 3.5 M cutouts at maximum zoom-out.
if (cloud.source !== Source.Famous && px < APPARENT_SIZE_THRESHOLD_PX) continue;
```

Note: this assumes the cloud carries its `source` tag. Look up the surrounding code: `clouds` is a Map keyed by `Source`, but each cloud value's source isn't stored on the `PointCloud` itself. If `cloud.source` isn't available in the inner loop, change the iteration:

```ts
for (const [cloudSource, cloud] of clouds.entries()) {
```

…and replace `cloud.source !== Source.Famous` with `cloudSource !== Source.Famous`. Adapt to whatever variable name is already in scope; the test is "is this loop iteration the famous source?".

- [ ] **Step 5: Add a Famous branch to the image fetcher**

In `/Users/rulkens/Development/js/skymap/src/services/gpu/galaxyImageFetcher.ts`, extend the input type and short-circuit on `famousId`:

Replace `FetchGalaxyBitmapInput`:

```ts
export type FetchGalaxyBitmapInput = {
  ra: number;
  dec: number;
  /** When set, fetch from `/images/famous/<famousId>.webp` instead of the survey services. */
  famousId?: string;
  /** Optional AbortSignal to cancel an in-flight fetch. */
  signal?: AbortSignal;
};
```

At the top of `fetchGalaxyBitmap`, add the Famous branch before the SDSS attempt:

```ts
export async function fetchGalaxyBitmap(
  input: FetchGalaxyBitmapInput,
): Promise<ImageBitmap | null> {
  const { ra, dec, famousId, signal } = input;

  // Curated atlas: dedicated WebP shipped with the build.  We never fall
  // back to SDSS/DSS for these — the curated image is what the user
  // wants to see, and a missing file is a build error not a runtime
  // edge case.
  if (famousId) {
    const url = `/images/famous/${famousId}.webp`;
    const blob = await tryFetch(url, signal);
    if (!blob) return null;
    try {
      return await createImageBitmap(blob, {
        resizeWidth: SLOT_SIDE,
        resizeHeight: SLOT_SIDE,
      });
    } catch {
      return null;
    }
  }

  // Try SDSS first.  ~70% of galaxies in the visible cloud will be in the
  ...
```

(Keep the rest of the function as-is.)

- [ ] **Step 6: Pass the `famousId` from the engine's enqueue call**

In `engine.ts`, locate the `queue.enqueue({...})` call inside the per-frame quad loop. The `fetcher` callback currently calls `fetchGalaxyBitmap({ ra, dec })`. Modify to look up the famous id (when present) and forward it:

```ts
                queue.enqueue({
                  key,
                  priority: px,
                  fetcher: () => {
                    // For Source.Famous rows, route to the curated WebP
                    // by famousId.  Survey rows fall through to the
                    // existing SDSS → DSS chain.
                    const fId =
                      cloudSource === Source.Famous
                        ? famousMeta[i]?.id
                        : undefined;
                    return fetchGalaxyBitmap({ ra, dec, famousId: fId });
                  },
                  onResult: (bitmap) => {
                    ...
```

(Same `cloudSource` variable as in step 4.)

- [ ] **Step 7: Run the typecheck + tests**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: clean, no regressions.

- [ ] **Step 8: Manual smoke test**

Reload the dev server. Zoom out to see all surveys; the famous galaxies should now appear as point billboards, and as you move the camera close to one (e.g. press `f` after selecting it once Task 9 lands — for now, click+drag manually to M31's coordinates), the curated WebP thumbnail should load. Sanity: open the network tab, look for `/images/famous/m31.webp`.

- [ ] **Step 9: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/@types/PointInfo.d.ts src/services/engine/pointInfoBuilder.ts src/services/engine/engine.ts src/services/gpu/galaxyImageFetcher.ts && git commit -m "feat(engine): wire famous sidecars + bypass apparent-size + load curated WebP"
```

---

## Task 9: InfoCard — render the famous block

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/components/InfoCard/FullCard.tsx`

- [ ] **Step 1: Add the famous-section rendering block**

In `/Users/rulkens/Development/js/skymap/src/components/InfoCard/FullCard.tsx`, find the `<div className={styles.cardHeadline}>{info.iauName}</div>` line (around line 126). Just below it, before the source badge, add a famous-block overlay that takes precedence over the IAU name when present:

Replace this region:

```tsx
{
  /* ── SDSS designation ──────────────────────────────────────────────── */
}
<div className={styles.cardHeadline}>{info.iauName}</div>;

{
  /* ── Source attribution badge ──────────────────────────────────────── */
}
<div className={styles.sourceBadge}>{info.sourceLabel}</div>;
```

with:

```tsx
{
  /* ── Headline ──────────────────────────────────────────────────────── */
}
{
  /*
        Famous-atlas rows show their primary curated name as the headline
        (e.g. "M31") instead of the coordinate-derived IAU designation.
        Survey rows fall back to `info.iauName` so SDSS galaxies still
        display their `SDSS J123456.78+012345.6`-style label.
      */
}
<div className={styles.cardHeadline}>{info.famous ? info.famous.names[0] : info.iauName}</div>;

{
  /* ── Source attribution badge ──────────────────────────────────────── */
}
<div className={styles.sourceBadge}>{info.sourceLabel}</div>;

{
  /* ── Famous-atlas detail block ─────────────────────────────────────── */
}
{
  info.famous && (
    <div className={styles.cardSection}>
      {/*
            "Also known as" — every name beyond the headline, comma-
            separated.  Many famous galaxies have an NGC number AND a
            common name (e.g. M31 / NGC 224 / Andromeda Galaxy); listing
            all aliases makes the InfoCard recognisable to users coming
            from any naming convention.
          */}
      {info.famous.names.length > 1 && (
        <div className={styles.cardRow}>
          <span className={styles.cardLabel}>Also known as</span>
          <span className={styles.cardValue}>{info.famous.names.slice(1).join(' · ')}</span>
        </div>
      )}
      {/*
            Curated description — the most editorial part of the card.
            Two or three sentences chosen at seed-write time to give the
            user something more colourful than "Sb-type spiral".
          */}
      <div className={styles.cardRow}>
        <span className={styles.cardValue} style={{ fontStyle: 'italic' }}>
          {info.famous.description}
        </span>
      </div>
      {/*
            Cross-match link — when the build-time matcher found a nearby
            survey row, surface the catalog name + offset so power users
            can see their famous click is consistent with the underlying
            data, and (eventually) jump to that row's view.  No click
            handler yet — Task 11 wires the navigation.  For now the
            label and offset alone are useful provenance.
          */}
      {info.famous.xref && (
        <div className={styles.cardRow}>
          <span className={styles.cardLabel}>Also catalogued as</span>
          <span className={styles.cardValue}>
            {info.famous.xref.source} row #{info.famous.xref.localIdx}
            {' · '}
            <span style={{ opacity: 0.7, fontSize: '0.85em' }}>
              {info.famous.xref.distanceArcsec.toFixed(1)}″ from curated position
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck + tests**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 3: Manual smoke test**

Click the M31 marker in the dev server. The InfoCard should show:

- Headline: "M31"
- Source badge: "Famous"
- "Also known as": NGC 224 · Andromeda Galaxy
- The curated description
- "Also catalogued as": TwoMRS row #N · X.Xʺ from curated position

For a survey galaxy, the layout should be unchanged from before this task.

- [ ] **Step 4: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/components/InfoCard/FullCard.tsx && git commit -m "feat(ui): InfoCard renders famous-atlas description + cross-match"
```

---

## Task 10: Command palette — search overlay (Cmd+K)

**Files:**

- Create: `/Users/rulkens/Development/js/skymap/src/components/CommandPalette/CommandPalette.tsx`
- Create: `/Users/rulkens/Development/js/skymap/src/components/CommandPalette/CommandPalette.module.css`
- Create: `/Users/rulkens/Development/js/skymap/tests/components/CommandPalette/scoreFamousMatch.test.ts`

- [ ] **Step 1: Add a failing test for the match-score helper**

The palette uses a tiny scoring function we'll extract to keep it pure-testable. Create `/Users/rulkens/Development/js/skymap/tests/components/CommandPalette/scoreFamousMatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreFamousMatch } from '../../../src/components/CommandPalette/scoreFamousMatch';

const M31 = {
  id: 'm31',
  names: ['M31', 'NGC 224', 'Andromeda Galaxy'],
  description: 'The nearest large spiral galaxy.',
};

describe('scoreFamousMatch', () => {
  it('returns >0 for an exact-prefix name match', () => {
    expect(scoreFamousMatch(M31, 'M31')).toBeGreaterThan(0);
    expect(scoreFamousMatch(M31, 'm31')).toBeGreaterThan(0);
  });

  it('matches by common-name substring (case-insensitive)', () => {
    expect(scoreFamousMatch(M31, 'andromeda')).toBeGreaterThan(0);
  });

  it('matches description keywords', () => {
    expect(scoreFamousMatch(M31, 'spiral')).toBeGreaterThan(0);
  });

  it('returns 0 for a query that matches nothing', () => {
    expect(scoreFamousMatch(M31, 'sombrero')).toBe(0);
  });

  it('ranks exact name matches higher than description matches', () => {
    expect(scoreFamousMatch(M31, 'M31')).toBeGreaterThan(scoreFamousMatch(M31, 'spiral'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```
npx vitest run tests/components/CommandPalette/scoreFamousMatch.test.ts
```

Expected: `Cannot find module '../../../src/components/CommandPalette/scoreFamousMatch'`.

- [ ] **Step 3: Implement the scoring function**

Create `/Users/rulkens/Development/js/skymap/src/components/CommandPalette/scoreFamousMatch.ts`:

```ts
/**
 * scoreFamousMatch — a small heuristic that ranks one famous-galaxy
 * entry against a user-typed query.  Higher numbers mean better matches.
 *
 * We deliberately avoid pulling in a fuzzy-search library (fuse.js etc.)
 * because (a) a 150-entry catalog doesn't benefit from clever indexing,
 * and (b) the rules a user expects are simple: name match wins, common
 * name match is fine, description match is fallback.  Rolling our own
 * keeps the dependency surface flat and the behaviour easy to reason
 * about.
 *
 * Scoring rules (in priority order):
 *   - Exact (case-insensitive) match against any name → 1000
 *   - Name starts with query → 500 + (length-bonus)
 *   - Name contains query as substring → 100 + (length-bonus)
 *   - Description contains query → 10 + (length-bonus)
 *   - No match → 0
 *
 * `length-bonus` is `query.length`, used only as a tiebreaker so longer
 * queries that match exactly still beat shorter queries that prefix.
 */

export type ScorableEntry = {
  id: string;
  names: readonly string[];
  description: string;
};

export function scoreFamousMatch(entry: ScorableEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return 0;
  const lengthBonus = q.length;

  let best = 0;
  for (const name of entry.names) {
    const n = name.toLowerCase();
    if (n === q) return 1000 + lengthBonus;
    if (n.startsWith(q)) best = Math.max(best, 500 + lengthBonus);
    else if (n.includes(q)) best = Math.max(best, 100 + lengthBonus);
  }
  if (entry.description.toLowerCase().includes(q)) {
    best = Math.max(best, 10 + lengthBonus);
  }
  // Also try the id as a last-resort match (e.g. typing "ngc-5128").
  if (entry.id.toLowerCase().includes(q)) {
    best = Math.max(best, 50 + lengthBonus);
  }
  return best;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```
npx vitest run tests/components/CommandPalette/scoreFamousMatch.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Implement the palette component**

Create `/Users/rulkens/Development/js/skymap/src/components/CommandPalette/CommandPalette.module.css`:

```css
/* CommandPalette — modal overlay, centred at the top of the viewport. */

.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 50;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}

.panel {
  width: min(560px, 90vw);
  max-height: 70vh;
  background: #15151d;
  color: #e8e8ea;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.input {
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  padding: 16px 20px;
  outline: none;
  font-size: 16px;
  border-bottom: 1px solid #2a2a32;
}

.results {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  overflow-y: auto;
}

.result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
}

.resultActive {
  background: rgba(80, 110, 255, 0.18);
}

.thumb {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 4px;
  background: #1f1f27;
  object-fit: cover;
}

.primary {
  font-weight: 600;
}

.secondary {
  margin-left: 8px;
  opacity: 0.6;
  font-size: 0.85em;
}

.empty {
  padding: 24px;
  text-align: center;
  opacity: 0.6;
}
```

Create `/Users/rulkens/Development/js/skymap/src/components/CommandPalette/CommandPalette.tsx`:

```tsx
/**
 * CommandPalette — Cmd+K (or Ctrl+K, or `/`) overlay for searching the
 * curated famous-galaxies atlas.
 *
 * UX:
 *   - Triggered by a keyboard shortcut (handled in App.tsx).
 *   - Shows a list of matching galaxies sorted by `scoreFamousMatch`.
 *   - Up/Down arrows move the highlight; Enter selects.
 *   - Esc closes without action.
 *   - Click outside the panel closes.
 *
 * Selection invokes the `onSelect` callback with the picked entry's id;
 * the parent (App.tsx) translates that into an engine `selectFamous(id)`
 * call which pins the galaxy and triggers a focus tween.
 *
 * Why not a third-party command-palette library?  Two reasons: (1) we
 * only need ~80 lines of UI logic for a single feature; pulling in
 * cmdk or kbar to do that would dwarf the actual code with adapter
 * shims.  (2) Project convention forbids introducing component-level
 * barrel exports; many palette libraries assume them.  Hand-rolling
 * keeps the dependency footprint minimal and the styling fully
 * controllable.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { scoreFamousMatch } from './scoreFamousMatch';
import type { FamousMetaEntry } from '../../services/engine/famousMetaLoader';
import styles from './CommandPalette.module.css';

export type CommandPaletteProps = {
  /** All famous entries to search across.  Loaded from `famous_meta.json`. */
  entries: FamousMetaEntry[];
  /** Whether the palette is currently shown. */
  open: boolean;
  /** Close handler — called on Esc, click-outside, or after a successful selection. */
  onClose: () => void;
  /** Selection handler — receives the picked entry's id. */
  onSelect: (id: string) => void;
};

/** A scored entry, ready to render. */
type ScoredEntry = { entry: FamousMetaEntry; score: number };

export function CommandPalette({
  entries,
  open,
  onClose,
  onSelect,
}: CommandPaletteProps): ReactNode {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ── Filter + rank entries by the current query ─────────────────────────────
  //
  // Empty query shows the first 20 entries unsorted (the seed file ordering),
  // so the user sees something useful when the palette opens.  Non-empty
  // query runs the scoring helper and drops anything with score <= 0.
  const matches: ScoredEntry[] = useMemo(() => {
    if (query.trim().length === 0) {
      return entries.slice(0, 20).map((e) => ({ entry: e, score: 0 }));
    }
    const scored = entries
      .map((entry) => ({ entry, score: scoreFamousMatch(entry, query) }))
      .filter((s) => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 20);
  }, [entries, query]);

  // Reset highlight when the query changes — otherwise we'd point past the
  // end of a shrinking results list.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Focus the input when the palette opens.  The next tick is needed
  // because the input only enters the DOM in the same render that flips
  // `open` to true.
  useEffect(() => {
    if (open) {
      // requestAnimationFrame instead of useLayoutEffect because the
      // overlay's CSS transition would otherwise see the focused state
      // mid-fade.
      requestAnimationFrame(() => inputRef.current?.focus());
      setQuery('');
    }
  }, [open]);

  // ── Keyboard handling ──────────────────────────────────────────────────────
  //
  // Up/Down arrows navigate, Enter selects, Esc closes.  All other keys
  // pass through to the input so the user can type.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(matches.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[activeIdx];
      if (m) {
        onSelect(m.entry.id);
        onClose();
      }
    }
  };

  if (!open) return null;
  return (
    <div className={styles.backdrop} onClick={onClose} onKeyDown={onKeyDown} role="presentation">
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search famous galaxies"
      >
        <input
          ref={inputRef}
          className={styles.input}
          placeholder="Search famous galaxies (M31, Andromeda, …)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {matches.length === 0 ? (
          <div className={styles.empty}>No matches</div>
        ) : (
          <ul className={styles.results}>
            {matches.map((m, i) => (
              <li
                key={m.entry.id}
                className={`${styles.result} ${i === activeIdx ? styles.resultActive : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => {
                  onSelect(m.entry.id);
                  onClose();
                }}
              >
                <img
                  className={styles.thumb}
                  src={`/images/famous/${m.entry.id}.webp`}
                  alt=""
                  loading="lazy"
                />
                <span>
                  <span className={styles.primary}>{m.entry.names[0]}</span>
                  {m.entry.names.length > 1 && (
                    <span className={styles.secondary}>{m.entry.names.slice(1).join(' · ')}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run typecheck + tests**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: clean.

- [ ] **Step 7: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/components/CommandPalette/ tests/components/CommandPalette/ && git commit -m "feat(ui): CommandPalette component + name-scoring helper"
```

---

## Task 11: Wire `selectFamous` engine API + mount palette in App

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/src/@types/EngineHandle.d.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`
- Modify: `/Users/rulkens/Development/js/skymap/src/App.tsx`

- [ ] **Step 1: Extend `EngineHandle` with `selectFamous`**

In `/Users/rulkens/Development/js/skymap/src/@types/EngineHandle.d.ts`, find the existing `focusOn` declaration and add `selectFamous` next to it:

```ts
  /**
   * Select (pin) the famous-atlas galaxy with the given id, then run
   * the same focus tween `focusOn` would.  No-op if the id is not in
   * the loaded famous catalog (e.g. someone hot-reloaded the build
   * artefacts and the entry vanished).
   *
   * Used by the command palette.  Routing through the engine rather
   * than letting App.tsx call `focusOn` + `setSelected` directly keeps
   * the selection bookkeeping in one place — selection, hover, and
   * the engine's per-frame highlight uniform all stay consistent.
   */
  selectFamous: (id: string) => void;
```

- [ ] **Step 2: Implement `selectFamous` in the engine**

In `/Users/rulkens/Development/js/skymap/src/services/engine/engine.ts`, find the public-API object the engine returns (search for `focusOn:` or `clearSelection:`) and add a `selectFamous` method. The method needs to:

1. Find the localIdx in `famousMeta` matching the id.
2. Look up the cloud (`clouds.get(Source.Famous)`).
3. Build the global instance index (use the cloud's local idx + the famous source's instanceIdOffset, same way the picker resolves clicks; or read the per-vertex `globalInstanceIdx` slot if more convenient).
4. Set `selectedIndex` and call `cb.onSelectChange` with the built `PointInfo`.
5. Run the focus tween via the existing `focusOn` impl.

```ts
    selectFamous(id) {
      const cloud = clouds.get(Source.Famous);
      if (!cloud) return;
      const localIdx = famousMeta.findIndex((m) => m.id === id);
      if (localIdx < 0) return;

      // Build the same PointInfo the picker would.  The pointInfoBuilder
      // call here passes the live sidecars so the famous block populates.
      const info = buildPointInfo(cloud, localIdx, Source.Famous, famousMeta, famousXrefs);
      // The engine's selectedIndex is GLOBAL — not per-source local — so
      // we have to compute the global index.  The renderer keeps each
      // source's instanceIdOffset; sum the famous source's offset with
      // the local idx.
      const offset = renderer?.instanceIdOffset(Source.Famous) ?? 0;
      const globalIdx = offset + localIdx;
      selectedIndex = globalIdx;
      cb.onSelectChange?.(info);
      // Tween the camera onto the galaxy.  Same call pattern as
      // `focusOn(xyz, diameterKpc)` but with the position pulled from
      // the cloud (we already have a PointInfo so use that).
      this.focusOn?.([info.x, info.y, info.z], info.diameterKpc);
    },
```

(`renderer.instanceIdOffset(source)` may need to be added — search the renderer's public API; if it's not there, add a one-line getter that reads `this.clouds.get(source)?.instanceIdOffset ?? 0`.)

- [ ] **Step 3: Add a renderer accessor for `instanceIdOffset`**

In `/Users/rulkens/Development/js/skymap/src/services/gpu/pointRenderer.ts`, add a public method near `loadedSources()`:

```ts
  /**
   * Return the cross-survey global ID offset for `source`, or 0 when the
   * source isn't loaded.  Used by the engine's `selectFamous` to
   * convert a local catalog index to the global index format the
   * renderer's per-vertex `globalInstanceIdx` carries.
   */
  instanceIdOffset(source: Source): number {
    return this.clouds.get(source)?.instanceIdOffset ?? 0;
  }
```

- [ ] **Step 4: Wire the palette into App**

In `/Users/rulkens/Development/js/skymap/src/App.tsx`:

Add the import:

```tsx
import { CommandPalette } from './components/CommandPalette/CommandPalette';
import { loadFamousSidecars, type FamousMetaEntry } from './services/engine/famousMetaLoader';
```

Add palette state next to the other useState calls:

```tsx
const [paletteOpen, setPaletteOpen] = useState(false);
const [famousMeta, setFamousMeta] = useState<FamousMetaEntry[]>([]);
```

Add a useEffect that loads the meta once at mount:

```tsx
useEffect(() => {
  loadFamousSidecars().then((sc) => setFamousMeta(sc.meta));
}, []);
```

Extend the existing keyboard `useEffect` to handle Cmd+K / Ctrl+K / `/`. Find the `onKeyDown` handler and add this block before the Esc handler:

```tsx
// ── Cmd+K / Ctrl+K / `/` opens the command palette ──────────────────────
if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
  e.preventDefault();
  setPaletteOpen(true);
  return;
}
if (e.key === '/' && !paletteOpen) {
  e.preventDefault();
  setPaletteOpen(true);
  return;
}
```

Add `paletteOpen` to the deps array of the keyboard effect, alongside `selected`.

Mount the palette JSX — at the end of the JSX tree, before the closing fragment:

```tsx
<CommandPalette
  entries={famousMeta}
  open={paletteOpen}
  onClose={() => setPaletteOpen(false)}
  onSelect={(id) => handleRef.current?.selectFamous?.(id)}
/>
```

- [ ] **Step 5: Run typecheck + tests + manual smoke**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: clean.

In the dev server, press Cmd+K (macOS) or Ctrl+K. The palette should appear. Type "and" — M31 / Andromeda Galaxy should rank first. Press Enter — the camera should tween toward M31, and the InfoCard should pin to it with the curated description visible.

- [ ] **Step 6: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add src/@types/EngineHandle.d.ts src/services/engine/engine.ts src/services/gpu/pointRenderer.ts src/App.tsx && git commit -m "feat(app): wire CommandPalette + engine.selectFamous + Cmd+K binding"
```

---

## Task 12: README + adding-more-galaxies docs

**Files:**

- Modify: `/Users/rulkens/Development/js/skymap/README.md`

- [ ] **Step 1: Document the famous-atlas section**

In `/Users/rulkens/Development/js/skymap/README.md`, add a new section after the existing surveys section. Insert this content (adjust the surrounding section heading levels to match the README's existing convention):

```markdown
### Famous galaxies (curated atlas)

A separate small catalog of well-known galaxies (Messier + NGC greatest-hits)
ships alongside the survey data. Entries appear with their curated names
in the InfoCard and are searchable via the **Cmd+K / Ctrl+K** command
palette. Their thumbnails are pre-processed transparent WebPs hand-fetched
from the DESI Legacy Imaging service, so famous galaxies always render at
high quality — even for nearby objects (M31, M33) that survey catalogs
filter out as too close.

Run order:

1. `npm run build-all` — produces `2mrs.bin` + `glade.bin`,
   which the famous build needs for cross-match.
2. `npm run fetch-famous-images` — downloads + processes 20 thumbnails (~30 s).
   Idempotent; pass `--force` to re-fetch.
3. `npm run build-famous` — produces `famous.bin` + `famous_meta.json` + `famous_xrefs.json`.

#### Adding more galaxies

The seed file is `data/famous_galaxies.seed.json`. Each entry needs:

| Field         | Type     | Notes                                                   |
| ------------- | -------- | ------------------------------------------------------- |
| `id`          | string   | URL-safe lower-case identifier (e.g. `m31`, `ngc-5128`) |
| `names`       | string[] | One or more names; first is the headline                |
| `ra`          | number   | Right Ascension in degrees, [0, 360)                    |
| `dec`         | number   | Declination in degrees, [-90, 90]                       |
| `distanceMpc` | number   | Curated distance in megaparsecs                         |
| `diameterKpc` | number   | Physical isophotal diameter in kpc                      |
| `type`        | string   | Hubble morphological type (free-form)                   |
| `description` | string   | 1-3 sentence editorial blurb                            |

After adding an entry, re-run `npm run fetch-famous-images && npm run build-famous`.
```

- [ ] **Step 2: Commit**

```
cd /Users/rulkens/Development/js/skymap && git add README.md && git commit -m "docs(readme): document famous-galaxy atlas + how to add entries"
```

---

## Task 13: Visual verification + final test sweep

**Files:** none (verification only)

- [ ] **Step 1: Run full typecheck + tests**

Run:

```
cd /Users/rulkens/Development/js/skymap && npm run typecheck && npm test
```

Expected: typecheck clean, every test passes.

- [ ] **Step 2: Cold-start build sanity**

To confirm the full pipeline builds from scratch, regenerate every artefact:

```
cd /Users/rulkens/Development/js/skymap && npm run build-all && npm run fetch-famous-images && npm run build-famous
```

Expected: every script exits cleanly, the public/data and public/images directories are populated.

- [ ] **Step 3: Browser-side verification checklist**

Reload the dev server. Verify each:

1. The console shows `[cloudLoader] loaded famous.bin` (or equivalent).
2. M31 is visible in the renderer (look northeast of the origin in the local volume).
3. Press Cmd+K — palette opens, focused, empty input shows first 20 entries with thumbnails.
4. Type "and" — M31 ranks first.
5. Type "spiral" — multiple entries match by description.
6. Press Enter on M31 — camera tweens to it, InfoCard shows "M31" headline, "Also known as: NGC 224 · Andromeda Galaxy", curated description visible, "Also catalogued as: TwoMRS row #N · X.X″ from curated position".
7. Esc clears the palette without breaking the existing Esc-clears-pin shortcut.
8. Click a non-famous galaxy — InfoCard renders normally, no famous-block.
9. M31's thumbnail should be the curated transparent WebP (no opaque sky background).

- [ ] **Step 4: Note any visual issues**

If a thumbnail looks wrong (sky still visible, or the galaxy got over-cut), tweak `SKY_TOLERANCE` or `FADE_OUTER_FRACTION` in `tools/fetchFamousImages.ts`, run `npm run fetch-famous-images -- --force`, and reload.

---

## Self-Review

**Spec coverage:**

| Spec requirement                                    | Task(s) |
| --------------------------------------------------- | ------- |
| Source.Famous enum value                            | 1       |
| Hand-curated seed JSON (20 Messier galaxies)        | 2       |
| Schema definition + parser/validator                | 2       |
| DESI Legacy cutout fetcher                          | 4       |
| Background-removal algorithm (corner + radial fade) | 3, 4    |
| Output WebPs at `public/images/famous/<id>.webp`    | 4       |
| Cross-match against 2MRS/GLADE bins                 | 5       |
| `famous.bin` v4 PointCloud                          | 5       |
| `famous_xrefs.json` sidecar                         | 5, 7    |
| `famous_meta.json` sidecar                          | 5, 7    |
| `npm run build-famous` script                       | 5       |
| Run order build-famous AFTER build-all              | 5, 12   |
| `npm run fetch-famous-images` script                | 4       |
| Renderer integration via cloudLoader                | 6       |
| Skip apparent-size threshold for Famous in engine   | 8       |
| Local WebP path in image fetcher                    | 8       |
| Sidecars wired into `pointInfoBuilder`              | 8       |
| `PointInfo.famous` optional block                   | 8       |
| InfoCard renders curated description + cross-match  | 9       |
| Command palette component (Cmd+K / Ctrl+K / `/`)    | 10, 11  |
| `engine.selectFamous(id)` API                       | 11      |
| App mounts palette + binds shortcuts                | 11      |
| README documents commands + adding entries          | 12      |
| Visual verification checklist                       | 13      |

**Placeholder scan:** No "TBD"/"TODO"/"implement later"/"similar to Task N" in any task. Every code step has complete code blocks.

**Type consistency:**

- `FamousEntry` (defined Task 2) → consumed by Tasks 4, 5.
- `FamousMetaEntry` and `FamousXrefMap` (defined Task 7) → consumed by Tasks 8, 10, 11.
- `PointInfo.famous` (defined Task 8) → consumed by Task 9.
- `EngineHandle.selectFamous` (defined Task 11) → consumed by Task 11 (palette wiring) and matches `App.tsx` use site.
- `Source.Famous = 4` (defined Task 1) → consumed throughout.
- `scoreFamousMatch(entry, query)` signature consistent across Tasks 10 (definition + tests + palette use).

All names match across tasks. Plan is coherent.
