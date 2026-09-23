/*
 * The market is the landing's design system, not a lookalike.
 *
 * landing.css is a verbatim copy of the landing's own CSS; these tests hold
 * the copy to the landing's values, keep the official mark and its orbit in
 * the page, and keep the market dark only, as the landing is. The values are
 * written out here because the landing lives in another repository: a change
 * there is a change to copy here on purpose, with this file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(site, f), "utf8");

/* The landing's :root, as landing/index.html declares it. */
const LANDING_TOKENS = {
  "--void": "#07060d", "--txt": "#f2f1f8", "--dim": "#8b88a4", "--dim2": "#57546e",
  "--vio": "#a78bfa", "--vio2": "#7c5cf5", "--run": "#34d399", "--wait": "#fbbf24", "--held": "#f472b6",
  "--line": "rgba(167,139,250,.13)", "--line2": "rgba(167,139,250,.3)", "--l": "rgba(167,139,250,.2)",
  "--mono": 'ui-monospace,"SF Mono",Menlo,Consolas,monospace',
};
const tokens = (css) => {
  const root = css.match(/(?:^|\n):root\{([^}]*)\}/);
  assert.ok(root, "a :root block");
  const out = {};
  for (const m of root[1].replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;]+)(?:;|$)/g)) out[m[1]] = m[2].trim();
  return out;
};

test("landing.css carries the landing's tokens, verbatim", () => {
  const got = tokens(read("landing.css"));
  for (const [k, v] of Object.entries(LANDING_TOKENS)) assert.equal(got[k], v, `${k}`);
  assert.match(got["--pop"], /^linear\(0, 0\.1535 4\.2%/, "the landing's spring curve");
});

test("the market changes one landing token, --dim2, and only to lift text to AA", () => {
  const ours = tokens(read("styles.css"));
  const touched = Object.keys(ours).filter((k) => k in LANDING_TOKENS);
  assert.deepEqual(touched, ["--dim2"]);
  assert.equal(ours["--dim2"], "#807d9a");
});

test("the favicon is the official mark's small cut", () => {
  const svg = read("favicon.svg").replace(/\s+/g, " ").trim();
  assert.match(svg, /<path d="M14\.1 54\.9 A29 8\.5 -52 0 1 49\.9 9\.1" fill="none" stroke="#a78bfa" stroke-opacity="\.45" stroke-width="6"/);
  assert.match(svg, /<circle cx="30" cy="34" r="15" fill="#a78bfa"\/>/);
  assert.match(svg, /<circle cx="50\.7" cy="10\.4" r="6" fill="#34d399"\/>/);
});

test("the header is the landing's lockup, with its mark orbiting", () => {
  const html = read("index.html");
  const lock = html.match(/<a class="hd-lock"[\s\S]*?<\/a>/);
  assert.ok(lock, "the lockup");
  const orbit = 'dur="16s" repeatCount="indefinite" path="M49.9 9.1 A29 8 -52 0 1 14.1 54.9 A29 8 -52 0 1 49.9 9.1"';
  assert.equal(lock[0].split(orbit).length - 1, 2, "the contact, drawn behind and in front of the world, on its 16s orbit");
  for (const part of ["lk-cue", "lk-pl", "lk-wi", "lk-car"]) assert.ok(lock[0].includes(`class="${part}"`), part);
});

test("dark only, as the landing is", () => {
  const html = read("index.html");
  assert.match(html, /<meta name="color-scheme" content="dark">/);
  assert.doesNotMatch(html, /id="theme"|prefers-color-scheme/);
  for (const f of readdirSync(site).filter((x) => x.endsWith(".css") || x.endsWith(".js"))) {
    assert.doesNotMatch(read(f), /prefers-color-scheme|data-theme/, `${f} has no light theme`);
  }
});
