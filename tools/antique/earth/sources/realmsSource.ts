/**
 * realmsSource — the antique Earth map's 1690 realms: Natural Earth admin-1
 * units dissolved into realms and provinces by the tables in ../data/, cut
 * along OpenHistoricalMap and hand lines, colonial claims cut back to coastal
 * bands, simplified as one coverage. Out come the border strips (line kinds 0
 * and 1, by rank), the realm fills (pushed out over the sea so they cover any
 * coast the plate draws, each realm a pigment no neighbour shares) and, as a
 * side effect, the label table src/data/labels/antiqueEarthRealms.ts.
 */

import { join } from 'node:path';

import type { AntiqueMapPiece } from '../@types/AntiqueMapPiece';
import type { AntiqueEarthRealm } from '../../../../src/@types/rendering/AntiqueEarthRealm';
import type { RealmCell } from '../@types/RealmCell';
import { rawDataPath } from '../../../utils/io/rawDataRegistry';
import { PROJECT_ROOT } from '../../../utils/io/projectRoot';
import { EARTH_DATUM_RADIUS_M } from '../../../../src/data/bodies/earthDatumRadiusM';
import { REALMS_1690 } from '../data/realms1690';
import { PROVINCES_1690 } from '../data/provinces1690';
import { REALM_RULES_1690 } from '../data/realmRules1690';
import { REALM_CUTS_1690 } from '../data/realmCuts1690';
import { OHM_RELATIONS_1690 } from '../data/ohmRelations1690';
import { REALM_PIGMENTS } from '../data/realmPigments';
import { assignRealmPieces } from '../utils/assignRealmPieces';
import { borderPolylines } from '../utils/borderPolylines';
import { cellInteriorPoints } from '../utils/cellInteriorPoints';
import { cellTopologyToCells } from '../utils/cellTopologyToCells';
import { cellNeighbours } from '../utils/cellNeighbours';
import { colourRealms } from '../utils/colourRealms';
import { dissolveCells } from '../utils/dissolveCells';
import { extendCellsSeaward } from '../utils/extendCellsSeaward';
import { extendPastEnd } from '../utils/extendPastEnd';
import { readNaturalEarthAdmin1 } from '../utils/readNaturalEarthAdmin1';
import { resampleStrip } from '../utils/resampleStrip';
import { resolveRealmCutMasks } from '../utils/resolveRealmCutMasks';
import { ringAreaKm2 } from '../utils/ringAreaKm2';
import { simplifyCellCoverage } from '../utils/simplifyCellCoverage';
import { simplifySeaEdges } from '../utils/simplifySeaEdges';
import { splitCoastalBand } from '../utils/splitCoastalBand';
import { triangulateCells } from '../utils/triangulateCells';
import { writeAntiqueEarthRealms } from '../utils/writeAntiqueEarthRealms';

const RADIUS_KM = EARTH_DATUM_RADIUS_M / 1000;
const UNCLAIMED_KEY = '~';
const MIN_CUT_PART_KM2 = 25;
const MIN_OHM_PART_KM2 = 40;
/** Borders and the fills' land edges, one tolerance: fill and strip must share their vertices exactly. */
const SIMPLIFY_KM = 1;
/** Fills reach this far out to sea; realms closer than twice it across a strait are neighbours. */
const SEAWARD_KM = 15;
/** The fills' sea edges are simplified this hard: they need only stay clear of the coast. */
const SEA_EDGE_KM = 5;
/** Borders run on past the coast, where the plate's land mask trims them. */
const PAST_COAST_KM = 10;
const STRIP_MAX_KM = 25;
const FILL_MAX_EDGE_DEG = 2;
/** By rank (1 sovereigns, 2 one empire, 3 provinces): line.wesl kind, reveal level, width in print units. */
const BORDER_STYLE = new Map([
  [1, { kind: 0, level: 0, widthUnits: 1.1 }],
  [2, { kind: 0, level: 1, widthUnits: 0.9 }],
  [3, { kind: 1, level: 3, widthUnits: 0.7 }],
]);
/** Label reveal by land area: realms 0 / 1 / 2, provinces 3 / 4. */
const REALM_LEVEL_KM2 = [1_500_000, 150_000];
const PROVINCE_LEVEL_KM2 = 25_000;
const LABELS_PATH = join(PROJECT_ROOT, 'src/data/labels/antiqueEarthRealms.ts');

export async function realmsSource(): Promise<AntiqueMapPiece> {
  const realms = new Map(REALMS_1690.map((r) => [r.key, r]));
  const provinces = new Map(PROVINCES_1690.map((p) => [p.key, p]));
  const realmOf = (key: string) => provinces.get(key)?.realm ?? key;
  const empireOf = (key: string) => realms.get(realmOf(key))?.empire ?? realmOf(key);
  for (const key of provinces.keys())
    if (realms.has(key)) throw new Error(`realms: ${key} is both a realm and a province`);
  for (const p of PROVINCES_1690)
    if (!realms.has(p.realm)) throw new Error(`realms: ${p.key} names unknown realm ${p.realm}`);
  for (const { target } of [...REALM_RULES_1690, ...REALM_CUTS_1690])
    if (target !== null && !realms.has(target) && !provinces.has(target))
      throw new Error(`realms: unknown target ${target}`);

  // 1. Admin-1 units to keyed pieces, then cells.
  const units = readNaturalEarthAdmin1(rawDataPath('naturalearth.admin-1'));
  const centroidCountries = new Set(
    REALM_RULES_1690.flatMap((r) => (r.match === 'centroid' ? [r.adm0] : [])),
  );
  const probed = units.filter((u) => centroidCountries.has(u.adm0));
  const points = await cellInteriorPoints(
    probed.map((u, i) => ({ key: String(i), polygons: u.polygons })),
  );
  const cuts = await resolveRealmCutMasks(
    REALM_CUTS_1690,
    { path: rawDataPath('ohm.relations-1690'), pins: OHM_RELATIONS_1690 },
    { minOhmPartKm2: MIN_OHM_PART_KM2, radiusKm: RADIUS_KM },
  );
  const assigned = assignRealmPieces(units, REALM_RULES_1690, cuts, {
    interiorPointOf: (unit) => points.get(String(probed.indexOf(unit))) ?? [Infinity, Infinity],
    unclaimedKey: UNCLAIMED_KEY,
    minPartKm2: MIN_CUT_PART_KM2,
    radiusKm: RADIUS_KM,
  });
  console.log(`realms: ${units.length} admin-1 units, ${assigned.pieces.length} pieces`);
  console.log(
    `realms: unmatched (unclaimed) by country ${JSON.stringify(Object.fromEntries(assigned.unmatched))}`,
  );
  const idle = (hits: number[], label: (i: number) => string) =>
    hits.flatMap((n, i) => (n === 0 ? [label(i)] : [])).join('; ') || 'none';
  console.log(
    `realms: rules never used: ${idle(assigned.ruleHits, (i) => JSON.stringify(REALM_RULES_1690[i]).slice(0, 60))}`,
  );
  console.log(
    `realms: cuts never hit: ${idle(assigned.cutHits, (i) => `${REALM_CUTS_1690[i]!.units.join(',')} → ${REALM_CUTS_1690[i]!.target}`)}`,
  );
  let cells = await dissolveCells(assigned.pieces);

  // 2. Colonial claims kept within their coastal band; the interior falls to the unclaimed.
  const land = (await dissolveCells(cells.map((c) => ({ key: 'land', polygons: c.polygons }))))[0]!
    .polygons;
  const bandKmOf = (key: string) =>
    provinces.get(key)?.coastalBandKm ?? realms.get(realmOf(key))?.coastalBandKm;
  const banded: RealmCell[] = [];
  for (const cell of cells) {
    const km = cell.key === UNCLAIMED_KEY ? undefined : bandKmOf(cell.key);
    if (km === undefined) {
      banded.push(cell);
      continue;
    }
    const { band, interior } = await splitCoastalBand(cell.polygons, land, km);
    banded.push({ key: cell.key, polygons: band }, { key: UNCLAIMED_KEY, polygons: interior });
  }
  cells = await dissolveCells(banded.filter((c) => c.polygons.length > 0));

  // 3. One simplified coverage: its shared arcs are the borders, its cells grow seaward into the fills.
  const simplified = await simplifyCellCoverage(cells, SIMPLIFY_KM);
  const rankOf = (a: string, b: string) => {
    if (a === UNCLAIMED_KEY || b === UNCLAIMED_KEY || a === b) return 0;
    if (realmOf(a) === realmOf(b)) return 3;
    return empireOf(a) === empireOf(b) ? 2 : 1;
  };
  const borders = borderPolylines(simplified.topology, rankOf);
  const strips = borders.map(({ rank, points: line, coastal }) => {
    const style = BORDER_STYLE.get(rank)!;
    const n = line.length;
    const points = [
      ...(coastal[0] ? [extendPastEnd(line[1]!, line[0]!, PAST_COAST_KM, RADIUS_KM)] : []),
      ...line,
      ...(coastal[1] ? [extendPastEnd(line[n - 2]!, line[n - 1]!, PAST_COAST_KM, RADIUS_KM)] : []),
    ];
    return resampleStrip(points, {
      maxKm: STRIP_MAX_KM,
      radiusKm: RADIUS_KM,
      kind: style.kind,
      level: style.level,
      widthAt: () => style.widthUnits,
    });
  });

  const grown = await extendCellsSeaward(simplified.cells, SEAWARD_KM);
  const fillCells = cellTopologyToCells(simplifySeaEdges(grown, SEA_EDGE_KM, RADIUS_KM));
  const fillVertices = new Set(
    fillCells.flatMap((c) => c.polygons.flat(2).map((p) => `${p[0]},${p[1]}`)),
  );
  const strays = borders.reduce(
    (n, b) => n + b.points.filter((p) => !fillVertices.has(`${p[0]},${p[1]}`)).length,
    0,
  );
  if (strays > 0) console.log(`realms: ${strays} border vertices off the fill outlines`);

  // 4. Realm pigments: neighbours, across land or a strait the grown fills close, always differ.
  const neighbours = new Map<string, Set<string>>();
  for (const [key, near] of cellNeighbours(grown)) {
    if (key === UNCLAIMED_KEY) continue;
    const set = neighbours.get(realmOf(key)) ?? new Set<string>();
    for (const other of near)
      if (other !== UNCLAIMED_KEY && realmOf(other) !== realmOf(key)) set.add(realmOf(other));
    neighbours.set(realmOf(key), set);
  }
  const mapped = [
    ...new Set(fillCells.flatMap((c) => (c.key === UNCLAIMED_KEY ? [] : [realmOf(c.key)]))),
  ];
  const { pigments, conflicts } = colourRealms(mapped, neighbours, REALM_PIGMENTS);
  if (conflicts.length > 0) console.log(`realms: pigment clashes at ${conflicts.join(', ')}`);
  const fill = triangulateCells(
    fillCells,
    (key) => (key === UNCLAIMED_KEY ? 0 : pigments.get(realmOf(key))! + 1),
    FILL_MAX_EDGE_DEG,
  );

  // 5. Label table: anchors inside each realm's and province's largest part.
  const claimed = simplified.cells.filter((c) => c.key !== UNCLAIMED_KEY);
  const areaKm2 = new Map<string, number>();
  const addArea = (key: string, cell: RealmCell) =>
    areaKm2.set(
      key,
      (areaKm2.get(key) ?? 0) +
        cell.polygons.reduce(
          (sum, [outer, ...holes]) =>
            sum +
            ringAreaKm2(outer!, RADIUS_KM) -
            holes.reduce((h, ring) => h + ringAreaKm2(ring, RADIUS_KM), 0),
          0,
        ),
    );
  for (const cell of claimed) {
    addArea(realmOf(cell.key), cell);
    if (provinces.has(cell.key)) addArea(cell.key, cell);
  }
  const realmAnchors = await cellInteriorPoints(
    claimed.map((c) => ({ key: realmOf(c.key), polygons: c.polygons })),
  );
  const provinceAnchors = await cellInteriorPoints(claimed.filter((c) => provinces.has(c.key)));
  const round = (v: number) => Math.round(v * 100) / 100;
  const labels: AntiqueEarthRealm[] = [];
  for (const realm of REALMS_1690) {
    const at = realm.anchor ?? realmAnchors.get(realm.key);
    if (!at) continue;
    const area = areaKm2.get(realm.key) ?? 0;
    labels.push({
      id: `earthRealm-${realm.key}`,
      name: realm.name,
      modern: realm.modern,
      latDeg: round(at[1]),
      lonDeg: round(at[0]),
      rank: (realm.empire ?? realm.key) === realm.key ? 1 : 2,
      level: area >= REALM_LEVEL_KM2[0]! ? 0 : area >= REALM_LEVEL_KM2[1]! ? 1 : 2,
    });
  }
  for (const province of PROVINCES_1690) {
    const at = provinceAnchors.get(province.key);
    if (!at) continue;
    labels.push({
      id: `earthRealm-${province.key}`,
      name: province.name,
      modern: province.modern,
      latDeg: round(at[1]),
      lonDeg: round(at[0]),
      rank: 3,
      level: (areaKm2.get(province.key) ?? 0) >= PROVINCE_LEVEL_KM2 ? 3 : 4,
    });
  }
  writeAntiqueEarthRealms(LABELS_PATH, labels);

  const perRank = [1, 2, 3].map((rank) => {
    const own = strips.filter((_, i) => borders[i]!.rank === rank);
    return `rank ${rank}: ${own.length} strips, ${own.reduce((n, s) => n + s.points.length, 0)} vertices`;
  });
  console.log(
    `realms: ${cells.length} cells, ${mapped.length} realms coloured, ${fill.indices.length / 3} fill triangles ` +
      `(${fill.codes.length} vertices); borders ${perRank.join('; ')}; ${labels.length} labels → ${LABELS_PATH}`,
  );
  return { fill, strips };
}
