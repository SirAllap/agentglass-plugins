/*
 * Everything the page draws from plugins.json, and the only file that turns a
 * catalogue entry into elements.
 *
 * The catalogue is a file strangers send pull requests to, so every field in
 * it is text: it reaches the page through `textContent` and nothing else.
 * There is no innerHTML, no template string of markup, no attribute set from
 * an entry except the few URLs below, and each of those is rebuilt from parts
 * this file checked rather than passed through as the entry wrote it.
 *
 * The functions take the document as an argument, so the tests can hand them
 * one that refuses markup outright (test/render.test.mjs).
 */

export const SVG_NS = "http://www.w3.org/2000/svg";

/** What a scope lets a plugin do, in the words the app's approval box uses. */
export const SCOPE = {
  read: { label: "Reads only", tone: "ok" },
  answer: { label: "Can answer chats", tone: "warn" },
  full: { label: "Full access", tone: "warn" },
};

/** Where a plugin draws: a short word for the card, a sentence for its page. */
export const DRAWS = {
  panel: ["Panel", "Its own panel in the Plugins view, drawn with agentglass's parts."],
  settings: ["Settings", "A page of fields in Settings, filled in by you."],
  "pr-notes": ["Notes in pull requests", "Notes inside a pull request, shown in agentglass only and never sent to GitHub."],
  "pr-button": ["Pull request button", "A button in the header of every pull request."],
};

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const GITHUB_REPO = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/;
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

/* Cut to length, then made well formed: a cut through an emoji leaves half a
   surrogate pair, which encodeURIComponent refuses. */
const wellFormed = (s) => (typeof s.toWellFormed === "function" ? s.toWellFormed() : s.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "�"));
const str = (v, max = 4000) => (typeof v === "string" ? wellFormed(v.slice(0, max)) : "");

/**
 * The parts of an entry the page trusts, checked once.
 *
 * `repo` is set only for a GitHub repository pinned to a full commit: that is
 * the one shape where the page can name the commit's files itself, so it is
 * the one shape that gets a preview, a licence and a link to the tree.
 */
export function readEntry(p) {
  if (!p || typeof p !== "object") return null;
  const id = str(p.id, 200);
  if (!id) return null;
  const src = p.source && typeof p.source === "object" ? p.source : {};
  const url = str(src.url, 500);
  const ref = str(src.ref, 64).toLowerCase();
  const m = url.match(GITHUB_REPO);
  const repo = m && HEX40.test(ref) && m[2] !== "." && m[2] !== ".." ? { owner: m[1], name: m[2], ref } : null;
  const sha = str(p.sha256, 64).toLowerCase();
  return {
    id,
    title: str(p.title, 200) || id,
    publisher: str(p.publisher, 200),
    verified: p.verified === true,
    scope: Object.hasOwn(SCOPE, p.scope) ? p.scope : null,
    draws: Array.isArray(p.draws) ? [...new Set(p.draws.filter((d) => typeof d === "string" && Object.hasOwn(DRAWS, d)))] : [],
    categories: Array.isArray(p.categories) ? [...new Set(p.categories.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim().toLowerCase().slice(0, 40)))] : [],
    description: str(p.description, 4000).trim(),
    added: typeof p.added === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.added) ? p.added : "",
    ref: HEX40.test(ref) ? ref : "",
    sha256: HEX64.test(sha) ? sha : "",
    repo,
    preview: previewUrl(p.preview, repo),
  };
}

/**
 * The preview, only when it is a file of this repository at this commit on
 * raw.githubusercontent.com. Anything else — another host, another commit, a
 * branch name that can move, a query string — draws the plugin's mark instead.
 */
export function previewUrl(raw, repo) {
  if (!repo || typeof raw !== "string") return "";
  let u;
  try { u = new URL(raw); } catch { return ""; }
  if (u.protocol !== "https:" || u.hostname !== "raw.githubusercontent.com" || u.port || u.username || u.password) return "";
  if (u.search || u.hash) return "";
  const parts = u.pathname.split("/").slice(1);
  if (parts.length < 4) return "";
  const [owner, name, ref, ...file] = parts;
  if (owner.toLowerCase() !== repo.owner.toLowerCase() || name.toLowerCase() !== repo.name.toLowerCase() || ref !== repo.ref) return "";
  if (file.some((f) => !f || f === "." || f === "..") || !IMAGE.test(file[file.length - 1])) return "";
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repo.ref}/${file.map(encodeURIComponent).join("/")}`;
}

/** The tree at the pinned commit, on GitHub. */
export const treeUrl = (e) => (e.repo ? `https://github.com/${e.repo.owner}/${e.repo.name}/tree/${e.repo.ref}` : "");
/** A file at the pinned commit, as GitHub shows it. */
export const blobUrl = (e, file) => (e.repo ? `https://github.com/${e.repo.owner}/${e.repo.name}/blob/${e.repo.ref}/${file}` : "");
/** A file at the pinned commit, as bytes. */
export const rawUrl = (e, file) => (e.repo ? `https://raw.githubusercontent.com/${e.repo.owner}/${e.repo.name}/${e.repo.ref}/${file}` : "");
/** The repository itself, for "install from its URL". */
export const repoUrl = (e) => (e.repo ? `https://github.com/${e.repo.owner}/${e.repo.name}` : "");
export const shortRef = (e) => (e.ref ? e.ref.slice(0, 7) : "");

/**
 * The licence, named from the first lines of the LICENSE file at the pinned
 * commit. A text nobody recognises is shown as what it is, not guessed at.
 */
export function licenceName(text) {
  const t = str(text, 3000);
  if (!t.trim()) return "";
  const head = t.slice(0, 1200);
  const rules = [
    [/^\s*MIT License/i, "MIT"],
    [/Permission is hereby granted, free of charge/i, "MIT"],
    [/Apache License[\s\S]{0,40}Version 2\.0/i, "Apache-2.0"],
    [/GNU AFFERO GENERAL PUBLIC LICENSE[\s\S]{0,40}Version 3/i, "AGPL-3.0"],
    [/GNU LESSER GENERAL PUBLIC LICENSE/i, "LGPL"],
    [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,40}Version 3/i, "GPL-3.0"],
    [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,40}Version 2/i, "GPL-2.0"],
    [/Mozilla Public License[\s\S]{0,20}(Version )?2\.0/i, "MPL-2.0"],
    [/^\s*ISC License/i, "ISC"],
    [/BSD 3-Clause/i, "BSD-3-Clause"],
    [/BSD 2-Clause/i, "BSD-2-Clause"],
    [/This is free and unencumbered software/i, "Unlicense"],
  ];
  for (const [re, name] of rules) if (re.test(head)) return name;
  return "Other";
}

/* ── element helpers ──────────────────────────────────────────── */

/** An element with a class and, optionally, text. Never markup. */
export function el(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text != null && text !== "") e.textContent = String(text);
  return e;
}

/** An icon from the sprite in index.html. The id is always one of ours. */
export function icon(doc, id, cls = "ic") {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = doc.createElementNS(SVG_NS, "use");
  use.setAttribute("href", "#i-" + id);
  svg.append(use);
  return svg;
}

/** A link out, to an https URL this file built. */
export function outLink(doc, href, text, cls) {
  const a = el(doc, "a", cls, text);
  a.href = href;
  a.rel = "noopener noreferrer";
  return a;
}

/**
 * A description as paragraphs, with `backticks` as code. Split into text
 * nodes, so a `<script>` in it is a word in a sentence. A description the
 * catalogue cut short ends in an ellipsis rather than mid-word.
 */
export function prose(doc, text, cls) {
  const box = el(doc, "div", cls);
  let body = str(text, 4000).trim();
  /* A description cut short ends on its last whole sentence when that keeps
     most of it, and on an ellipsis otherwise, never mid-word. */
  if (body && !/[.!?…)"'”’`:]$/.test(body)) {
    const whole = body.match(/^[\s\S]*[.!?…](?=\s)/);
    body = whole && whole[0].length >= body.length * 0.6 ? whole[0] : body + "…";
  }
  for (const para of body.split(/\n\s*\n/)) {
    if (!para.trim()) continue;
    const p = el(doc, "p");
    para.trim().split("`").forEach((bit, i) => {
      if (!bit) return;
      p.append(i % 2 ? el(doc, "code", null, bit) : doc.createTextNode(bit));
    });
    box.append(p);
  }
  return box;
}


/* ── the landing's plugin parts (pl-*), drawn from an entry ───────
   The class names are the landing's, so its CSS (landing.css) draws them. */

/** The scope as the landing's tag and badge classes name its tone. */
const tone = (e) => (SCOPE[e.scope].tone === "ok" ? "s" : "w");

/**
 * The picture for an entry with none: its manifest, in the landing's window,
 * showing what the app shows before an install. Every value is the entry's
 * checked text.
 */
function mark(doc, e) {
  const m = el(doc, "div", "pl-manifest");
  const bar = el(doc, "div", "wbar");
  bar.append(el(doc, "s"), el(doc, "s"), el(doc, "s"), el(doc, "span", "seal-file", "plugin.json"));
  const code = el(doc, "code");
  const line = (k, v, cls = "v") => {
    const l = el(doc, "span", "l");
    l.append(el(doc, "span", "k", `"${k}"`), doc.createTextNode(": "), el(doc, "span", cls, v));
    code.append(l);
  };
  line("id", `"${e.id}"`);
  if (e.scope) line("scope", `"${e.scope}"`, "v " + tone(e));
  if (e.draws.length) line("draws", "[" + e.draws.map((d) => `"${d}"`).join(", ") + "]");
  line("ref", e.ref ? `"${shortRef(e)}…"` : "none");
  m.append(bar, code);
  return m;
}

/** The picture at the pinned commit, or the mark when there is none. */
export function shot(doc, e, cls = "pl-shot", loading = "lazy") {
  const box = el(doc, "div", cls);
  if (e.preview) {
    const img = doc.createElement("img");
    img.alt = `Screenshot of ${e.title}`;
    img.loading = loading;
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = e.preview;
    img.addEventListener("error", () => { img.remove(); box.append(mark(doc, e)); }, { once: true });
    box.append(img);
  } else box.append(mark(doc, e));
  return box;
}

/** The "by" line: the publisher as the catalogue names it, and the badge
    only for the literal `true`. */
function byline(doc, e, cls) {
  const by = el(doc, "p", cls);
  by.append(doc.createTextNode(e.publisher ? `by ${e.publisher}` : "no publisher named"));
  if (e.verified) {
    const ok = el(doc, "span", "pl-ok", " · verified");
    ok.title = "Written by the agentglass project";
    by.append(ok);
  }
  return by;
}

/**
 * One card on the shelf. The title is the one link, stretched over the card,
 * so a keyboard meets each plugin once and a screen reader reads its name.
 */
export function card(doc, e, href) {
  const c = el(doc, "article", "pl-card");
  c.dataset.id = e.id;
  c.append(shot(doc, e));
  const top = el(doc, "div", "pl-top");
  const ic = el(doc, "div", "pl-ic");
  ic.append(icon(doc, "piece"));
  const who = el(doc, "div");
  const h = el(doc, "h3");
  const a = el(doc, "a", "pl-name", e.title);
  a.href = href;
  h.append(a);
  who.append(h, byline(doc, e, "pl-by"));
  top.append(ic, who);
  c.append(top, el(doc, "p", "pl-desc", e.description.replaceAll("`", "")));

  const tags = el(doc, "div", "pl-tags");
  if (e.scope) tags.append(el(doc, "span", "pl-tag " + tone(e), SCOPE[e.scope].label.toLowerCase()));
  for (const d of e.draws.slice(0, 3)) tags.append(el(doc, "span", "pl-tag d", DRAWS[d][0].toLowerCase()));
  if (e.draws.length > 3) tags.append(el(doc, "span", "pl-tag d", `+${e.draws.length - 3} more`));
  if (tags.childNodes.length) c.append(tags);

  /* Where the landing's card has its install box, the market shows what an
     install gets: the commit and the start of the hash it must match. */
  const inst = el(doc, "div", "pl-inst");
  inst.append(icon(doc, e.ref ? "pin" : "eye", "ic-s"));
  const code = el(doc, "code");
  if (e.ref) {
    code.append(el(doc, "b", null, shortRef(e)));
    if (e.sha256) code.append(doc.createTextNode(`  sha256 ${e.sha256.slice(0, 12)}…`));
    inst.title = `Pinned to commit ${e.ref}`;
  } else code.textContent = "not pinned to a commit";
  const lic = el(doc, "span", "lic", e.repo ? "…" : "");
  lic.dataset.licence = e.id;
  inst.append(code, lic);
  c.append(inst);

  const links = el(doc, "div", "pl-links");
  if (e.repo) {
    const src = outLink(doc, treeUrl(e), "Source at this commit");
    src.append(icon(doc, "out", "ic-s"));
    links.append(src);
  }
  if (e.added) links.append(el(doc, "span", null, `listed ${e.added}`));
  if (links.childNodes.length) c.append(links);
  return c;
}

/** One row of the specification on a plugin's own page. */
function fact(doc, dl, key, value) {
  const row = el(doc, "div", "pl-fact");
  row.append(el(doc, "dt", null, key));
  const dd = el(doc, "dd");
  if (typeof value === "string") dd.textContent = value; else dd.append(value);
  row.append(dd);
  dl.append(row);
  return dd;
}

/** A value with a button that copies it. */
export function copyable(doc, value, label) {
  const w = el(doc, "span", "copyable");
  /* The value is read once, from a hidden copy: the shown one may be settling
     into place (app.js) when a screen reader reaches it. */
  const shown = el(doc, "code", null, value);
  shown.setAttribute("aria-hidden", "true");
  w.append(el(doc, "span", "vh", value), shown);
  const b = el(doc, "button", "copy");
  b.type = "button";
  b.dataset.copy = value;
  b.setAttribute("aria-label", `Copy ${label}`);
  b.append(icon(doc, "copy", "ic-s ic-copy"), icon(doc, "check", "ic-s ic-ok"));
  w.append(b);
  return w;
}

/**
 * A plugin's own page, in the landing's product-page parts: what it is, what
 * it may do, exactly what is listed, and how to install that exact thing.
 */
export function detail(doc, e) {
  const root = el(doc, "article", "pl-one");
  root.dataset.id = e.id;
  const crumb = el(doc, "nav", "pl-crumb");
  crumb.setAttribute("aria-label", "Breadcrumb");
  const back = el(doc, "a", null, "Plugins");
  back.href = "#/";
  back.prepend(icon(doc, "back", "ic-s"));
  crumb.append(back, el(doc, "span", null, "/"), el(doc, "span", null, e.title));
  root.append(crumb);

  const hero = el(doc, "div", "pl-hero");
  const pitch = el(doc, "div");
  const top = el(doc, "div", "pl-one-top");
  const ic = el(doc, "div", "pl-one-ic");
  ic.append(icon(doc, "piece"));
  const who = el(doc, "div");
  const h1 = el(doc, "h1", null, e.title);
  h1.id = "detail-title";
  h1.tabIndex = -1;
  const sub = byline(doc, e, "pl-one-sub");
  sub.prepend(doc.createTextNode(`${e.id}  ·  `));
  who.append(h1, sub);
  top.append(ic, who);
  pitch.append(top);

  const badges = el(doc, "div", "pl-badges");
  if (e.scope) badges.append(el(doc, "span", "pl-badge " + tone(e), SCOPE[e.scope].label.toLowerCase()));
  if (e.draws.length) badges.append(el(doc, "span", "pl-badge", `draws in ${e.draws.length} ${e.draws.length === 1 ? "place" : "places"}`));
  if (e.ref && e.sha256) badges.append(el(doc, "span", "pl-badge s", `pinned ${shortRef(e)}`));
  if (e.verified) badges.append(el(doc, "span", "pl-badge s", "verified"));
  if (badges.childNodes.length) pitch.append(badges);
  pitch.append(prose(doc, e.description, "pl-lead"));

  const cta = el(doc, "div", "pl-cta");
  /* An anchor within this page: app.js scrolls to it without leaving the
     plugin's route. */
  const go = el(doc, "a", "pl-big", "How to install ↓");
  go.href = "#install";
  cta.append(go);
  if (e.repo) {
    const src = outLink(doc, treeUrl(e), "Read the source at this commit", "pl-ghost");
    src.append(icon(doc, "out", "ic-s"));
    cta.append(src);
  }
  pitch.append(cta);
  const hint = el(doc, "p", "pl-hint");
  if (e.ref && e.sha256) {
    hint.append(doc.createTextNode("The market installs commit "), el(doc, "code", null, shortRef(e)),
      doc.createTextNode(" and refuses the install if its files hash to anything but "), el(doc, "code", null, e.sha256.slice(0, 12) + "…"),
      doc.createTextNode(". Installing from the repository URL instead gets whatever the repository holds today, not the commit listed here."));
  } else {
    hint.append(doc.createTextNode("This entry names no pinned commit, so the app has nothing to check the files against. Read the source before you install it."));
  }
  pitch.append(hint);

  const side = el(doc, "div");
  const dl = el(doc, "dl", "pl-spec");
  dl.setAttribute("aria-label", "What is listed");
  fact(doc, dl, "Publisher", e.publisher || "not named");
  if (e.scope) fact(doc, dl, "Scope", SCOPE[e.scope].label.toLowerCase());
  fact(doc, dl, "Draws", e.draws.length ? `${e.draws.length} ${e.draws.length === 1 ? "place" : "places"}` : "nowhere named");
  if (e.repo) fact(doc, dl, "Source", outLink(doc, repoUrl(e), `${e.repo.owner}/${e.repo.name}`));
  fact(doc, dl, "Commit", e.ref ? copyable(doc, e.ref, "commit") : "not pinned");
  fact(doc, dl, "sha256", e.sha256 ? copyable(doc, e.sha256, "content hash") : "none");
  const lic = fact(doc, dl, "Licence", e.repo ? "…" : "unknown");
  lic.dataset.licence = e.id;
  if (e.added) fact(doc, dl, "Listed", e.added);
  if (e.categories.length) fact(doc, dl, "Tags", e.categories.join(", "));
  side.append(dl);
  hero.append(pitch, side);
  root.append(hero);

  if (e.preview) {
    const stage = el(doc, "button", "pl-stage");
    stage.type = "button";
    stage.dataset.zoom = e.preview;
    stage.setAttribute("aria-label", `Enlarge the screenshot of ${e.title}`);
    const img = doc.createElement("img");
    img.src = e.preview;
    img.alt = `${e.title}, running in agentglass`;
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => stage.remove(), { once: true });
    const zoom = el(doc, "span", "pl-zoom");
    zoom.append(icon(doc, "zoom", "ic-s"), el(doc, "span", null, "Enlarge"));
    stage.append(img, zoom);
    root.append(stage);
  } else {
    /* No screenshot: the manifest the card showed, full size. */
    const stage = el(doc, "div", "pl-stage pl-stage-manifest");
    stage.append(mark(doc, e));
    root.append(stage);
  }

  const close = el(doc, "div", "pl-close");
  if (e.draws.length) {
    const sec = el(doc, "section", "pl-sec");
    sec.append(el(doc, "h2", "pl-sec-h", "Where it draws"));
    const ul = el(doc, "ul", "pl-draws");
    e.draws.forEach((d, i) => {
      const li = el(doc, "li");
      const body = el(doc, "div");
      body.append(el(doc, "b", null, DRAWS[d][0]), el(doc, "span", null, DRAWS[d][1]));
      li.append(el(doc, "span", "n", String(i + 1)), body);
      ul.append(li);
    });
    sec.append(ul);
    close.append(sec);
  }
  const note = el(doc, "aside", "pl-sec pl-aside");
  note.append(el(doc, "h2", "pl-sec-h", "Listing is not auditing"));
  note.append(el(doc, "p", "pl-hint", "The repository is public, its manifest is one agentglass accepts, and it has a README and a licence. A check read its source for a short list of patterns and never ran it. That is what a machine can tell. It still runs as a process on your machine, and it still asks you to approve its scope. Read the code."));
  close.append(note);
  root.append(close);

  const inst = el(doc, "section", "pl-sec install");
  inst.id = "install";
  const ih = el(doc, "h2", "pl-sec-h", "Install it from the app");
  ih.tabIndex = -1;
  inst.append(ih);
  const steps = el(doc, "div", "steps");
  const step = (title, ...rest) => {
    const box = el(doc, "div");
    const inner = el(doc, "div");
    const text = el(doc, "span");
    text.append(...rest);
    inner.append(el(doc, "b", null, title), text);
    box.append(inner);
    steps.append(box);
  };
  step("Open agentglass.", doc.createTextNode("Go to Settings, then Plugins."));
  step("Find it in the market.", doc.createTextNode("Search the market for "), el(doc, "q", null, e.title), doc.createTextNode(" and press Install."));
  step("Read what it asks for.", doc.createTextNode("The app shows its scope and where it draws. Nothing runs until you approve it and switch it on."));
  inst.append(steps);
  root.append(inst);
  return root;
}
