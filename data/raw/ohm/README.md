# OpenHistoricalMap — 1690 boundary relations

The lines the antique Earth map's 1690 realms cut along in the Rhineland and
the Low Countries, where no modern admin-1 edge follows the old border
(`npm run build-antique-earth` → `public/antique/earth-1690.bin`;
`tools/antique/earth/data/realmCuts1690.ts` says which relation cuts which units).

|          |                                                                                       |
| -------- | ------------------------------------------------------------------------------------- |
| File     | `ohm-relations-1690.json` (3.1 MB): `{ snapshot, elements }`, key-sorted; elements are the relations (members by reference, `out meta`) then their member ways (`out meta geom`) |
| Upstream | OpenHistoricalMap Overpass, <https://overpass-api.openhistoricalmap.org/api/interpreter> |
| Snapshot | `2026-11-07T14:38:11Z`, an attic query (`[date:"…"]`), so a re-fetch returns the same data |
| Fetched  | 2026-11-07 (`npm run fetch-ohm-1690`)                                                 |
| Checksum | `ohm.sha256` beside this file                                                         |
| Licence  | CC0 1.0. Overpass states "The data is made available under CC0"; the fetcher refuses any element whose `license`/`licence` tag is not CC0 |

## Query

```
[out:json][timeout:300][date:"2026-11-07T14:38:11Z"];
relation(id:<the ids below>)->.r;.r out meta;way(r.r);out meta geom;
```

## Relations (pinned in `tools/antique/earth/data/ohmRelations1690.ts`)

Each is alive on 1690-07-01 (`start_date` ≤ it < `end_date`); the fetcher and
the bake both refuse a relation whose version differs from its pin.

| id      | version | name                               |
| ------- | ------- | ---------------------------------- |
| 2695999 | 27      | Fürstentum Ostfriesland            |
| 2696468 | 31      | Herzogtum Berg                     |
| 2744511 | 23      | Herzogtum Kleve                    |
| 2748665 | 27      | Hochstift Osnabrück                |
| 2806958 | 23      | Herzogtum Westfalen                |
| 2806963 | 15      | Hochstift Paderborn                |
| 2807030 | 43      | Hochstift Münster                  |
| 2809747 | 20      | Grafschaft Mark                    |
| 2810096 | 15      | Herzogtum Limburg                  |
| 2815082 | 20      | Trois-Évêchés                      |
| 2815358 | 28      | Duché de Lorraine                  |
| 2815360 | 15      | Duché de Bar                       |
| 2815497 | 21      | Herzogtum Luxemburg                |
| 2830738 | 41      | Kurfürstentum Mainz                |
| 2831106 | 40      | Kurfürstentum Köln                 |
| 2831525 | 11      | Herzogtum Obergeldern              |
| 2840402 | 15      | Fürstentum Ostfriesland            |
| 2851710 | 17      | Grafschaft Oldenburg               |
| 2896786 | 10      | Bremen-Verden                      |
| 2946204 | 12      | Principatus episcopalis Leodiensis |

## How the bake reads it

The faces a relation's outer member ways enclose, less those its `inner` ways
enclose, make its polygons (mapshaper `-polygons` builds the faces from the way
network, so a ring split over many ways still closes). A cut's relations are
merged, and parts and holes under 40 km² are dropped, as an engraver left out
an enclave of a few villages.
