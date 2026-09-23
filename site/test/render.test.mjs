/*
 * The page draws catalogue entries as text and never as markup.
 *
 * render.js is handed a document that cannot parse markup at all: every
 * HTML sink throws. Hostile entries are rendered through it, and the tree
 * that comes out is walked: no element the page did not choose, no event
 * handler, no URL the page did not build, and each payload present, whole,
 * as text.
 *
 *   node --test site/test/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readEntry, previewUrl, licenceName, card, detail, prose } from "../render.js";
import { hostile, PAYLOADS, REF, SHA } from "./fixtures.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/* ── a document with no parser ───────────────────────────────── */
const MARKUP_SINKS = ["innerHTML", "outerHTML"];
class Text {
  constructor(data) { this.nodeType = 3; this.data = String(data); }
  get textContent() { return this.data; }
}
class Element {
  constructor(tag, ns) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.namespaceURI = ns || "http://www.w3.org/1999/xhtml";
    this.childNodes = [];
    this.attrs = new Map();
    this.dataset = {};
    this.listeners = [];
    this.className = "";
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v) { this.childNodes = v === "" || v == null ? [] : [new Text(v)]; }
  append(...nodes) {
    for (const n of nodes) {
      if (typeof n === "string") this.childNodes.push(new Text(n));
      else { assert.ok(n instanceof Element || n instanceof Text, "only nodes are appended"); this.childNodes.push(n); }
    }
  }
  prepend(...nodes) {
    const kept = this.childNodes;
    this.childNodes = [];
    this.append(...nodes);
    this.childNodes.push(...kept);
  }
  setAttribute(k, v) { this.attrs.set(String(k).toLowerCase(), String(v)); }
  getAttribute(k) { return this.attrs.get(String(k).toLowerCase()) ?? null; }
  addEventListener(type, fn) { this.listeners.push(type); }
  remove() {}
  insertAdjacentHTML() { throw new Error("insertAdjacentHTML is a markup sink"); }
}
for (const sink of MARKUP_SINKS) {
  Object.defineProperty(Element.prototype, sink, {
    get() { return ""; },
    set() { throw new Error(`${sink} is a markup sink`); },
  });
}
const doc = {
  createElement: (t) => new Element(t),
  createElementNS: (ns, t) => new Element(t, ns),
  createTextNode: (s) => new Text(s),
  write() { throw new Error("document.write is a markup sink"); },
};

function* walk(n) {
  yield n;
  if (n.childNodes) for (const c of n.childNodes) yield* walk(c);
}
/* The only elements render.js ever makes. */
const ALLOWED = new Set(["ARTICLE", "DIV", "SPAN", "P", "H1", "H2", "H3", "A", "IMG", "DL", "DT", "DD", "UL", "OL", "LI", "B", "S", "CODE", "Q", "BUTTON", "HEADER", "NAV", "SECTION", "ASIDE", "SVG", "USE"]);
const URL_PROPS = ["href", "src"];

function assertInert(root) {
  const texts = [];
  for (const n of walk(root)) {
    if (n.nodeType === 3) { texts.push(n.data); continue; }
    assert.ok(ALLOWED.has(n.tagName), `unexpected element <${n.tagName}>`);
    for (const k of n.attrs.keys()) assert.ok(!k.startsWith("on"), `event handler attribute ${k}`);
    for (const k of Object.keys(n)) assert.ok(!/^on/i.test(k), `event handler property ${k}`);
    for (const p of URL_PROPS) {
      const v = n[p];
      if (v == null) continue;
      assert.match(v, /^(#|https:\/\/github\.com\/acme\/|https:\/\/raw\.githubusercontent\.com\/acme\/)/, `${p} ${v} is not a URL the page built`);
    }
    const use = n.getAttribute("href");
    if (use != null) assert.match(use, /^#i-[a-z]+$/, "only sprite icons are referenced by attribute");
  }
  return texts.join("\u0000");
}

/* ── the hostile catalogue ──────────────────────────────────── */
test("a hostile entry becomes text on its card", () => {
  const e = readEntry(hostile[0]);
  const text = assertInert(card(doc, e, "#/plugin/" + encodeURIComponent(e.id)));
  assert.ok(text.includes(PAYLOADS.title), "the title is shown verbatim");
  assert.ok(text.includes(PAYLOADS.publisher), "the publisher is shown verbatim");
  assert.ok(text.includes("<script>fetch('/beacon?description')</script>"), "the description is shown verbatim");
});

test("a hostile entry becomes text on its own page", () => {
  const e = readEntry(hostile[0]);
  const text = assertInert(detail(doc, e));
  assert.ok(text.includes(PAYLOADS.title));
  assert.ok(text.includes(PAYLOADS.category.toLowerCase().slice(0, 40)), "a category is shown, as text");
  assert.ok(text.includes("<iframe src=/beacon?code>"), "a code span is text too");
});

test("every hostile entry renders inert, card and page", () => {
  for (const raw of hostile) {
    const e = readEntry(raw);
    assert.ok(e, `entry ${raw.id} is read`);
    assertInert(card(doc, e, "#/plugin/" + encodeURIComponent(e.id)));
    assertInert(detail(doc, e));
  }
});

test("the fake document really refuses markup", () => {
  const el = doc.createElement("div");
  assert.throws(() => { el.innerHTML = "<b>x</b>"; }, /markup sink/);
  assert.throws(() => el.insertAdjacentHTML("beforeend", "<b>x</b>"), /markup sink/);
});

test("fields the catalogue does not vouch for are dropped", () => {
  const [a, b, c] = hostile.map(readEntry);
  assert.equal(a.preview, "", "a preview on a branch is refused");
  assert.deepEqual(a.draws, ["panel"], "an unknown draw is dropped");
  assert.equal(b.repo, null, "a javascript: source is no repository");
  assert.equal(b.preview, "");
  assert.equal(b.verified, false, "verified is the literal true or nothing");
  assert.equal(b.scope, null, "an unknown scope is no scope");
  assert.equal(b.sha256, "");
  assert.equal(b.added, "");
  assert.equal(readEntry({ id: "x", added: "2026-01-01 · verified by the agentglass project" }).added, "", "a date with words after it is no date");
  const cut = readEntry({ id: "a".repeat(199) + "😀" });
  assert.doesNotThrow(() => encodeURIComponent(cut.id), "an id cut through an emoji still makes a URL");
  assert.equal(c.preview, "", "a picture on another host is refused");
});

/* ── the picture rule ───────────────────────────────────────── */
test("a preview is shown only from this repository at this commit", () => {
  const repo = { owner: "acme", name: "orbit-lint", ref: REF };
  const base = `https://raw.githubusercontent.com/acme/orbit-lint/${REF}`;
  assert.equal(previewUrl(`${base}/preview.png`, repo), `${base}/preview.png`);
  assert.equal(previewUrl(`${base}/docs/shot.webp`, repo), `${base}/docs/shot.webp`);
  const refused = [
    `http://raw.githubusercontent.com/acme/orbit-lint/${REF}/preview.png`,
    `https://raw.githubusercontent.com/acme/orbit-lint/main/preview.png`,
    `https://raw.githubusercontent.com/acme/orbit-lint/${"0".repeat(40)}/preview.png`,
    `https://raw.githubusercontent.com/other/orbit-lint/${REF}/preview.png`,
    `https://raw.githubusercontent.com/acme/orbit-lint/${REF}/../../other/x/${REF}/p.png`,
    `${base}/preview.png?track=1`,
    `${base}/preview.png#x`,
    `${base}/preview.svg`,
    `${base}/`,
    `https://raw.githubusercontent.com.evil.example/acme/orbit-lint/${REF}/preview.png`,
    `https://user@raw.githubusercontent.com/acme/orbit-lint/${REF}/preview.png`,
    `javascript:alert(1)//${base}/preview.png`,
    `data:image/png;base64,AAAA`,
    "",
    null,
    42,
  ];
  for (const u of refused) assert.equal(previewUrl(u, repo), "", `refused: ${u}`);
  assert.equal(previewUrl(`${base}/preview.png`, null), "", "no repository, no picture");
});

test("only a GitHub repository pinned to a full commit is a repository", () => {
  const e = (url, ref) => readEntry({ id: "x", source: { url, ref } }).repo;
  assert.deepEqual(e("https://github.com/acme/orbit-lint", REF), { owner: "acme", name: "orbit-lint", ref: REF });
  assert.deepEqual(e("https://github.com/acme/orbit-lint.git", REF), { owner: "acme", name: "orbit-lint", ref: REF });
  assert.equal(e("https://github.com/acme/orbit-lint", "main"), null);
  assert.equal(e("https://github.com/acme/orbit-lint", REF.slice(0, 7)), null);
  assert.equal(e("https://github.com/acme/..", REF), null);
  assert.equal(e("https://github.com/acme/orbit-lint/tree/main", REF), null);
  assert.equal(e("https://gitlab.com/acme/orbit-lint", REF), null);
  assert.equal(e("http://github.com/acme/orbit-lint", REF), null);
  assert.equal(readEntry({ id: "x", sha256: SHA.toUpperCase() }).sha256, SHA);
});

/* ── the rest of what is drawn ──────────────────────────────── */
test("backticks become code, and a cut-off description says so", () => {
  const box = prose(doc, "Keeps `read` scope and stops mid", "d");
  const p = box.childNodes[0];
  assert.equal(p.childNodes[1].tagName, "CODE");
  assert.equal(p.childNodes[1].textContent, "read");
  assert.ok(box.textContent.endsWith("mid…"));
  assert.equal(prose(doc, "Ends well.", "d").textContent, "Ends well.");
  /* Cut after most of a sentence-long text: the whole sentences stay. */
  assert.equal(prose(doc, "It reads every pull request on this machine and never posts a word. It costs what", "d").textContent,
    "It reads every pull request on this machine and never posts a word.");
});

test("licences are named from the file, and an unknown one is not guessed", () => {
  assert.equal(licenceName("MIT License\n\nCopyright (c) 2026 Acme"), "MIT");
  assert.equal(licenceName("                                 Apache License\n                           Version 2.0, January 2004"), "Apache-2.0");
  assert.equal(licenceName("GNU GENERAL PUBLIC LICENSE\n                       Version 3, 29 June 2007"), "GPL-3.0");
  assert.equal(licenceName("<script>alert(1)</script> my own terms"), "Other");
  assert.equal(licenceName(""), "");
  assert.equal(licenceName(undefined), "");
});

/* ── nothing in the site can reach a markup sink ───────────── */
test("no script in the site writes markup", () => {
  const dir = join(here, "..");
  const sinks = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function\s*\(|setAttribute\(\s*["']on|srcdoc|createContextualFragment|DOMParser/;
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= 3);
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, sinks, `${f} uses a markup sink`);
  }
});

test("the page forbids markup from strings, and scripts and images from elsewhere", () => {
  const html = readFileSync(join(here, "..", "index.html"), "utf8");
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(csp, "the page carries a CSP");
  const p = csp[1];
  assert.match(p, /default-src 'none'/);
  assert.match(p, /script-src 'self';/);
  assert.match(p, /img-src 'self' https:\/\/raw\.githubusercontent\.com;/);
  assert.match(p, /require-trusted-types-for 'script'/);
  assert.match(p, /trusted-types 'none'/);
  assert.doesNotMatch(p, /unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, "no inline script");
  assert.doesNotMatch(html, /\son[a-z]+=/i, "no inline handler");
});
