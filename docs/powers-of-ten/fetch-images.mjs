// Gather open-licensed example imagery for each rung of the Powers of Ten map,
// from MULTIPLE archives (not just Wikipedia), then de-duplicate near-identical
// results (e.g. the same diagram re-uploaded in several languages).
//
// Sources, chosen for open licences + a real API + per-image attribution:
//   • NASA Images  (images-api.nasa.gov)      — public domain — space / Earth / Sun
//   • Openverse    (api.openverse.org)         — CC — aggregates Flickr, the Met,
//                                                 iNaturalist, science museums, …
//   • Wikimedia Commons                        — CC / PD — broad fallback
//   • RCSB PDB     (search.rcsb.org + cdn)      — public-domain molecular renders
//
// Dedup: a 64-bit dHash (via ffmpeg) per candidate; we greedily keep images whose
// Hamming distance to every already-kept image exceeds a threshold, so language
// variants and cross-source re-uploads collapse to one. Providers are interleaved
// so a rung gets a diverse mix rather than eight of the same source.
//
// Re-run:  node fetch-images.mjs            (all rungs)
//          node fetch-images.mjs 27 -5      (only those exponents, for testing)
// Idempotent: clears images/ first (a full rebuild). Output → images.js.

import { writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const THUMBS = join(HERE, "images", "thumbs");
const FULL = join(HERE, "images", "full");
const UA = "skymap-powers-of-ten/1.0 (https://skymap.rulkens.com; rulkens@gmail.com)";

const MAX_PER_RUNG = 8;
const PER_PROVIDER = 10;
const HAM_THRESHOLD = 12; // <= this many differing bits (of 64) ⇒ near-duplicate
const MIN_SRC_W = 500;

// ── plan: provider mix + search query per exponent ──────────────────────────
const SPACE = ["nasa", "commons", "openverse"];
const GEN = ["openverse", "commons"];
const MOLE = ["pdb", "openverse", "commons"];
const PLAN = {
  27: ["Hubble deep field galaxies", SPACE],
  26: ["cosmic web dark matter simulation", SPACE],
  25: ["galaxy redshift survey map", ["commons", "openverse"]],
  24: ["galaxy supercluster", ["commons", "openverse", "nasa"]],
  23: ["galaxy cluster", SPACE],
  22: ["Andromeda galaxy", SPACE],
  21: ["Milky Way galaxy", SPACE],
  20: ["Milky Way spiral arm", ["commons", "openverse", "nasa"]],
  19: ["open star cluster", SPACE],
  18: ["Orion Nebula", SPACE],
  17: ["Alpha Centauri nearest stars", ["commons", "openverse", "nasa"]],
  16: ["Oort cloud comet", ["commons", "openverse", "nasa"]],
  15: ["Kuiper belt", ["commons", "openverse", "nasa"]],
  14: ["heliosphere", ["commons", "openverse", "nasa"]],
  13: ["Kuiper belt heliosphere", SPACE],
  12: ["gas giant planets Jupiter Saturn", SPACE],
  11: ["solar system planets", SPACE],
  10: ["solar corona eclipse", SPACE],
  9: ["Sun solar surface", SPACE],
  8: ["Earth and Moon from space", SPACE],
  7: ["Earth from space blue marble", SPACE],
  6: ["continent from space satellite", ["nasa", "commons", "openverse"]],
  5: ["river delta satellite image", ["nasa", "commons", "openverse"]],
  4: ["city aerial view", GEN],
  3: ["suburban neighborhood aerial", GEN],
  2: ["building architecture", GEN],
  1: ["blue whale", GEN],
  0: ["person stargazing looking up at sky", GEN],
  "-1": ["human face looking upward", GEN],
  "-2": ["human eye anatomy", GEN],
  "-3": ["retina fundus optical coherence tomography", GEN],
  "-4": ["retina histology layers microscope", GEN],
  "-5": ["retinal ganglion cell neuron", GEN],
  "-6": ["cell nucleus microscope", GEN],
  "-7": ["chromatin chromosome", MOLE],
  "-8": ["nucleosome", MOLE],
  "-9": ["DNA double helix", MOLE],
  "-10": ["atom scanning tunneling microscope", GEN],
  "-11": ["atomic orbital electron", GEN],
  "-12": ["atom model", GEN],
  "-13": ["atomic nucleus rutherford model", GEN],
  "-14": ["atomic nucleus", GEN],
  "-15": ["proton quark structure", GEN],
  "-16": ["quark gluon field", GEN],
  "-17": ["deep inelastic scattering Feynman diagram", ["commons", "openverse"]],
  "-18": ["particle collision detector event display", ["commons", "openverse"]],
};

// ── generic helpers ─────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn, label, tries = 4) {
  let last;
  for (let t = 0; t < tries; t++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(400 * (t + 1) * (t + 1));
    }
  }
  throw new Error(`${label}: ${last.message}`);
}

async function getJson(url, opts = {}) {
  return withRetry(async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA }, ...opts });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }, "api");
}

async function fetchBuf(url) {
  return withRetry(async () => {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(String(res.status));
    return Buffer.from(await res.arrayBuffer());
  }, "img");
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/^[\s,;·-]+/, "").replace(/\s+/g, " ").trim();
}

function normTitle(t) {
  return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function extOf(url) {
  const m = /\.(jpe?g|png)(?:$|\?)/i.exec(url || "");
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

function tag(exp) {
  return exp >= 0 ? `p${exp}` : `m${-exp}`;
}

// dHash via ffmpeg: scale to 9×8 grayscale, compare adjacent columns → 64 bits.
function dhash(buf) {
  return new Promise((resolve, reject) => {
    const p = execFile(
      "ffmpeg",
      ["-v", "error", "-i", "pipe:0", "-frames:v", "1", "-vf", "scale=9:8,format=gray", "-f", "rawvideo", "pipe:1"],
      { encoding: "buffer", maxBuffer: 1 << 20 },
      (err, out) => {
        if (err) return reject(err);
        if (out.length < 72) return reject(new Error("short"));
        let bits = 0n;
        for (let r = 0; r < 8; r++)
          for (let c = 0; c < 8; c++) {
            const i = r * 9 + c;
            bits = (bits << 1n) | (out[i] < out[i + 1] ? 1n : 0n);
          }
        resolve(bits);
      }
    );
    p.stdin.on("error", () => {});
    p.stdin.end(buf);
  });
}

function hamming(a, b) {
  let x = a ^ b, n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

// ── providers: each returns normalized candidates ───────────────────────────
// { source, title, page, author, license, thumbUrl, fullUrl }

async function commons(query) {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&maxlag=5` +
    `&generator=search&gsrnamespace=6&gsrlimit=${PER_PROVIDER + 4}` +
    `&gsrsearch=${encodeURIComponent(query)}` +
    `&prop=imageinfo&iiprop=url|extmetadata|mime|size&iiurlwidth=1600`;
  const json = await getJson(url);
  const pages = Object.values(json.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const cands = [];
  const titles = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || !ii.thumburl) continue;
    if (!["image/jpeg", "image/png", "image/svg+xml"].includes(ii.mime)) continue;
    if (ii.mime !== "image/svg+xml" && (ii.width || 0) < MIN_SRC_W) continue;
    titles.push(p.title);
    cands.push({
      source: "Wikimedia Commons",
      title: p.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " "),
      page: ii.descriptionurl,
      author: stripHtml(ii.extmetadata?.Artist?.value) || "Unknown",
      license: stripHtml(ii.extmetadata?.LicenseShortName?.value) || "see source",
      _ctitle: p.title,
      fullUrl: ii.thumburl,
      thumbUrl: null, // filled below (bucketed width must come from the API)
    });
  }
  // Resolve valid 400px thumb URLs in one batch.
  if (titles.length) {
    const turl =
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&maxlag=5` +
      `&prop=imageinfo&iiprop=url&iiurlwidth=400&titles=${encodeURIComponent(titles.join("|"))}`;
    try {
      const tj = await getJson(turl);
      const map = {};
      for (const p of Object.values(tj.query?.pages || {})) {
        const u = p.imageinfo?.[0]?.thumburl;
        if (u) map[p.title] = u;
      }
      for (const c of cands) c.thumbUrl = map[c._ctitle];
    } catch { /* leave thumbUrl null → skipped */ }
  }
  return cands.filter((c) => c.thumbUrl);
}

async function nasa(query) {
  const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`;
  const json = await getJson(url);
  const items = (json.collection?.items || []).slice(0, PER_PROVIDER + 4);
  const cands = [];
  for (const it of items) {
    const d = it.data?.[0];
    const preview = it.links?.[0]?.href;
    if (!d || !preview || !/\.(jpe?g|png)$/i.test(preview)) continue;
    const full = preview.replace(/~(thumb|small|medium)\.(jpe?g|png)$/i, "~large.$2");
    cands.push({
      source: "NASA",
      title: d.title || "NASA image",
      page: d.nasa_id ? `https://images.nasa.gov/details/${d.nasa_id}` : preview,
      author: ["NASA", d.center, d.photographer].filter(Boolean).join(" / "),
      license: "Public domain (NASA)",
      thumbUrl: preview,
      fullUrl: full,
    });
  }
  return cands;
}

function ovLicense(r) {
  if (r.license === "cc0") return "CC0";
  if (r.license === "pdm") return "Public domain";
  return `CC ${String(r.license || "").toUpperCase()} ${r.license_version || ""}`.trim();
}

async function openverse(query) {
  const url =
    `https://api.openverse.org/v1/images/?page_size=${PER_PROVIDER}` +
    `&license=cc0,pdm,by,by-sa&q=${encodeURIComponent(query)}`;
  const json = await getJson(url);
  const cands = [];
  for (const r of json.results || []) {
    if (!r.url) continue;
    cands.push({
      source: r.source ? `Openverse · ${r.source}` : "Openverse",
      title: r.title || "Untitled",
      page: r.foreign_landing_url || r.url,
      author: r.creator || "Unknown",
      license: ovLicense(r),
      thumbUrl: r.url, // direct source URL — avoids Openverse's rate-limited proxy
      fullUrl: r.url,
    });
  }
  return cands;
}

async function pdb(query) {
  const body = JSON.stringify({
    query: { type: "terminal", service: "full_text", parameters: { value: query } },
    return_type: "entry",
    request_options: { paginate: { start: 0, rows: PER_PROVIDER } },
  });
  const json = await getJson(
    `https://search.rcsb.org/rcsbsearch/v2/query`,
    { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA }, body }
  );
  const cands = [];
  for (const r of json.result_set || []) {
    const id = String(r.identifier).toLowerCase();
    const img = `https://cdn.rcsb.org/images/structures/${id}_assembly-1.jpeg`;
    cands.push({
      source: "RCSB PDB",
      title: `PDB ${r.identifier}`,
      page: `https://www.rcsb.org/structure/${r.identifier}`,
      author: "RCSB Protein Data Bank",
      license: "CC0 / public domain",
      thumbUrl: img,
      fullUrl: img,
    });
  }
  return cands;
}

const PROVIDERS = { commons, nasa, openverse, pdb };

// Round-robin merge so the kept set is source-diverse.
function interleave(lists) {
  const out = [];
  for (let i = 0; ; i++) {
    let any = false;
    for (const l of lists) if (i < l.length) { out.push(l[i]); any = true; }
    if (!any) break;
  }
  return out;
}

async function gatherRung(exp) {
  const [query, provNames] = PLAN[String(exp)];
  const lists = [];
  for (const name of provNames) {
    try {
      lists.push(await PROVIDERS[name](query));
    } catch (e) {
      console.warn(`  ! ${name}: ${e.message}`);
      lists.push([]);
    }
  }
  const merged = interleave(lists);

  const kept = [];
  const hashes = [];
  const seenTitle = new Set();
  const seenUrl = new Set();
  for (const c of merged) {
    if (kept.length >= MAX_PER_RUNG) break;
    const key = normTitle(c.title);
    if (seenUrl.has(c.fullUrl)) continue;
    if (key && seenTitle.has(key)) continue;
    let buf, h;
    try {
      buf = await fetchBuf(c.thumbUrl);
      h = await dhash(buf);
    } catch {
      continue;
    }
    if (hashes.some((k) => hamming(k, h) <= HAM_THRESHOLD)) continue; // near-dup
    hashes.push(h);
    if (key) seenTitle.add(key);
    seenUrl.add(c.fullUrl);
    kept.push({ c, thumbBuf: buf });
  }
  return kept;
}

async function main() {
  const only = process.argv.slice(2).map(Number);
  // Full run rebuilds from scratch; a subset run (testing / patching thin rungs)
  // keeps the other rungs' already-downloaded files in place.
  if (!only.length) await rm(join(HERE, "images"), { recursive: true, force: true });
  await mkdir(THUMBS, { recursive: true });
  await mkdir(FULL, { recursive: true });

  const manifest = {};
  const exps = Object.keys(PLAN).map(Number).sort((a, b) => b - a);
  for (const exp of exps) {
    if (only.length && !only.includes(exp)) continue;
    const kept = await gatherRung(exp);
    const out = [];
    let i = 0;
    for (const { c, thumbBuf } of kept) {
      const ext = extOf(c.fullUrl);
      const base = `${tag(exp)}_${i}.${ext}`;
      try {
        await writeFile(join(THUMBS, base), thumbBuf);
        // Reuse the thumb bytes when the provider gives one size; else fetch full.
        const fullBuf = c.fullUrl === c.thumbUrl ? thumbBuf : await fetchBuf(c.fullUrl).catch(() => thumbBuf);
        await writeFile(join(FULL, base), fullBuf);
      } catch (e) {
        console.warn(`  ! write ${base}: ${e.message}`);
        continue;
      }
      out.push({
        thumb: `images/thumbs/${base}`,
        full: `images/full/${base}`,
        title: c.title,
        page: c.page,
        author: c.author,
        license: c.license,
        source: c.source,
      });
      i++;
      await sleep(60);
    }
    manifest[exp] = out;
    const mix = out.reduce((m, o) => ((m[o.source.split(" ")[0]] = (m[o.source.split(" ")[0]] || 0) + 1), m), {});
    console.log(`10^${exp}: ${out.length}  ${JSON.stringify(mix)}`);
  }

  // Merge into any existing manifest when running a subset (testing).
  let prev = {};
  if (only.length) {
    try { prev = (await import("./images.js?" + Math.random())).IMAGES; } catch { /* none */ }
  }
  const merged = { ...prev, ...manifest };
  const js =
    "// Generated by fetch-images.mjs — do not edit by hand.\n" +
    "// IMAGES[exp] = [{ thumb, full, title, page, author, license, source }, ...]\n" +
    "export const IMAGES = " + JSON.stringify(merged, null, 2) + ";\n";
  await writeFile(join(HERE, "images.js"), js);

  const total = Object.values(manifest).reduce((n, a) => n + a.length, 0);
  console.log(`\nDone — ${total} images across ${Object.keys(manifest).length} rungs.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
