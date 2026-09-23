/*
 * The market: plugins.json, fetched from the same site, drawn by render.js.
 *
 * Two views on one page. The shelf (search, filters, a card per plugin) is
 * the page; `#/plugin/<id>` swaps it for that plugin's own page. Every other
 * hash is an ordinary anchor into the shelf page.
 */
import { readEntry, card, detail, el, licenceName, rawUrl, blobUrl, SCOPE } from "./render.js";
import { calm, flip, reveal, spotlight, satellites } from "./motion.js";

const $ = (s) => document.querySelector(s);

const state = { all: [], q: "", cat: "", scope: "", sort: "added", showAllCats: false };

/* ── licences ───────────────────────────────────────────────────
   Not in the catalogue: read from LICENSE at the pinned commit, once per
   plugin, and written into every place that shows it as text. */
const licences = new Map();
function licenceOf(e) {
  if (!e.repo) return Promise.resolve("");
  if (!licences.has(e.id)) {
    licences.set(e.id, fetch(rawUrl(e, "LICENSE"), { referrerPolicy: "no-referrer", credentials: "omit" })
      .then((r) => (r.ok ? r.text() : ""))
      .then(licenceName)
      .catch(() => ""));
  }
  return licences.get(e.id);
}
function fillLicences(scope, entries) {
  for (const node of scope.querySelectorAll("[data-licence]")) {
    const e = entries.find((x) => x.id === node.dataset.licence);
    if (!e) continue;
    licenceOf(e).then((name) => {
      node.textContent = "";
      if (node.tagName === "DD") {
        if (!name) { node.textContent = "see the repository"; return; }
        const a = el(document, "a", null, name);
        a.href = blobUrl(e, "LICENSE");
        a.rel = "noopener noreferrer";
        node.append(a);
      } else node.textContent = name;
    });
  }
}

/* ── the shelf ─────────────────────────────────────────────────── */
function matches(e) {
  if (state.cat && !e.categories.includes(state.cat)) return false;
  if (state.scope && e.scope !== state.scope) return false;
  const q = state.q.trim().toLowerCase();
  if (!q) return true;
  const hay = [e.title, e.id, e.publisher, e.description, ...e.categories, e.repo ? `${e.repo.owner}/${e.repo.name}` : ""].join("\n").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

function sorted(list) {
  const out = [...list];
  if (state.sort === "name") out.sort((a, b) => a.title.localeCompare(b.title));
  else out.sort((a, b) => (b.added || "").localeCompare(a.added || "") || a.title.localeCompare(b.title));
  return out;
}

function renderChips() {
  const box = $("#cats");
  box.textContent = "";
  const counts = new Map();
  for (const e of state.all) for (const c of e.categories) counts.set(c, (counts.get(c) || 0) + 1);
  /* A category that names a single plugin narrows nothing a search would
     not: chips appear once a category holds two. */
  const cats = [...counts].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const LIMIT = 8;
  const shown = state.showAllCats ? cats : cats.slice(0, LIMIT);
  if (state.cat && !shown.some(([c]) => c === state.cat)) shown.push([state.cat, counts.get(state.cat) || 0]);
  const chip = (value, label, n) => {
    const b = el(document, "button", "pl-chip", label);
    b.type = "button";
    b.dataset.cat = value;
    b.setAttribute("aria-pressed", String(state.cat === value));
    if (n != null) b.append(el(document, "span", "pl-chip-n", String(n)));
    box.append(b);
  };
  box.hidden = cats.length === 0;
  chip("", "All", state.all.length);
  for (const [c, n] of shown) chip(c, c, n);
  if (cats.length > LIMIT) {
    const more = el(document, "button", "pl-chip more", state.showAllCats ? "Fewer" : `${cats.length - LIMIT} more`);
    more.type = "button";
    more.dataset.more = "1";
    more.setAttribute("aria-expanded", String(state.showAllCats));
    box.append(more);
  }
}

/* Each card is built once and moved, not rebuilt, as the filters change: a
   keystroke must not reload every preview. */
const cards = new Map();
function renderShelf({ animate = false } = {}) {
  const grid = $("#grid");
  const hits = sorted(state.all.filter(matches));
  /* A filter picked from a chip or a menu moves the cards to their new places;
     typing does not animate, it only has to be instant. */
  const update = () => grid.replaceChildren(...hits.map((e) => cards.get(e.id)));
  if (animate) flip(grid, update); else update();
  const n = hits.length;
  const total = state.all.length;
  $("#count").textContent = n === total ? `${total} ${total === 1 ? "plugin" : "plugins"}` : `${n} of ${total} plugins`;
  const empty = $("#empty");
  empty.hidden = n > 0 || total === 0;
  if (!empty.hidden) {
    const what = state.q.trim() ? `No plugin matches “${state.q.trim()}”` : "No plugin matches these filters";
    $("#empty-what").textContent = what + (state.cat ? ` in ${state.cat}` : "") + (state.scope ? ` with ${SCOPE[state.scope].label.toLowerCase()}` : "") + ".";
  }
  renderChips();
}

/* ── the seal in the hero: the newest listing, as the catalogue names it ─ */
function renderSeal() {
  const e = sorted(state.all.filter((x) => x.ref && x.sha256))[0];
  const seal = $("#seal");
  seal.hidden = !e;
  if (!e) return;
  $("#seal-id").textContent = e.id;
  $("#seal-title").textContent = e.title;
  $("#seal-title").href = "#/plugin/" + encodeURIComponent(e.id);
  $("#seal-ref").textContent = e.ref;
  if (e.added) $("#seal-cap").textContent = `plugins.json · listed ${e.added}`;
  $("#seal-sha-real").textContent = e.sha256;
  settle($("#seal-sha"), e.sha256, seal, () => seal.classList.add("sealed"));
}

/**
 * The page's proof moment: a hash settles, left to right, into the value the
 * app will check the files against. Played once, when `watch` is on screen
 * (on a phone the seal sits below the fold, and a moment nobody sees is not
 * a moment); drawn still under reduced motion. `node` is hidden from screen
 * readers, which read the value from a hidden copy.
 */
function settle(node, value, watch, done = () => {}) {
  if (calm.matches) { node.textContent = value; done(); return; }
  const hex = "0123456789abcdef";
  let i = 0;
  const tick = () => {
    i = Math.min(value.length, i + 2);
    let s = value.slice(0, i);
    for (let k = i; k < value.length; k++) s += hex[(Math.random() * 16) | 0];
    node.textContent = s;
    if (i < value.length) setTimeout(tick, 22); else done();
  };
  node.textContent = "0".repeat(value.length);
  if (!("IntersectionObserver" in window)) { setTimeout(tick, 380); return; }
  new IntersectionObserver(([x], o) => {
    if (x.isIntersecting) { o.disconnect(); setTimeout(tick, 500); }
  }, { threshold: 0.6 }).observe(watch);
}

/* ── the lightbox: the picture at actual size, one way out ───────── */
function lightbox(src, alt, opener) {
  const box = el(document, "div", "pl-lb");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", alt);
  const img = el(document, "img");
  img.src = src;
  img.alt = alt;
  img.referrerPolicy = "no-referrer";
  const cap = el(document, "div", "pl-lb-cap", "Click the image for actual size  ·  Esc to close");
  const x = el(document, "button", "pl-lb-x", "×");
  x.type = "button";
  x.setAttribute("aria-label", "Close");
  const root = document.documentElement;
  const was = root.style.overflow;
  const close = () => {
    box.remove();
    root.style.overflow = was;
    removeEventListener("keydown", keys, true);
    opener.focus({ preventScroll: true });
  };
  const keys = (ev) => {
    if (ev.key === "Escape") { ev.preventDefault(); close(); }
    else if (ev.key === "Tab") { ev.preventDefault(); x.focus(); }
  };
  img.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const full = box.classList.toggle("full");
    cap.textContent = full ? "Click again to fit  ·  Esc to close" : "Click the image for actual size  ·  Esc to close";
  });
  box.addEventListener("click", close);
  x.addEventListener("click", close);
  addEventListener("keydown", keys, true);
  box.append(img, cap, x);
  root.style.overflow = "hidden";
  document.body.append(box);
  x.focus({ preventScroll: true });
}

/* ── routing ──────────────────────────────────────────────────── */
let lastCard = "";
let wantSearch = false;
const cardOf = (id) => [...document.querySelectorAll("#grid .pl-card")].find((c) => c.dataset.id === id);

/* The picture and the name travel between a card and its page: the same two
   elements, named for the length of one view transition. */
function name(node, n) { if (node) node.style.viewTransitionName = n; }
function unname() { for (const n of document.querySelectorAll("[data-vt]")) { n.style.viewTransitionName = ""; delete n.dataset.vt; } }
function tag(node, n) { if (node) { name(node, n); node.dataset.vt = "1"; } }
function withTransition(update, before, animate) {
  if (!animate || !document.startViewTransition || calm.matches) { update(); return; }
  unname();
  if (before) before();
  const t = document.startViewTransition(update);
  t.finished.finally(unname);
}

function showPlugin(id) {
  const home = $("#home");
  const view = $("#view");
  const e = state.all.find((x) => x.id === id);
  view.textContent = "";
  const w = el(document, "div", "w");
  if (e) {
    w.append(detail(document, e));
    fillLicences(w, [e]);
    document.title = `${e.title} · agentglass plugins`;
    /* The proof moment again, where the decision is made: the hash on this
       page settles into the value the market checks. */
    const row = [...w.querySelectorAll(".pl-fact")].find((r) => r.querySelector("dt")?.textContent === "sha256");
    const shown = row && row.querySelector("code[aria-hidden]");
    if (shown && e.sha256) settle(shown, e.sha256, row);
  } else {
    const box = el(document, "div", "pl-missing");
    box.append(el(document, "h1", null, "No such plugin"), el(document, "p", null, state.all.length ? "It is not in the catalogue, or it was taken out. These are:" : "The catalogue did not load."));
    const back = el(document, "a", "pl-ghost", "All plugins");
    back.href = "#/";
    box.append(back);
    /* Somewhere to go instead: what the catalogue does hold. */
    if (state.all.length) {
      const grid = el(document, "div", "pl-grid");
      for (const x of sorted(state.all).slice(0, 4)) grid.append(card(document, x, "#/plugin/" + encodeURIComponent(x.id)));
      fillLicences(grid, state.all);
      box.append(grid);
    }
    w.append(box);
    document.title = "Not found · agentglass plugins";
  }
  view.append(w);
  home.hidden = true;
  view.hidden = false;
  document.body.dataset.route = "plugin";
  window.scrollTo({ top: 0, behavior: "instant" });
  tag(view.querySelector(".pl-stage img, .pl-stage .pl-manifest"), "vt-shot");
  tag(view.querySelector("h1"), "vt-title");
  const h = view.querySelector("h1");
  if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}

function showHome() {
  const home = $("#home");
  const view = $("#view");
  view.hidden = true;
  view.textContent = "";
  home.hidden = false;
  document.body.dataset.route = "home";
  document.title = "agentglass plugins";
  /* Back from a plugin: to its card on the shelf, and the keyboard with it.
     The way back is "#/", which names no element: a fragment such as
     "#browse" makes Chrome scroll to it once the shelf is laid out again,
     and that scroll takes the focus back off the card.
     Only a way back returns to the card: a link to another part of the page
     (the header, "List yours") goes where it says. */
  const back = location.hash === "" || location.hash === "#/";
  const target = back && lastCard ? cardOf(lastCard) : null;
  lastCard = "";
  if (wantSearch) {
    wantSearch = false;
    $("#browse").scrollIntoView({ behavior: "instant" });
    q.focus({ preventScroll: true });
  } else if (target) {
    tag(target.querySelector(".pl-shot img, .pl-shot .pl-manifest"), "vt-shot");
    tag(target.querySelector(".pl-name"), "vt-title");
    /* Twice: the browser's own Back restores the old scroll position after
       this event, and on the way resets the focus to the page. */
    const restore = () => {
      target.scrollIntoView({ block: "center", behavior: "instant" });
      target.querySelector(".pl-name").focus({ preventScroll: true });
    };
    restore();
    setTimeout(restore, 0);
  } else {
    const anchor = location.hash.length > 2 ? document.getElementById(location.hash.slice(1)) : null;
    (anchor || $("#browse")).scrollIntoView({ behavior: "instant" });
  }
}

/* Called with the hashchange event when the visitor moves, and without it
   for the page's first view, which does not animate. */
function route(ev) {
  const animate = !!ev;
  const m = location.hash.match(/^#\/plugin\/(.+)$/);
  if (m) {
    let id = "";
    try { id = decodeURIComponent(m[1]); } catch { /* a malformed hash is no plugin */ }
    const from = $("#home").hidden ? null : cardOf(id);
    withTransition(() => showPlugin(id), () => {
      tag(from && from.querySelector(".pl-shot img, .pl-shot .pl-manifest"), "vt-shot");
      tag(from && from.querySelector(".pl-name"), "vt-title");
    }, animate);
    lastCard = id;
    return;
  }
  if (!$("#home").hidden) {
    /* Already home: the lockup's "#/" means the top of the page. */
    if (location.hash === "#/") window.scrollTo({ top: 0, behavior: calm.matches ? "instant" : "smooth" });
    return;
  }
  withTransition(showHome, null, animate);
}
window.addEventListener("hashchange", route);

/* ── controls ─────────────────────────────────────────────────── */
const q = $("#q");
q.addEventListener("input", () => { state.q = q.value; renderShelf(); });
q.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && q.value) { q.value = ""; state.q = ""; renderShelf(); ev.stopPropagation(); }
});
$("#scope").addEventListener("change", (ev) => { state.scope = ev.target.value; renderShelf({ animate: true }); });
$("#sort").addEventListener("change", (ev) => { state.sort = ev.target.value; renderShelf({ animate: true }); });
$("#cats").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.dataset.more) { state.showAllCats = !state.showAllCats; renderChips(); $("#cats [data-more]").focus(); return; }
  state.cat = b.dataset.cat === state.cat ? "" : b.dataset.cat;
  renderShelf({ animate: true });
  const again = [...document.querySelectorAll("#cats .pl-chip")].find((c) => c.dataset.cat === b.dataset.cat);
  if (again) again.focus();
});
$("#clear").addEventListener("click", () => {
  state.q = ""; state.cat = ""; state.scope = "";
  q.value = ""; $("#scope").value = "";
  renderShelf({ animate: true });
  q.focus();
});
/* The hero's prompt goes to the shelf and, with a keyboard at hand, puts the
   cursor in its search. On a touch screen a focused field would raise the
   keyboard over the cards the visitor came to see. */
$("#hero-go").addEventListener("click", (ev) => {
  ev.preventDefault();
  $("#browse").scrollIntoView({ behavior: calm.matches ? "instant" : "smooth" });
  if (matchMedia("(pointer: fine)").matches) q.focus({ preventScroll: true });
});
/* Ctrl+K (Cmd+K on a Mac) goes to the search. Not a bare "/": a one-key
   shortcut fires on every "/" that speech input types (WCAG 2.1.4). */
const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
$("#q-key").textContent = mac ? "⌘ K" : "Ctrl K";
document.addEventListener("keydown", (ev) => {
  if (ev.key.toLowerCase() !== "k" || !(mac ? ev.metaKey : ev.ctrlKey) || ev.altKey || ev.shiftKey) return;
  ev.preventDefault();
  if ($("#home").hidden) { wantSearch = true; location.hash = "#/"; } else q.focus();
});
/* Copy buttons, wherever render.js drew one. */
const say = (text) => {
  const live = $("#live");
  live.textContent = "";
  requestAnimationFrame(() => { live.textContent = text; });
};
/* Without a clipboard (plain http) or when it refuses: select the value, so
   the person's own copy works, and say so. */
const selectValue = (b) => {
  const code = b.parentElement && b.parentElement.querySelector("code");
  if (code) getSelection().selectAllChildren(code);
  say("Copy failed. The value is selected: copy it with your keyboard.");
};
document.addEventListener("click", (ev) => {
  /* A link to a part of a plugin's own page ("How to install") scrolls there
     and keeps the plugin's route: as a hash of its own it would read as
     "leave for the shelf". */
  const jump = ev.target.closest && ev.target.closest('#view a[href^="#"]:not([href^="#/"])');
  if (jump) {
    const to = document.getElementById(jump.getAttribute("href").slice(1));
    if (to) {
      ev.preventDefault();
      to.scrollIntoView({ behavior: calm.matches ? "instant" : "smooth", block: "start" });
      (to.querySelector("[tabindex='-1']") || to).focus({ preventScroll: true });
    }
    return;
  }
  const zoom = ev.target.closest && ev.target.closest("button.pl-stage");
  if (zoom) { lightbox(zoom.dataset.zoom, zoom.querySelector("img").alt, zoom); return; }
  const b = ev.target.closest && ev.target.closest("button.copy");
  if (!b) return;
  if (!navigator.clipboard) { selectValue(b); return; }
  b.dataset.label ??= b.getAttribute("aria-label");
  navigator.clipboard.writeText(b.dataset.copy).then(() => {
    b.classList.add("done");
    b.setAttribute("aria-label", "Copied");
    say("Copied to the clipboard.");
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.classList.remove("done"); b.setAttribute("aria-label", b.dataset.label); }, 1400);
  }, () => selectValue(b));
});
spotlight($("#grid"));

/* ── load ─────────────────────────────────────────────────────── */
function fail(msg) {
  $("#grid").textContent = "";
  $("#seal").hidden = true;
  $("#hero-facts").textContent = "";
  $("#count").textContent = "";
  const box = $("#error");
  box.hidden = false;
  $("#error-what").textContent = msg;
}
async function load() {
  $("#error").hidden = true;
  $("#grid").setAttribute("aria-busy", "true");
  try {
    const r = await fetch("plugins.json", { cache: "no-cache", credentials: "omit" });
    if (!r.ok) throw new Error(`the server answered ${r.status}`);
    const data = await r.json();
    if (!data || !Array.isArray(data.plugins)) throw new Error("the file has no list of plugins");
    const seen = new Set();
    state.all = data.plugins.map(readEntry).filter((e) => e && !seen.has(e.id) && seen.add(e.id));
    const pinned = state.all.filter((e) => e.ref && e.sha256).length;
    const n = state.all.length;
    $("#hero-facts").textContent = n === 0 ? "Nothing is listed yet."
      : pinned === n ? `${n === 1 ? "The one listing is" : n === 2 ? "Both listings are" : `All ${n} listings are`} pinned to a commit and a content hash.`
      : `${pinned} of ${n} listings are pinned to a commit and a content hash.`;
    cards.clear();
    for (const e of state.all) cards.set(e.id, card(document, e, "#/plugin/" + encodeURIComponent(e.id)));
    for (const c of cards.values()) fillLicences(c, state.all);
    renderShelf();
    reveal([...cards.values()]);
    renderSeal();
    satellites(n);
  } catch (err) {
    fail(`The catalogue did not load (${err && err.message ? err.message : "unknown error"}). Check your connection and try again.`);
  } finally {
    $("#grid").removeAttribute("aria-busy");
  }
  if (location.hash.startsWith("#/plugin/")) route();
  else if (location.hash.length > 2 && location.hash !== "#/") document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "instant" });
}
$("#retry").addEventListener("click", load);
load();
