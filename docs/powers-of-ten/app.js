// Powers of Ten — render the ladder + the full-screen image gallery.
// Data comes from data.js (curated rungs) and images.js (generated thumbnails).

import { RUNGS, ZONES, STATUS } from "./data.js";
import { IMAGES } from "./images.js";

// Attach the generated image manifest to each rung by exp.
for (const r of RUNGS) r.images = IMAGES[r.exp] || [];

// The status filter is a set of currently-visible statuses; start with all on.
const active = new Set(Object.keys(STATUS));

// Rungs per status — a census of the ladder, so it is computed once and never
// recomputed on toggle: hiding a status changes what is on screen, not how many
// rungs carry it. The header count is the one that tracks the filter.
const STATUS_COUNTS = RUNGS.reduce((n, r) => ((n[r.status] = (n[r.status] || 0) + 1), n), {});

function expHtml(e) {
  // Superscript with a proper minus sign for negatives.
  const sign = e < 0 ? "−" : "";
  return `10<sup>${sign}${Math.abs(e)}</sup>`;
}

function sourceHtml(src) {
  return src
    .map(([name, url, note]) => {
      const link = `<a href="${url}" target="_blank" rel="noopener">${name}</a>`;
      return note ? `${link} <span class="note">— ${note}</span>` : link;
    })
    .join('<span class="sep">·</span>');
}

function thumbsHtml(r) {
  if (!r.images.length) {
    return `<p class="thumbs-empty">No open-licensed example imagery gathered for this scale.</p>`;
  }
  const cells = r.images
    .map(
      (img, i) =>
        `<button class="thumb" data-exp="${r.exp}" data-idx="${i}" title="${escapeAttr(img.title)}">
           <img loading="lazy" src="${img.thumb}" alt="${escapeAttr(img.title)}" />
         </button>`
    )
    .join("");
  return `<div class="thumbs">${cells}</div>`;
}

function escapeAttr(s) {
  return String(s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function render() {
  const ladder = document.getElementById("ladder");
  ladder.innerHTML = RUNGS.map((r) => {
    const zone = ZONES[r.zone];
    const st = STATUS[r.status];
    const hidden = active.has(r.status) ? "" : " hidden";
    const pivot = r.pivot ? " pivot" : "";
    const flag = r.pivot ? `<div class="youarehere">◆ You are here</div>` : "";
    return `
      <section class="rung${hidden}${pivot} ${st.cls}" style="--accent:${zone.color}" data-status="${r.status}">
        <div class="scale">
          <div class="exp">${expHtml(r.exp)}</div>
          <div class="meters">${r.m}</div>
          <div class="anchor">${r.anchor}</div>
          <div class="zonetag">${zone.label}</div>
        </div>
        <div class="body">
          ${flag}
          <h3 class="subject">${r.subject} <span class="badge">${st.label}</span>${r.ref ? ` <a class="ref" href="${r.ref[1]}" target="_blank" rel="noopener">${r.ref[0]} ↗</a>` : ""}</h3>
          <p class="field"><span class="k">Visualize</span><span class="v">${r.viz}</span></p>
          <p class="field"><span class="k">Data</span><span class="v sources">${sourceHtml(r.src)}</span></p>
          ${thumbsHtml(r)}
        </div>
      </section>`;
  }).join("");
  updateCount();
}

function updateCount() {
  const shown = RUNGS.filter((r) => active.has(r.status)).length;
  document.getElementById("count").textContent =
    `${shown} of ${RUNGS.length} rungs · 10²⁷ → 10⁻¹⁸ m`;
}

function buildLegend() {
  document.getElementById("legend").innerHTML = Object.values(ZONES)
    .map((z) => `<span class="zone"><span class="dot" style="color:${z.color}"></span>${z.label}</span>`)
    .join("");
}

function buildFilters() {
  const box = document.getElementById("filters");
  Object.entries(STATUS).forEach(([key, s]) => {
    const chip = document.createElement("button");
    chip.className = `chip ${s.cls}`;
    chip.style.setProperty("color", "var(--st)");
    chip.innerHTML = `${s.label}<span class="n">${STATUS_COUNTS[key] || 0}</span>`;
    chip.setAttribute("aria-pressed", "true");
    chip.onclick = () => {
      if (active.has(key)) active.delete(key);
      else active.add(key);
      chip.setAttribute("aria-pressed", String(active.has(key)));
      chip.classList.toggle("off", !active.has(key));
      // Toggle visibility without a full re-render so scroll position holds.
      document
        .querySelectorAll(`.rung[data-status="${key}"]`)
        .forEach((el) => el.classList.toggle("hidden", !active.has(key)));
      updateCount();
    };
    box.appendChild(chip);
  });
}

// ---- Full-screen gallery ----------------------------------------------------
// One lightbox reused across all rungs. A "gallery" is the current rung's image
// list; open() seeds it and show() paints the given index.

const lb = {
  root: null,
  img: null,
  caption: null,
  prev: null,
  next: null,
  list: [],
  idx: 0,
};

function buildLightbox() {
  const root = document.createElement("div");
  root.className = "lightbox";
  root.innerHTML = `
    <div class="lb-stage">
      <button class="lb-btn lb-close" aria-label="Close">✕</button>
      <button class="lb-btn lb-nav lb-prev" aria-label="Previous">‹</button>
      <img alt="" />
      <button class="lb-btn lb-nav lb-next" aria-label="Next">›</button>
    </div>
    <div class="lb-caption"></div>`;
  document.body.appendChild(root);

  lb.root = root;
  lb.img = root.querySelector(".lb-stage img");
  lb.caption = root.querySelector(".lb-caption");
  lb.prev = root.querySelector(".lb-prev");
  lb.next = root.querySelector(".lb-next");

  root.querySelector(".lb-close").onclick = close;
  lb.prev.onclick = () => step(-1);
  lb.next.onclick = () => step(1);
  // Click the dim backdrop (the stage, not the image/buttons) to close.
  root.querySelector(".lb-stage").onclick = (e) => {
    if (e.target.classList.contains("lb-stage")) close();
  };
  document.addEventListener("keydown", (e) => {
    if (!lb.root.classList.contains("open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
  });
}

function open(list, idx) {
  lb.list = list;
  lb.idx = idx;
  lb.root.classList.add("open");
  document.body.style.overflow = "hidden";
  show();
}

function close() {
  lb.root.classList.remove("open");
  document.body.style.overflow = "";
  lb.img.src = "";
}

function step(delta) {
  const n = lb.list.length;
  lb.idx = (lb.idx + delta + n) % n;
  show();
}

function show() {
  const img = lb.list[lb.idx];
  const single = lb.list.length <= 1;
  lb.prev.toggleAttribute("disabled", single);
  lb.next.toggleAttribute("disabled", single);
  lb.img.src = img.full;
  lb.img.alt = img.title;
  const author = img.author ? `${img.author}` : "Unknown author";
  lb.caption.innerHTML = `
    <span class="lb-counter">${lb.idx + 1} / ${lb.list.length}</span>
    <div class="t">${img.title}</div>
    <div class="meta">
      ${author} <span class="dim">·</span> ${img.license || "see source"}
      <span class="dim">·</span> ${img.source}
      <span class="dim">·</span> <a href="${img.page}" target="_blank" rel="noopener">View original ↗</a>
    </div>`;
}

// Delegate thumbnail clicks to the ladder container.
function wireThumbnails() {
  document.getElementById("ladder").addEventListener("click", (e) => {
    const btn = e.target.closest(".thumb");
    if (!btn) return;
    const exp = Number(btn.dataset.exp);
    const idx = Number(btn.dataset.idx);
    const rung = RUNGS.find((r) => r.exp === exp);
    if (rung && rung.images.length) open(rung.images, idx);
  });
}

buildLegend();
buildFilters();
buildLightbox();
render();
wireThumbnails();
