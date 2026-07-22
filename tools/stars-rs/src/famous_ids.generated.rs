// tools/stars-rs/src/famous_ids.generated.rs
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-famous-stars
// Source of truth:  data/seeds/famous_stars.seed.json
//
// Two dedup key arrays derived from every seed entry, subtracted from the
// native star bin so a catalogued star never doubles a scene body:
//   FAMOUS_STAR_GAIA_IDS — the non-null gaiaDr3 values (Gaia DR3 source_ids).
//   FAMOUS_STAR_HIP_IDS  — the non-null hip values (Hipparcos numbers), which
//     catch the saturated bright stars Gaia DR3 lacks a row for.
// include!()-d into population.rs so the consts land in that module's
// namespace, exactly where the hand-maintained array used to live.
pub const FAMOUS_STAR_GAIA_IDS: [u64; 49] = [
    5853498713190525696, // proxima-centauri
    4472832130942575872, // barnards-star
    3864972938605115520, // wolf-359
    762815470562110464, // lalande-21185
    5140693571158739840, // luyten-726-8
    4075141768785646848, // ross-154
    1926461164913660160, // ross-248
    5164707970261890560, // epsilon-eridani
    6553614253923452800, // lacaille-9352
    3796072592206250624, // ross-128
    2596740426913080576, // ez-aquarii
    1872046609345556480, // 61-cygni
    2154880616774131840, // struve-2398
    385334230892516480, // groombridge-34
    6412595290592307840, // epsilon-indi
    2452378776434477184, // tau-ceti
    4810594479418041856, // kapteyns-star
    6560604777055249536, // alnair
    1576683529448755328, // alioth
    1510374147844219904, // alkaid
    4493746564376875520, // rasalhague
    3011968416163350272, // saiph
    6127791439360208640, // muhlifain
    5300300156538723328, // aspidiske
    1222646935698492160, // alphecca
    2067518817314952576, // sadr
    418551920284673408, // schedar
    5534788672055388032, // naos
    423018377034969216, // caph
    1279798794197267072, // izar
    5905821894507108864, // alpha-lupi
    6026152137856166912, // larawag
    856096765753549056, // merak
    4993479684438433792, // ankaa
    5961206940987571200, // girtab
    792588939773693568, // phecda
    5605797194566011520, // aludra
    2193192137376175488, // alderamin
    5310393535853560576, // markeb
    426558460884582016, // gamma-cassiopeiae
    2816504901198512768, // markab
    1869302503206674304, // aljanah
    2493390319631956352, // mira
    2026116260337482112, // albireo
    2200153454733285248, // delta-cephei
    5350358584482202880, // eta-carinae
    2835207319109249920, // 51-pegasi
    4152993273702130432, // uy-scuti
    1220110705972528512, // t-coronae-borealis
];
pub const FAMOUS_STAR_HIP_IDS: [u32; 99] = [
    70890, // proxima-centauri
    71683, // alpha-centauri
    87937, // barnards-star
    32349, // sirius
    37279, // procyon
    8102, // tau-ceti
    97649, // altair
    91262, // vega
    113368, // fomalhaut
    37826, // pollux
    30438, // canopus
    69673, // arcturus
    24608, // capella
    24436, // rigel
    7588, // achernar
    27989, // betelgeuse
    60718, // acrux
    21421, // aldebaran
    80763, // antares
    65474, // spica
    102098, // deneb
    49669, // regulus
    33579, // adhara
    36850, // castor
    85927, // shaula
    61084, // gacrux
    25336, // bellatrix
    25428, // elnath
    45238, // miaplacidus
    26311, // alnilam
    109268, // alnair
    26727, // alnitak
    62956, // alioth
    54061, // dubhe
    15863, // mirfak
    34444, // wezen
    39953, // gamma-velorum
    86228, // sargas
    90185, // kaus-australis
    41037, // avior
    67301, // alkaid
    28360, // menkalinan
    82273, // atria
    31681, // alhena
    100751, // peacock
    42913, // alsephina
    30324, // mirzam
    11767, // polaris
    46390, // alphard
    9884, // hamal
    3419, // diphda
    65378, // mizar
    92855, // nunki
    68933, // menkent
    677, // alpheratz
    5447, // mirach
    86032, // rasalhague
    50583, // algieba
    72607, // kochab
    27366, // saiph
    57632, // denebola
    14576, // algol
    112122, // tiaki
    61932, // muhlifain
    45556, // aspidiske
    44816, // suhail
    76267, // alphecca
    25930, // mintaka
    100453, // sadr
    87833, // eltanin
    3179, // schedar
    39429, // naos
    9640, // almach
    746, // caph
    72105, // izar
    71860, // alpha-lupi
    66657, // epsilon-centauri
    78401, // dschubba
    82396, // larawag
    71352, // eta-centauri
    53910, // merak
    5348, // ankaa
    86670, // girtab
    107315, // enif
    113881, // scheat
    84012, // sabik
    58001, // phecda
    35904, // aludra
    105199, // alderamin
    45941, // markeb
    4427, // gamma-cassiopeiae
    113963, // markab
    102488, // aljanah
    10826, // mira
    95947, // albireo
    110991, // delta-cephei
    113357, // 51-pegasi
    35793, // vy-canis-majoris
    78322, // t-coronae-borealis
];
