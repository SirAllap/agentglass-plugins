/*
 * The page as a visitor meets it, in a real browser: the header already
 * formed with its mark still orbiting, the hero's pass carrying a satellite
 * per plugin, nothing moving at all under prefers-reduced-motion, the
 * variant without a header bar, and no sideways scroll on a phone.
 *
 * Headless Chrome is driven over the DevTools protocol, so the test can set
 * the viewport and the reduced-motion preference. It never leaves this
 * machine: every host but the throwaway server resolves to nothing.
 *
 * Skipped when no Chrome or Chromium is installed, or when this Node has no
 * WebSocket (older than 22). Set CHROME to pick a browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { REF, SHA } from "./fixtures.mjs";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = [process.env.CHROME, "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]
  .find((p) => p && existsSync(p));
const skip = !chrome ? "no Chrome or Chromium installed" : typeof WebSocket === "undefined" ? "this Node has no WebSocket" : false;

/* Three invented plugins: one satellite each on the pass. */
const catalogue = {
  name: "fixture",
  plugins: ["orbit-lint", "moon-notes", "tidal-review"].map((id, i) => ({
    id, title: id.replace("-", " "), publisher: "acme", verified: false, scope: "read", draws: ["panel"],
    source: { kind: "git", url: `https://github.com/acme/${id}`, ref: REF }, sha256: SHA,
    description: "An invented plugin.", categories: ["lint"], added: `2026-01-0${i + 1}`,
  })),
};

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };
function serve() {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    if (path === "/plugins.json") { res.writeHead(200, { "content-type": TYPES[".json"] }).end(JSON.stringify(catalogue)); return; }
    const file = path === "/" ? "index.html" : path.slice(1);
    if (file.includes("/") || file.includes("..")) { res.writeHead(404).end(); return; }
    try { res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }).end(await readFile(join(site, file))); } catch { res.writeHead(404).end(); }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A headless browser and one call: open a page, answer questions about it. */
async function browser() {
  const dir = mkdtempSync(join(tmpdir(), "market-cdp-"));
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "about:blank"];
  if (process.env.CI) args.unshift("--no-sandbox");
  const proc = spawn(chrome, args, { stdio: "ignore" });
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(100);
    const f = join(dir, "DevToolsActivePort");
    if (existsSync(f)) port = readFileSync(f, "utf8").split("\n")[0];
  }
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); } else events.push(m);
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const i = ++id; pending.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

  async function open(url, { w = 1440, h = 900, reduced = false, mobile = false } = {}) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile }, sessionId);
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" }] }, sessionId);
    const loaded = events.length;
    await send("Page.navigate", { url }, sessionId);
    for (let i = 0; i < 100 && !events.slice(loaded).some((m) => m.method === "Page.loadEventFired" && m.sessionId === sessionId); i++) await sleep(50);
    await sleep(1800);
    const ask = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    return { ask, close: () => send("Target.closeTarget", { targetId }) };
  }
  const quit = () => { ws.close(); proc.kill(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* still closing */ } };
  return { open, quit };
}

test("the page moves the way the landing does, and not at all when asked", { skip }, async (t) => {
  const { server, port } = await serve();
  const b = await browser();
  const base = `http://127.0.0.1:${port}/`;
  try {
    await t.test("the header is formed from the start, and the mark keeps its orbit", async () => {
      const p = await b.open(base);
      const s = await p.ask(`(() => {
        const cs = (q) => getComputedStyle(document.querySelector(q));
        return { lock: cs(".hd-lock").transform, nav: cs(".hd-nav").opacity, hd: cs(".hd").position,
          mark: document.querySelector("svg.mk").animationsPaused(), pass: document.querySelector(".pass svg").animationsPaused(),
          sats: document.querySelectorAll("#pass-front .sat-p").length, lit: document.querySelectorAll(".oneline i.lit").length };
      })()`);
      assert.equal(s.lock, "none", "the lockup is not moved into the hero");
      assert.equal(s.nav, "1", "the links are there before any scroll");
      assert.equal(s.hd, "fixed");
      assert.equal(s.mark, false, "the mark's contact orbits");
      assert.equal(s.pass, false, "the pass orbits");
      assert.equal(s.sats, 3, "one satellite for each listed plugin");
      assert.ok(s.lit > 0, "the sentence lights up");
      await p.close();
    });

    await t.test("under reduced motion nothing moves and everything is shown", async () => {
      const p = await b.open(base, { reduced: true });
      const s = await p.ask(`(() => ({
        running: document.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName || "script"),
        paused: [...document.querySelectorAll("svg.mk, .pass svg")].map((svg) => svg.animationsPaused()),
        orbs: document.querySelectorAll(".orb").length,
        split: document.querySelectorAll(".oneline i").length,
        shown: ["kick", "oneline", "cta"].map((c) => getComputedStyle(document.querySelector("." + c)).opacity),
        cards: [...document.querySelectorAll("#grid .pl-card")].map((c) => getComputedStyle(c).opacity),
      }))()`);
      assert.deepEqual(s.running, [], "no animation runs");
      assert.deepEqual(s.paused, [true, true], "every orbit is stopped");
      assert.equal(s.orbs, 0, "no drifting orbs");
      assert.equal(s.split, 0, "the sentence is left whole");
      assert.deepEqual(s.shown, ["1", "1", "1"], "the hero is drawn in its final state");
      assert.deepEqual(s.cards, ["1", "1", "1"], "every card is there without scrolling to it");
      await p.close();
    });

    await t.test("the variant without a header bar keeps the lockup in the page", async () => {
      const p = await b.open(base + "?variant=noheader");
      const s = await p.ask(`({ hd: getComputedStyle(document.querySelector(".hd")).position,
        bar: getComputedStyle(document.querySelector(".hd-bar")).display,
        mark: getComputedStyle(document.querySelector(".hd-lock")).display })`);
      assert.deepEqual(s, { hd: "absolute", bar: "none", mark: "flex" });
      await p.close();
    });

    await t.test("a phone never scrolls sideways, on the shelf or a plugin's page", async () => {
      for (const url of [base, base + "?variant=noheader", `${base}#/plugin/orbit-lint`]) {
        const p = await b.open(url, { w: 390, h: 844, mobile: true });
        const s = await p.ask(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
        assert.equal(s.sw, s.cw, `${url} is ${s.sw}px wide in a ${s.cw}px screen`);
        await p.close();
      }
    });

    await t.test("a plugin's page puts the keyboard on its title", async () => {
      const p = await b.open(`${base}#/plugin/moon-notes`);
      const s = await p.ask(`({ focus: document.activeElement.id, title: document.title, route: document.body.dataset.route })`);
      assert.deepEqual(s, { focus: "detail-title", title: "moon notes · agentglass plugins", route: "plugin" });
      await p.close();
    });

    await t.test("'How to install' goes down the plugin's page and stays on it", async () => {
      const p = await b.open(`${base}#/plugin/moon-notes`, { reduced: true });
      const s = await p.ask(`(async () => {
        document.querySelector(".pl-big").click();
        await new Promise((r) => setTimeout(r, 300));
        const box = document.getElementById("install").getBoundingClientRect();
        return { route: document.body.dataset.route, hash: location.hash, inView: box.top >= 0 && box.top < innerHeight,
          focus: document.activeElement.textContent };
      })()`);
      assert.deepEqual(s, { route: "plugin", hash: "#/plugin/moon-notes", inView: true, focus: "Install it from the app" });
      await p.close();
    });

    await t.test("a plugin that is not listed offers the ones that are", async () => {
      const p = await b.open(`${base}#/plugin/nowhere`);
      const s = await p.ask(`({ h: document.querySelector("#view h1").textContent, cards: document.querySelectorAll("#view .pl-card").length })`);
      assert.deepEqual(s, { h: "No such plugin", cards: 3 });
      await p.close();
    });
  } finally {
    b.quit();
    server.close();
  }
});
