/*
 * The same hostile catalogue, in a real browser.
 *
 * A throwaway server hands out the site with the hostile entries as its
 * plugins.json, and counts every request to /beacon: each payload calls it
 * if it ever runs or parses as markup, and the page's CSP allows same-origin
 * images and fetches, so the policy is not what stops them — the rendering
 * is. Headless Chrome loads the shelf and each plugin's page; the test wants
 * zero beacons, an untouched root element, and each payload visible as text.
 *
 * Skipped when no Chrome or Chromium is installed. Set CHROME to pick one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { hostile } from "./fixtures.mjs";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");

const chrome = [process.env.CHROME, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]
  .find((p) => p && existsSync(p));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

function serve() {
  const beacons = [];
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    if (path.startsWith("/beacon")) { beacons.push(req.url); res.writeHead(204).end(); return; }
    if (path === "/plugins.json") {
      res.writeHead(200, { "content-type": TYPES[".json"] }).end(JSON.stringify({ name: "hostile", plugins: hostile }));
      return;
    }
    const file = path === "/" ? "index.html" : path.slice(1);
    if (file.includes("/") || file.includes("..")) { res.writeHead(404).end(); return; }
    try {
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(join(site, file)));
    } catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, beacons, port: server.address().port })));
}

function dump(url) {
  const args = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--virtual-time-budget=4000", "--dump-dom", url];
  if (process.env.CI) args.unshift("--no-sandbox");
  return new Promise((ok, no) => execFile(chrome, args, { timeout: 60000, maxBuffer: 8 << 20 }, (err, out) => (err ? no(err) : ok(out))));
}

test("nothing in a hostile catalogue runs in a browser", { skip: !chrome && "no Chrome or Chromium installed" }, async () => {
  const { server, beacons, port } = await serve();
  try {
    const base = `http://127.0.0.1:${port}/`;
    const pages = [base, ...hostile.map((p) => `${base}#/plugin/${encodeURIComponent(p.id)}`)];
    for (const url of pages) {
      const dom = await dump(url);
      assert.match(dom, /<main id="main">/, `${url} rendered`);
      assert.doesNotMatch(dom, /<html[^>]*data-pwned/, `${url}: a payload ran`);
      assert.doesNotMatch(dom, /<(script|iframe)[^>]*beacon/i, `${url}: a payload became an element`);
      if (url === base) {
        assert.match(dom, /&lt;img src="\/beacon\?title" onerror=/, "the title payload is on the shelf as text");
        assert.match(dom, /data-id="orbit-lint"/, "the hostile card is on the shelf");
      }
    }
    const first = await dump(pages[1]);
    assert.match(first, /&lt;\/p&gt;&lt;script&gt;fetch\('\/beacon\?description'\)&lt;\/script&gt;/, "the description payload is on its page as text");
    assert.match(first, /class="detail"/, "the plugin's own page opened");
    assert.deepEqual(beacons, [], "no payload reached the server");
  } finally {
    server.close();
  }
});
