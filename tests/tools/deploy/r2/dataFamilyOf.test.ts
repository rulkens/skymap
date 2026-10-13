/**
 * The runtime fetch surface is the spec: every name the browser requests must
 * map to its family with today's transport and wire encoding, and the legacy
 * un-tiered build artefacts must map to none. A wrong `gzipOnWire` here is
 * invisible to every other check — R2 would hold bytes labelled wrongly.
 */
import { describe, expect, it } from 'vitest';
import { dataFamilyOf } from '../../../../tools/deploy/r2/dataFamilyOf';

const GALAXY = { label: 'galaxy-catalog', transport: 'wrangler', gzipOnWire: true };
const STARS = { label: 'star-catalog-v1', transport: 'wrangler', gzipOnWire: false };
const STARS_V2_INDEX = { label: 'star-catalog-v2-index', transport: 'wrangler', gzipOnWire: true };
const STARS_V2_CHUNKS = { label: 'star-catalog-v2-chunks', transport: 'bulk', gzipOnWire: true };
const SCALAR = { label: 'scalar-field', transport: 'wrangler', gzipOnWire: true };
const FLOW = { label: 'flowfield', transport: 'wrangler', gzipOnWire: false };
const FILAMENT = { label: 'filament', transport: 'wrangler', gzipOnWire: true };
const STRUCTURE = { label: 'structure-catalog', transport: 'wrangler', gzipOnWire: true };
const BUBBLE = { label: 'local-bubble', transport: 'wrangler', gzipOnWire: false };
const SIDECAR = { label: 'sidecar-json', transport: 'wrangler', gzipOnWire: true };
const MESH = { label: 'mesh-body', transport: 'wrangler', gzipOnWire: true };
const MESH_TEXTURE = { label: 'mesh-texture', transport: 'wrangler', gzipOnWire: false };

const TRACKED: [string, typeof GALAXY][] = [
  ['sdss-large.bin', GALAXY],
  ['glade-small.a3f19c2e.bin', GALAXY],
  ['galaxy-catalog/v9/milliquas-medium.bin', GALAXY],
  ['2mrs.a3f19c2e.bin', GALAXY],
  ['famous.bin', GALAXY],
  ['galaxy-catalog/v9/desi-deep.bin', GALAXY],
  ['desi-wedge.bin', GALAXY],
  ['desi-sgw.a3f19c2e.bin', GALAXY],
  ['stars-small.bin', STARS],
  ['stars-medium.a3f19c2e.bin', STARS],
  ['star-catalog/v1/stars-large.bin', STARS],
  ['star-catalog/v2/stars.bin', STARS_V2_INDEX],
  ['star-catalog/v2/stars.a3f19c2e.bin', STARS_V2_INDEX],
  ['star-catalog/v2/stars/6-12345.a3f19c2e.bin', STARS_V2_CHUNKS],
  ['mcpm-small.scfd', SCALAR],
  ['polyphorm-2mrs-medium.a3f19c2e.scfd', SCALAR],
  ['scalar-field/v3/edenhofer-dust-large.scfd', SCALAR],
  ['mcpm-workbench.scfd', SCALAR],
  ['flowfield.scfd', FLOW],
  ['flowfield.a3f19c2e.scfd', FLOW],
  ['scalar-field/v3/flowfield.scfd', FLOW],
  ['filaments.bin', FILAMENT],
  ['filaments-small.a3f19c2e.bin', FILAMENT],
  ['filament/v1/filaments.bin', FILAMENT],
  ['structures.ccat', STRUCTURE],
  ['structures_meta.a3f19c2e.json', STRUCTURE],
  ['structure-catalog/v1/structures.ccat', STRUCTURE],
  ['local-bubble.shell', BUBBLE],
  ['local-bubble.a3f19c2e.shell', BUBBLE],
  ['local-bubble/v1/local-bubble.shell', BUBBLE],
  ['pgc_aliases.json', SIDECAR],
  ['famous_galaxies_meta.a3f19c2e.json', SIDECAR],
  ['famous_stars_meta.json', SIDECAR],
  ['constellations.json', SIDECAR],
  ['meshes/whale-small.mesh', MESH],
  ['meshes/whale-small.a3f19c2e.mesh', MESH],
  ['nested/meshes/whale-small.mesh', MESH],
  ['meshes/whale-small_albedo.a3f19c2e.webp', MESH_TEXTURE],
  ['meshes/whale-small_mr.webp', MESH_TEXTURE],
  ['meshes/whale-small_normal.webp', MESH_TEXTURE],
  ['meshes/mer_contact.webp', MESH_TEXTURE],
];

const UNTRACKED = [
  // Un-tiered legacy bins are offline DisPerSE inputs, never browser-fetched.
  'glade.bin',
  'sdss.bin',
  'sdss.a3f19c2e.bin',
  'flowfield-large.scfd',
  'flowfield.bin',
  // DESI patches have no per-tier variant, so a tier suffix must not slip through.
  'desi-deep-large.bin',
  'desi-wedge-large.bin',
  'desi-sgw-large.bin',
  'stars-huge.bin',
  // A download in flight, a chunk outside its dir, and a v2 name in the v1 epoch.
  'star-catalog/v2/stars/6-12345.bin.part',
  'stars/6-12345.a3f19c2e.bin',
  'star-catalog/v1/stars.bin',
  'images/famous/x.webp',
  'whale.mesh',
  'other/whale_albedo.webp',
  'meshes/whale_thumbnail.webp',
  'thumb.jpg',
  'manifest.json',
];

describe('dataFamilyOf', () => {
  it.each(TRACKED)(
    'every tracked file maps to its family with today’s transport and encoding: %s',
    (path, expected) => {
      const family = dataFamilyOf(path);
      expect(
        family && {
          label: family.label,
          transport: family.transport,
          gzipOnWire: family.gzipOnWire,
        },
      ).toEqual(expected);
    },
  );

  it.each(UNTRACKED)('untracked files map to no family: %s', (path) => {
    expect(dataFamilyOf(path)).toBeNull();
  });
});
