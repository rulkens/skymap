import { describe, it, expect, vi } from 'vitest';
import { SCENE_ANCHORS } from '../../../src/data/bodies/sceneAnchors';
import { GALACTIC_CENTRE_ANCHOR } from '../../../src/data/places/galacticCentre';
import { BODY_REGIONS } from '../../../src/data/bodies/bodyRegions';
import { POSITION_DRIVERS } from '../../../src/data/bodies/positionDrivers';
import { regionOfBody } from '../../../src/utils/regions/regionOfBody';
import { elementsById } from '../../../src/data/bodies/orbitalElements';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { regionById } from '../../../src/utils/regions/regionById';
import { regionRelativeDistanceMpc } from '../../../src/utils/regions/regionRelativeDistanceMpc';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('BODY_REGIONS', () => {
  it('every position driver belongs to exactly one region', () => {
    for (const driver of POSITION_DRIVERS) {
      const holders = BODY_REGIONS.filter((r) => r.memberIds.includes(driver.id));
      expect(holders, driver.id).toHaveLength(1);
      expect(regionOfBody(driver.id), driver.id).not.toBeNull();
    }
  });

  it('region membership is unchanged', () => {
    // Captured before membership moved onto the position drivers' host walk.
    expect(Object.fromEntries(BODY_REGIONS.map((r) => [r.id, r.memberIds]))).toEqual(
      {"solar-system": ["sun", "mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "moon", "phobos", "deimos", "io", "europa", "ganymede", "callisto", "mimas", "enceladus", "tethys", "dione", "rhea", "titan", "iapetus", "miranda", "ariel", "umbriel", "titania", "oberon", "puck", "triton", "proteus", "nereid", "charon", "whale", "petunias", "voyager1", "voyager2", "hubble", "curiosity", "perseverance", "spirit", "opportunity", "soendermarken"], "solar-neighbourhood": ["proxima-centauri", "alpha-centauri", "barnards-star", "wolf-359", "lalande-21185", "sirius", "luyten-726-8", "ross-154", "ross-248", "epsilon-eridani", "lacaille-9352", "ross-128", "ez-aquarii", "61-cygni", "procyon", "struve-2398", "groombridge-34", "epsilon-indi", "tau-ceti", "kapteyns-star", "altair", "vega", "fomalhaut", "pollux", "canopus", "arcturus", "capella", "rigel", "achernar", "betelgeuse", "hadar", "acrux", "aldebaran", "antares", "spica", "deneb", "mimosa", "regulus", "adhara", "castor", "shaula", "gacrux", "bellatrix", "elnath", "miaplacidus", "alnilam", "alnair", "alnitak", "alioth", "dubhe", "mirfak", "wezen", "gamma-velorum", "sargas", "kaus-australis", "avior", "alkaid", "menkalinan", "atria", "alhena", "peacock", "alsephina", "mirzam", "polaris", "alphard", "hamal", "diphda", "mizar", "nunki", "menkent", "alpheratz", "mirach", "rasalhague", "algieba", "kochab", "saiph", "denebola", "algol", "tiaki", "muhlifain", "aspidiske", "suhail", "alphecca", "mintaka", "sadr", "eltanin", "schedar", "naos", "almach", "caph", "izar", "alpha-lupi", "epsilon-centauri", "dschubba", "larawag", "eta-centauri", "merak", "ankaa", "girtab", "enif", "scheat", "sabik", "phecda", "aludra", "alderamin", "markeb", "gamma-cassiopeiae", "markab", "aljanah", "acrab", "mira", "albireo", "delta-cephei", "eta-carinae", "51-pegasi", "vy-canis-majoris", "uy-scuti", "t-coronae-borealis"], "galactic-centre": ["galactic-centre", "s1", "s2", "s4", "s6", "s8", "s9", "s12", "s13", "s14", "s17", "s18", "s19", "s21", "s22", "s23", "s24", "s29", "s31", "s33", "s38", "s39", "s42", "s54", "s55", "s60", "s66", "s67", "s71", "s83", "s85", "s87", "s89", "s91", "s96", "s97", "s145", "s175", "r34", "r44", "s301"]},
    );
  });

  it('solar-system and solar-neighbourhood share an anchor but not an extent', () => {
    // The distinction the whole plan rests on: anchor is a position, extent is a
    // scale. Collapsing the two rows — or deriving one extent for both — passes
    // every other assertion here and silently restores the single global
    // `FARTHEST_*` pair. Neptune's ~30 AU to Eta Carinae's ~2300 pc is seven
    // decades; the factor asserted is a decade short of that, so it fails on a
    // collapse without pinning today's roster.
    const solarSystem = regionById('solar-system');
    const neighbourhood = regionById('solar-neighbourhood');

    expect(solarSystem.anchorId).toBe(neighbourhood.anchorId);
    expect(neighbourhood.extentMpc).toBeGreaterThan(solarSystem.extentMpc * 1e6);
  });

  it('does not let a seeded anchor fall through to the residual region', () => {
    // Every anchor that resolves to a position is a member of SOME region it
    // anchors. The Sun satisfies it via `solar-system` while also anchoring the
    // neighbourhood, so the quantifier is over the regions an id anchors, not
    // over the one row being examined. Sgr A*'s seed is what makes this
    // discriminate against the real table: `solar-neighbourhood` is the RESIDUAL
    // region, claiming every anchor no tighter region took, so a fall-through
    // drags its extent 2.3e-3 → 8.178e-3 Mpc and `FOREGROUND_MAX_DISTANCE_MPC`
    // (extent × 100) 0.23 → 0.82 Mpc — past the Milky Way label's near fade
    // edge (0.6 Mpc, `MILKY_WAY_LABEL_FADE_BAND` in `produceMilkyWayLabel.ts`),
    // where the "You are here" label stops reaching full alpha in the Local
    // Group. That is a SECOND route to the same gate, distinct from the
    // `|anchorPos|` term prep-02 removed from `foregroundMaxDistance`; both have
    // to stay dead.
    for (const region of BODY_REGIONS) {
      const anchoredRegions = BODY_REGIONS.filter((r) => r.anchorId === region.anchorId);
      expect(anchoredRegions.some((r) => r.memberIds.includes(region.anchorId))).toBe(true);
    }

    // The consequence, pinned directly. A fallen-through Galactic Centre would
    // set the residual extent to exactly its own distance from the Sun.
    const neighbourhood = regionById('solar-neighbourhood');
    expect(neighbourhood.memberIds).not.toContain('galactic-centre');
    expect(neighbourhood.extentMpc).toBeLessThan(Math.hypot(...GALACTIC_CENTRE_ANCHOR.positionMpc));
  });

  it('the galactic-centre region extent covers the widest S-star orbit, not S2', () => {
    // The far S-stars are what set this regime's scale. S85 is the widest orbit
    // in Gillessen's table (a = 4.6″, e = 0.78 ⇒ apoapsis 0.325 pc = 3.25e-7 Mpc)
    // and S2 — the star every reader reaches for — is ~35× tighter at 1934 AU.
    // Sizing the region on S2 is the failure this pins, and it fails here by an
    // order of magnitude rather than a hair.
    //
    // The floor is deliberately well under that 35×: `extentMpc` is the max
    // member distance in the J2000 SNAPSHOT, not an apoapsis envelope, so the
    // stars are wherever their phase puts them at the epoch and the figure lands
    // at ~12× S2's apoapsis (R34, near its own apoapsis, sets it) rather than 35×.
    // A derivation that switched to the apoapsis envelope would only raise it.
    const galacticCentre = regionById('galactic-centre');
    const s2 = elementsById('s2');
    const s2ApoapsisMpc = s2.semiMajorMpc * (1 + s2.eccentricity);

    expect(galacticCentre.memberIds).toContain('s85');
    expect(galacticCentre.extentMpc).toBeGreaterThan(s2ApoapsisMpc * 10);
  });

  it('the solar-system extent ignores the hyperbolic rows', () => {
    // A hyperbola has no envelope, so `max |member − anchor|` at J2000 is a
    // clock reading rather than a scale: Voyager 1 sat 76 au out at the epoch
    // and is 172 au out today, against Pluto's ~30. The rows stay MEMBERS —
    // `regionOfBody` and the palette chip still say "Solar System" — but are
    // excluded from the extent, which `scaleFadeBands.bodyGlintBackdrop` reads.
    // Pluto's aphelion is 49 au and Voyager 2's J2000 distance 60 au, so a
    // bound between the two fails on either probe joining the max.
    const solarSystem = regionById('solar-system');

    expect(solarSystem.memberIds).toContain('voyager1');
    expect(solarSystem.extentMpc).toBeLessThan(55 * SCALE_UNITS.AU_TO_MPC);
  });

  it('a Galactic-Centre camera keys the region at parsec scale, not 8 kpc', () => {
    // What the populated region buys the near-field bands: a camera one parsec
    // off Sgr A* reads one parsec, not the 8.178 kpc `hypot(camPos)` gives — the
    // render origin is the Sun, so an origin-keyed band would read this camera as
    // deep-field and switch every galactic-centre-scoped layer off.
    const states = deriveBodyStates(CONST_J2000);
    const galacticCentre = regionById('galactic-centre');
    const anchorPos = states.get(galacticCentre.anchorId)!.positionMpc;
    const ONE_PARSEC_MPC = 1e-6;
    const camPos: Vec3 = [anchorPos[0] + ONE_PARSEC_MPC, anchorPos[1], anchorPos[2]];

    expect(regionRelativeDistanceMpc(camPos, galacticCentre, states)).toBeCloseTo(
      ONE_PARSEC_MPC,
      12,
    );
    expect(regionRelativeDistanceMpc(camPos, galacticCentre, states)).toBeLessThan(
      Math.hypot(...camPos) / 1000,
    );
  });
});

/**
 * The empty-region case, driven by a synthetic table: `vi.doMock` + a dynamic
 * import in their own block, so the mocked anchors never reach the module cache
 * the tests above share.
 */
describe('BODY_REGIONS — a region whose anchor is not seeded', () => {
  it('has extent 0, not NaN, and never resolves the missing anchor', async () => {
    // `Math.max()` over an empty member list is −Infinity, and every edge that
    // scales off an extent would then read −Infinity too. `galactic-centre` no
    // longer supplies the case — the place and Sgr A* are both seeded, so the
    // region correctly holds them at extent 0 — so the empty region is made by
    // taking both anchors back out, which is also the state `bodyRegions.ts` is
    // written to tolerate (its anchor id is authored ahead of any seed).
    // Emptiness must be answered BEFORE the anchor is read, or the row resolves
    // a position nothing seeds and throws at import, taking the whole file with it.
    //
    // "Ahead of the seed" means ahead of BOTH halves of it: with the anchors
    // gone but the 39 S-star rows still focused on the place, `focusResolveOrder`
    // throws on the dangling focus before any region is built, so the element
    // table is mocked in step with the anchor table.
    vi.resetModules();
    vi.doMock('../../../src/data/bodies/sceneAnchors', () => ({
      SCENE_ANCHORS: SCENE_ANCHORS.filter((anchor) => anchor.id !== 'galactic-centre'),
    }));
    vi.doMock('../../../src/data/bodies/orbitalElements', async () => {
      const actual = await vi.importActual<
        typeof import('../../../src/data/bodies/orbitalElements')
      >('../../../src/data/bodies/orbitalElements');
      return {
        ...actual,
        ORBITAL_ELEMENTS: actual.ORBITAL_ELEMENTS.filter((el) => el.focusId !== 'galactic-centre'),
      };
    });
    const { BODY_REGIONS: unseeded } = await import('../../../src/data/bodies/bodyRegions');
    const galacticCentre = unseeded.find((region) => region.id === 'galactic-centre')!;

    expect(galacticCentre.memberIds).toEqual([]);
    expect(galacticCentre.extentMpc).toBe(0);

    vi.doUnmock('../../../src/data/bodies/sceneAnchors');
    vi.doUnmock('../../../src/data/bodies/orbitalElements');
    vi.resetModules();
  });
});
