// tools/stars-rs/src/famous_ids.generated.rs
// !!! GENERATED FILE — DO NOT EDIT BY HAND !!!
// Regenerate with:  npm run build-famous-stars
// Source of truth:  data/seeds/famous_stars.seed.json
//
// FamousStar -> Gaia DR3 ids: the non-null gaiaDr3 values of every seed
// entry, the scene-body dedup keys the star-bin build subtracts from the
// Gaia bin.  include!()-d into population.rs so the const lands in that
// module's namespace, exactly where the hand-maintained array used to live.
pub const FAMOUS_STAR_GAIA_IDS: [u64; 17] = [
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
];
