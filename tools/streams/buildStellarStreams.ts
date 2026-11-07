#!/usr/bin/env node
/**
 * buildStellarStreams — write public/data/stellar-streams/v1/stellar-streams.bin (STRM) and its
 * stellar_streams_meta.json from the Vasiliev+ 2021 Sagittarius snapshot and the galstreams
 * tracks (`npm run fetch-vasiliev2021 && npm run fetch-galstreams` first). Stream 0 is
 * Sagittarius, the rest follow sorted by slug; every random draw is seeded, so a rebuild over the
 * same inputs is byte-identical.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STELLAR_STREAMS_RECORD_F32,
  STELLAR_STREAMS_VERSION,
} from '../../src/layers/stellarStreams/catalog/data/stellarStreamsFormat.constants';
import { encodeStellarStreams } from '../../src/layers/stellarStreams/catalog/utils/encodeStellarStreams';
import { writeMetaSidecar } from '../curation/writeMetaSidecar';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { splitmix64Rng } from '../utils/random/splitmix64Rng';
import type { GalstreamsTrack } from './@types/GalstreamsTrack';
import type { StellarStreamMetaEntry } from './@types/StellarStreamMetaEntry';
import type { VasilievStar } from './@types/VasilievStar';
import { SGR_SEED, TRACK_SEED } from './data/streamsBuild.constants';
import { orientTrackByMotion } from './utils/orientTrackByMotion';
import { pickStreamTracks } from './utils/pickStreamTracks';
import { readGalstreamsTracks } from './utils/readGalstreamsTracks';
import { readVasilievStars } from './utils/readVasilievStars';
import { sagittariusMeta } from './utils/sagittariusMeta';
import { sagittariusParticles } from './utils/sagittariusParticles';
import { streamMetaEntry } from './utils/streamMetaEntry';
import { streamMetallicity } from './utils/streamMetallicity';
import { streamSlug } from './utils/streamSlug';
import { trackParticles } from './utils/trackParticles';

const OUT_DIR = resolve('public/data', `stellar-streams/v${STELLAR_STREAMS_VERSION}`);

export function buildStellarStreams(
  stars: readonly VasilievStar[],
  tracks: readonly GalstreamsTrack[],
): { bin: ArrayBuffer; meta: StellarStreamMetaEntry[] } {
  const sgr = sagittariusParticles(stars, SGR_SEED);
  const picked = pickStreamTracks(tracks)
    .map((t) => ({ t, slug: streamSlug(t.name), metallicity: streamMetallicity(t.name) }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const rng = splitmix64Rng(TRACK_SEED);
  const sources = [
    sgr,
    ...picked.map(({ t, metallicity }) =>
      trackParticles(orientTrackByMotion(t), metallicity.feh, rng),
    ),
  ];
  const meta = [
    sagittariusMeta(stars, sgr),
    ...picked.map(({ t, metallicity }, i) => streamMetaEntry(t, sources[i + 1]!, metallicity)),
  ];
  const ids = meta.map((m) => m.id);
  if (new Set(ids).size !== ids.length) throw new Error(`buildStellarStreams: duplicate slug`);

  const particleCount = sources.reduce((n, s) => n + s.luminosity.length, 0);
  const records = new Float32Array(particleCount * STELLAR_STREAMS_RECORD_F32);
  let r = 0;
  sources.forEach((s, index) => {
    for (let i = 0; i < s.luminosity.length; i++, r += STELLAR_STREAMS_RECORD_F32) {
      records.set(s.positionsMpc.subarray(i * 3, i * 3 + 3), r);
      records.set(s.tangents.subarray(i * 3, i * 3 + 3), r + 3);
      records.set([s.sizeMpc[i]!, s.luminosity[i]!, s.colourT[i]!, index], r + 6);
    }
  });
  return { bin: encodeStellarStreams({ particleCount, streamCount: meta.length, records }), meta };
}

function main(): void {
  const stars = readVasilievStars(rawDataPath('vasiliev2021.stars'));
  const tracks = readGalstreamsTracks(rawDataPath('galstreams.dir'));
  const { bin, meta } = buildStellarStreams(stars, tracks);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'stellar-streams.bin'), Buffer.from(bin));
  writeMetaSidecar(meta, join(OUT_DIR, 'stellar_streams_meta.json'));
  const particles = meta.reduce((n, m) => n + m.particleCount, 0);
  console.log(
    `buildStellarStreams: ${particles} particles, ${meta.length} streams, ` +
      `${(bin.byteLength / 1e6).toFixed(2)} MB → ${OUT_DIR}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
