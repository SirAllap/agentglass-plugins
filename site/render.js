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

const str = (v, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");

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
    added: /^\d{4}-\d{2}-\d{2}$/.test(str(p.added, 10)) ? p.added : "",
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
  if (body && !/[.!?…)"'”’`:]$/.test(body)) body += "…";
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

/** The plugin's mark, for an entry with no picture. */
function mark(doc, e) {
  const m = el(doc, "div", "mark");
  m.append(icon(doc, "piece", "mark-ic"));
  const initials = el(doc, "span", "mark-id", e.id);
  m.append(initials);
  return m;
}

/** The picture at the pinned commit, or the mark when there is none. */
export function shot(doc, e, cls, loading = "lazy") {
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

export function verifiedBadge(doc) {
  const b = el(doc, "span", "badge ok");
  b.append(icon(doc, "check", "ic-s"), doc.createTextNode("Verified"));
  b.title = "Written by the agentglass project";
  return b;
}

export function pin(doc, e) {
  const b = el(doc, "span", "pin");
  b.append(icon(doc, "pin", "ic-s"), el(doc, "code", null, shortRef(e) || "unpinned"));
  b.title = e.ref ? `Pinned to commit ${e.ref}` : "This entry names no commit";
  return b;
}

/**
 * One card on the shelf. The title is the one link, stretched over the card,
 * so a keyboard meets each plugin once and a screen reader reads its name.
 */
export function card(doc, e, href) {
  const c = el(doc, "article", "card");
  c.dataset.id = e.id;
  c.append(shot(doc, e, "card-shot"));
  const body = el(doc, "div", "card-body");
  const h = el(doc, "h3", "card-title");
  const a = el(doc, "a", "card-link", e.title);
  a.href = href;
  h.append(a);
  const by = el(doc, "p", "card-by");
  by.append(doc.createTextNode(e.publisher ? `by ${e.publisher}` : "no publisher named"));
  if (e.verified) by.append(verifiedBadge(doc));
  const desc = el(doc, "p", "card-desc", e.description.replaceAll("`", ""));
  const meta = el(doc, "dl", "card-meta");
  const fact = (k, v) => { const d = el(doc, "div"); d.append(el(doc, "dt", null, k)); const dd = el(doc, "dd"); dd.append(v); d.append(dd); meta.append(d); };
  if (e.scope) fact("Scope", el(doc, "span", "scope " + SCOPE[e.scope].tone, SCOPE[e.scope].label));
  fact("Commit", pin(doc, e));
  const lic = el(doc, "span", "lic", e.repo ? "…" : "unknown");
  lic.dataset.licence = e.id;
  fact("Licence", lic);
  const foot = el(doc, "div", "card-foot");
  if (e.repo) {
    const src = outLink(doc, treeUrl(e), "Source at this commit", "card-src");
    src.append(icon(doc, "out", "ic-s"));
    foot.append(src);
  }
  if (e.added) foot.append(el(doc, "span", "card-added", `Listed ${e.added}`));
  body.append(h, by, desc, meta, foot);
  c.append(body);
  return c;
}

/** One row of the specification on a plugin's own page. */
function fact(doc, dl, key, value, mono) {
  const row = el(doc, "div", "fact");
  row.append(el(doc, "dt", null, key));
  const dd = el(doc, "dd", mono ? "mono" : null);
  if (typeof value === "string") dd.textContent = value; else dd.append(value);
  row.append(dd);
  dl.append(row);
  return dd;
}

/** A value with a button that copies it. */
export function copyable(doc, value, label) {
  const w = el(doc, "span", "copyable");
  w.append(el(doc, "code", null, value));
  const b = el(doc, "button", "copy");
  b.type = "button";
  b.dataset.copy = value;
  b.setAttribute("aria-label", `Copy ${label}`);
  b.append(icon(doc, "copy", "ic-s ic-copy"), icon(doc, "check", "ic-s ic-ok"));
  w.append(b);
  return w;
}

/**
 * A plugin's own page: what it is, what it may do, what exactly is listed,
 * and how to install that exact thing from the app.
 */
export function detail(doc, e) {
  const root = el(doc, "article", "detail");
  const crumb = el(doc, "a", "crumb");
  crumb.href = "#/";
  crumb.append(icon(doc, "back", "ic-s"), doc.createTextNode("All plugins"));
  root.append(crumb);

  const head = el(doc, "header", "detail-head");
  const h1 = el(doc, "h1", "detail-title", e.title);
  h1.tabIndex = -1;
  h1.id = "detail-title";
  const by = el(doc, "p", "detail-by");
  by.append(doc.createTextNode(e.publisher ? `by ${e.publisher}` : "no publisher named"));
  if (e.verified) by.append(verifiedBadge(doc));
  head.append(h1, by);
  const tags = el(doc, "ul", "detail-tags");
  tags.setAttribute("aria-label", "Categories");
  for (const c of e.categories) tags.append(el(doc, "li", null, c));
  if (e.categories.length) head.append(tags);
  root.append(head);

  const grid = el(doc, "div", "detail-grid");
  const main = el(doc, "div", "detail-main");
  main.append(shot(doc, e, "detail-shot", "eager"));
  main.append(prose(doc, e.description, "detail-desc"));

  if (e.draws.length) {
    const sec = el(doc, "section", "draws");
    sec.append(el(doc, "h2", null, "Where it draws"));
    const ul = el(doc, "ul");
    for (const d of e.draws) {
      const li = el(doc, "li");
      li.append(el(doc, "b", null, DRAWS[d][0]), el(doc, "span", null, DRAWS[d][1]));
      ul.append(li);
    }
    sec.append(ul);
    main.append(sec);
  }

  const inst = el(doc, "section", "install");
  inst.id = "install";
  inst.append(el(doc, "h2", null, "Install it from the app"));
  const ol = el(doc, "ol", "steps");
  const step = (...nodes) => { const li = el(doc, "li"); li.append(...nodes); ol.append(li); };
  step(el(doc, "b", null, "Open agentglass."), doc.createTextNode(" Go to Settings, then Plugins."));
  const s2 = el(doc, "span");
  s2.append(doc.createTextNode(" Search the market for "), el(doc, "q", null, e.title), doc.createTextNode(" and press Install."));
  step(el(doc, "b", null, "Find it in the market."), s2);
  step(el(doc, "b", null, "Read what it asks for."), doc.createTextNode(` The app shows its scope and where it draws. Nothing runs until you approve it and switch it on.`));
  inst.append(ol);
  const why = el(doc, "p", "install-why");
  if (e.ref && e.sha256) {
    why.append(doc.createTextNode("The market installs commit "), el(doc, "code", null, shortRef(e)),
      doc.createTextNode(" and refuses the install if its files hash to anything but "), el(doc, "code", null, e.sha256.slice(0, 12) + "…"),
      doc.createTextNode(". Installing from the repository URL instead gets whatever the repository holds today, not the commit listed here."));
  } else {
    why.append(doc.createTextNode("This entry names no pinned commit, so the app has nothing to check the files against. Read the source before you install it."));
  }
  inst.append(why);
  main.append(inst);

  const side = el(doc, "aside", "detail-side");
  side.setAttribute("aria-label", "What is listed");
  const dl = el(doc, "dl", "spec");
  if (e.scope) fact(doc, dl, "Scope", el(doc, "span", "scope " + SCOPE[e.scope].tone, SCOPE[e.scope].label));
  fact(doc, dl, "Publisher", e.publisher || "not named");
  if (e.repo) fact(doc, dl, "Repository", outLink(doc, repoUrl(e), `${e.repo.owner}/${e.repo.name}`));
  fact(doc, dl, "Commit", e.ref ? copyable(doc, e.ref, "commit") : "not pinned", true);
  fact(doc, dl, "Content hash", e.sha256 ? copyable(doc, e.sha256, "content hash") : "none", true);
  const lic = fact(doc, dl, "Licence", e.repo ? "…" : "unknown");
  lic.dataset.licence = e.id;
  if (e.added) fact(doc, dl, "Listed", e.added, true);
  side.append(dl);
  if (e.repo) {
    const src = outLink(doc, treeUrl(e), "Read the source at this commit", "btn primary");
    src.append(icon(doc, "out", "ic-s"));
    side.append(src);
  }
  const note = el(doc, "div", "note small");
  note.append(icon(doc, "eye", "ic-s"));
  const np = el(doc, "p");
  np.append(el(doc, "b", null, "Listing is not auditing."), doc.createTextNode(" This plugin passed the checks a machine can run. It still runs as a process on your machine. Read the code."));
  note.append(np);
  side.append(note);

  grid.append(main, side);
  root.append(grid);
  return root;
}
