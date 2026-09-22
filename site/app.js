/*
 * The market: plugins.json, fetched from the same site, drawn by render.js.
 *
 * Two views on one page. The shelf (search, filters, a card per plugin) is
 * the page; `#/plugin/<id>` swaps it for that plugin's own page. Every other
 * hash is an ordinary anchor into the shelf page.
 */
import { readEntry, card, detail, el, licenceName, rawUrl, blobUrl, SCOPE } from "./render.js";

const $ = (s) => document.querySelector(s);
const calm = matchMedia("(prefers-reduced-motion: reduce)");

const state = { all: [], q: "", cat: "", scope: "", sort: "added", showAllCats: false };

/* ── theme ──────────────────────────────────────────────────────
   The system decides until the visitor presses the switch; then their pick is
   kept in this browser only. theme.js applied it before first paint. */
function themeNow() {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function paintThemeButton() {
  const b = $("#theme");
  const next = themeNow() === "dark" ? "light" : "dark";
  b.setAttribute("aria-label", `Switch to the ${next} theme`);
  b.title = `Switch to the ${next} theme`;
  b.dataset.next = next;
}
$("#theme").addEventListener("click", () => {
  const next = themeNow() === "dark" ? "light" : "dark";
  const apply = () => {
    document.documentElement.dataset.theme = next;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) { m.media = ""; m.content = next === "dark" ? "#07060d" : "#f6f5fb"; }
  };
  /* A cross-fade rather than the whole page changing brightness at once. */
  if (document.startViewTransition && !calm.matches) document.startViewTransition(apply); else apply();
  try { localStorage.setItem("theme", next); } catch { /* private window: this visit only */ }
  paintThemeButton();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintThemeButton);
paintThemeButton();

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
      if (!name) { node.textContent = "see repository"; return; }
      if (node.tagName === "DD") {
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
  const cats = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const LIMIT = 8;
  const shown = state.showAllCats ? cats : cats.slice(0, LIMIT);
  if (state.cat && !shown.some(([c]) => c === state.cat)) shown.push([state.cat, counts.get(state.cat) || 0]);
  const chip = (value, label, n) => {
    const b = el(document, "button", "chip", label);
    b.type = "button";
    b.dataset.cat = value;
    b.setAttribute("aria-pressed", String(state.cat === value));
    if (n != null) b.append(el(document, "span", "chip-n", String(n)));
    box.append(b);
  };
  chip("", "All", state.all.length);
  for (const [c, n] of shown) chip(c, c, n);
  if (cats.length > LIMIT) {
    const more = el(document, "button", "chip more", state.showAllCats ? "Fewer" : `${cats.length - LIMIT} more`);
    more.type = "button";
    more.dataset.more = "1";
    more.setAttribute("aria-expanded", String(state.showAllCats));
    box.append(more);
  }
}

/* Each card is built once and moved, not rebuilt, as the filters change: a
   keystroke must not reload every preview. */
const cards = new Map();
function renderShelf() {
  const grid = $("#grid");
  const hits = sorted(state.all.filter(matches));
  grid.replaceChildren(...hits.map((e) => cards.get(e.id)));
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
  const hash = $("#seal-sha");
  $("#seal-sha-real").textContent = e.sha256;
  if (calm.matches) { hash.textContent = e.sha256; seal.classList.add("sealed"); return; }
  /* The one moment on the page: the hash settles, left to right, into the
     value the app will check the files against. */
  const hex = "0123456789abcdef";
  let i = 0;
  const tick = () => {
    i = Math.min(64, i + 2);
    let s = e.sha256.slice(0, i);
    for (let k = i; k < 64; k++) s += hex[(Math.random() * 16) | 0];
    hash.textContent = s;
    if (i < 64) setTimeout(tick, 22);
    else seal.classList.add("sealed");
  };
  hash.textContent = "0".repeat(64);
  /* Played when the seal is on screen: on a phone it sits below the fold,
     and a moment nobody sees is not a moment. */
  if (!("IntersectionObserver" in window)) { setTimeout(tick, 380); return; }
  new IntersectionObserver(([x], o) => {
    if (x.isIntersecting) { o.disconnect(); setTimeout(tick, 200); }
  }, { threshold: 0.6 }).observe(seal);
}

/* ── routing ──────────────────────────────────────────────────── */
let lastCard = "";
let wantSearch = false;
function route() {
  const m = location.hash.match(/^#\/plugin\/(.+)$/);
  const home = $("#home");
  const view = $("#view");
  if (m) {
    let id = "";
    try { id = decodeURIComponent(m[1]); } catch { /* a malformed hash is no plugin */ }
    const e = state.all.find((x) => x.id === id);
    view.textContent = "";
    if (e) {
      view.append(detail(document, e));
      fillLicences(view, [e]);
      document.title = `${e.title} · agentglass plugins`;
    } else {
      const box = el(document, "div", "missing");
      box.append(el(document, "h1", null, "No such plugin"), el(document, "p", null, state.all.length ? "It is not in the catalogue, or it was taken out." : "The catalogue did not load."));
      const back = el(document, "a", "btn", "All plugins");
      back.href = "#/";
      box.append(back);
      view.append(box);
      document.title = "Not found · agentglass plugins";
    }
    home.hidden = true;
    view.hidden = false;
    lastCard = id;
    window.scrollTo({ top: 0, behavior: "instant" });
    const h = view.querySelector("h1");
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    return;
  }
  document.title = "agentglass plugins";
  if (!home.hidden) return;
  view.hidden = true;
  view.textContent = "";
  home.hidden = false;
  /* Back from a plugin: to its card on the shelf, and the keyboard with it.
     The way back is "#/", which names no element: a fragment such as
     "#browse" makes Chrome scroll to it once the shelf is laid out again,
     and that scroll takes the focus back off the card. */
  /* Only a way back returns to the card: a link to another part of the page
     (the header, "List yours") goes where it says. */
  const back = location.hash === "" || location.hash === "#/";
  const target = back && lastCard ? [...document.querySelectorAll(".card")].find((c) => c.dataset.id === lastCard) : null;
  lastCard = "";
  if (wantSearch) {
    wantSearch = false;
    $("#browse").scrollIntoView({ behavior: "instant" });
    q.focus({ preventScroll: true });
  } else if (target) {
    /* Twice: the browser's own Back restores the old scroll position after
       this event, and on the way resets the focus to the page. */
    const restore = () => {
      target.scrollIntoView({ block: "center", behavior: "instant" });
      target.querySelector(".card-link").focus({ preventScroll: true });
    };
    restore();
    setTimeout(restore, 0);
  } else {
    const anchor = location.hash.length > 2 ? document.getElementById(location.hash.slice(1)) : null;
    (anchor || $("#browse")).scrollIntoView({ behavior: "instant" });
  }
}
window.addEventListener("hashchange", route);

/* ── controls ─────────────────────────────────────────────────── */
const q = $("#q");
q.addEventListener("input", () => { state.q = q.value; renderShelf(); });
q.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && q.value) { q.value = ""; state.q = ""; renderShelf(); ev.stopPropagation(); }
});
$("#scope").addEventListener("change", (ev) => { state.scope = ev.target.value; renderShelf(); });
$("#sort").addEventListener("change", (ev) => { state.sort = ev.target.value; renderShelf(); });
$("#cats").addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.dataset.more) { state.showAllCats = !state.showAllCats; renderChips(); $("#cats [data-more]").focus(); return; }
  state.cat = b.dataset.cat === state.cat ? "" : b.dataset.cat;
  renderShelf();
  const again = [...document.querySelectorAll("#cats .chip")].find((c) => c.dataset.cat === b.dataset.cat);
  if (again) again.focus();
});
$("#clear").addEventListener("click", () => {
  state.q = ""; state.cat = ""; state.scope = "";
  q.value = ""; $("#scope").value = "";
  renderShelf();
  q.focus();
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
      : pinned === n ? `All ${n} ${n === 1 ? "listing is" : "listings are"} pinned to a commit and a content hash.`
      : `${pinned} of ${n} listings are pinned to a commit and a content hash.`;
    cards.clear();
    for (const e of state.all) cards.set(e.id, card(document, e, "#/plugin/" + encodeURIComponent(e.id)));
    for (const c of cards.values()) fillLicences(c, state.all);
    renderShelf();
    renderSeal();
  } catch (err) {
    fail(`The catalogue did not load: ${err && err.message ? err.message : "unknown error"}.`);
  } finally {
    $("#grid").removeAttribute("aria-busy");
  }
  route();
}
$("#retry").addEventListener("click", load);
load();

