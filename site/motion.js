/*
 * The landing's motion, on the market's page.
 *
 * The sentence that lights a word at a time, the sections that rise into
 * place with their orbs, and the satellite that crosses the page: the same
 * code the landing runs (agentglass landing/index.html), with the parts that
 * wrote markup rebuilt from elements, because this page forbids markup from
 * strings. The header is the landing's lockup, already formed: the mark keeps
 * its orbit and the caret its blink, with no entrance. The hero's pass and
 * the cards' motion are the market's own.
 *
 * Everything here honours prefers-reduced-motion. With it set the page is
 * drawn in its final state: the sentence lit, no orbs, no satellite, and
 * every orbit stopped.
 */
export const calm = matchMedia("(prefers-reduced-motion: reduce)");
const $ = (s) => document.querySelector(s);
const ease = "cubic-bezier(.16,1,.3,1)";
const SVG = "http://www.w3.org/2000/svg";

/* ── the orbits ───────────────────────────────────────────────────
   The contact in the header mark and everything in the hero's pass is SMIL,
   which CSS cannot stop. Parked at the start of its path the contact sits
   where the still logo draws it. */
function orbit() {
  for (const svg of document.querySelectorAll("svg.mk, .pass svg")) {
    if (calm.matches) { svg.pauseAnimations(); svg.setCurrentTime(0); } else svg.unpauseAnimations();
  }
}
orbit();
calm.addEventListener("change", orbit);

/**
 * A satellite on the pass for each listed plugin, spaced evenly along the
 * orbit behind the contact. Each is drawn twice, like the contact: once under
 * the world for the half of the orbit behind it, once over it for the half in
 * front, each shown for its half.
 */
export function satellites(n) {
  const back = $("#pass-back"), front = $("#pass-front");
  if (!back || !front) return;
  back.replaceChildren();
  front.replaceChildren();
  const PATH = "M49.9 9.1 A29 8 -52 0 1 14.1 54.9 A29 8 -52 0 1 49.9 9.1";
  const count = Math.min(n, 6);
  for (let k = 0; k < count; k++) {
    const begin = (-(16 / (count + 1)) * (k + 1)).toFixed(2) + "s";
    for (const [layer, values, dim] of [[back, "0;1", ".55"], [front, "1;0", "1"]]) {
      const g = document.createElementNS(SVG, "g");
      g.setAttribute("class", "sat-p");
      const show = document.createElementNS(SVG, "animate");
      for (const [a, v] of [["attributeName", "opacity"], ["values", values], ["keyTimes", "0;.5"], ["dur", "16s"], ["begin", begin], ["calcMode", "discrete"], ["repeatCount", "indefinite"]]) show.setAttribute(a, v);
      const move = document.createElementNS(SVG, "animateMotion");
      for (const [a, v] of [["dur", "16s"], ["begin", begin], ["repeatCount", "indefinite"], ["path", PATH]]) move.setAttribute(a, v);
      const body = document.createElementNS(SVG, "g");
      body.setAttribute("opacity", dim);
      const box = document.createElementNS(SVG, "rect");
      for (const [a, v] of [["x", "-2.3"], ["y", "-2.3"], ["width", "4.6"], ["height", "4.6"], ["rx", "1.3"], ["fill", "#171226"], ["stroke", "#a78bfa"], ["stroke-opacity", ".7"], ["stroke-width", "1"], ["vector-effect", "non-scaling-stroke"]]) box.setAttribute(a, v);
      const piece = document.createElementNS(SVG, "use");
      for (const [a, v] of [["href", "#i-piece"], ["x", "-1.6"], ["y", "-1.6"], ["width", "3.2"], ["height", "3.2"]]) piece.setAttribute(a, v);
      body.append(box, piece);
      g.append(show, move, body);
      layer.append(g);
    }
  }
  /* New animation elements start on the document's clock; under reduced
     motion they must stop with the rest. */
  orbit();
}

/* The pass leans a few pixels toward the pointer, and eases after it. */
const pass = $(".pass");
if (pass && !calm.matches && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const hero = pass.closest(".one");
  let tx = 0, ty = 0, x = 0, y = 0, running = false;
  const step = () => {
    x += (tx - x) * 0.08;
    y += (ty - y) * 0.08;
    pass.style.setProperty("--px", x.toFixed(2) + "px");
    pass.style.setProperty("--py", y.toFixed(2) + "px");
    if (Math.abs(tx - x) > 0.05 || Math.abs(ty - y) > 0.05) requestAnimationFrame(step); else running = false;
  };
  const aim = (nx, ny) => { tx = nx; ty = ny; if (!running) { running = true; requestAnimationFrame(step); } };
  hero.addEventListener("pointermove", (ev) => {
    const r = pass.getBoundingClientRect();
    aim(((ev.clientX - (r.left + r.width / 2)) / innerWidth) * -18, ((ev.clientY - (r.top + r.height / 2)) / innerHeight) * -14);
  });
  hero.addEventListener("pointerleave", () => aim(0, 0));
}

/* ── the hero: the sentence lights a word at a time ───────────────
   The words are split into elements the landing's CSS lights one by one; a
   screen reader reads the sentence once, from a hidden copy. */
function splitWords(h) {
  const full = h.textContent.replace(/\s+/g, " ").trim();
  const shown = document.createElement("span");
  shown.setAttribute("aria-hidden", "true");
  const walk = (from, into) => {
    for (const n of [...from.childNodes]) {
      if (n.nodeType === 3) {
        for (const part of n.data.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { into.append(document.createTextNode(" ")); continue; }
          const i = document.createElement("i");
          i.textContent = part;
          into.append(i);
        }
      } else if (n.nodeType === 1) {
        const copy = document.createElement(n.tagName.toLowerCase());
        walk(n, copy);
        into.append(copy);
      }
    }
  };
  walk(h, shown);
  const read = document.createElement("span");
  read.className = "vh";
  read.textContent = full;
  h.replaceChildren(read, shown);
  return [...shown.querySelectorAll("i")];
}

const one = $(".one");
const line = one && one.querySelector(".oneline");
const prompt = one && one.querySelector(".ctap");
function heroStill() {
  one.classList.add("go");
  line.classList.add("on", "shine");
  prompt.style.setProperty("--t", "1");
  prompt.classList.add("ready");
}
if (one && line && prompt) {
  if (calm.matches) heroStill();
  else {
    const words = splitWords(line);
    requestAnimationFrame(() => one.classList.add("go"));
    setTimeout(() => line.classList.add("on"), 180);
    words.forEach((w, i) => setTimeout(() => w.classList.add("lit"), 360 + i * 85));
    const lit = 360 + words.length * 85;
    setTimeout(() => line.classList.add("shine"), lit + 300);
    /* The prompt's border fills from the left, then it glows ready. */
    setTimeout(() => {
      const t0 = performance.now(), T = 900;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / T);
        prompt.style.setProperty("--t", (1 - Math.pow(1 - k, 3)).toFixed(3));
        if (k < 1) requestAnimationFrame(step); else prompt.classList.add("ready");
      };
      requestAnimationFrame(step);
    }, lit - 200);
  }
}

/* ── the sections (landing: rise, lines, orbs, satellite) ──────────── */
if (!calm.matches) requestAnimationFrame(() => {
  const secs = [...document.querySelectorAll("#home .sec")];
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    io.unobserve(e.target);
    setTimeout(() => e.target.classList.add("done"), 1400);
  }), { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
  secs.forEach((s) => {
    const kids = [...s.querySelector(".w").children];
    kids.forEach((k, i) => { k.classList.add("rv"); k.style.transitionDelay = (i * 90) + "ms"; io.observe(k); });
  });

  /* A heading rises a line at a time: split where the browser broke it. */
  const lines = (h) => {
    const text = h.textContent;
    const r = document.createRange();
    const rows = new Map();
    const walk = (n) => {
      if (n.nodeType === 3) {
        for (let i = 0; i < n.length; i++) {
          r.setStart(n, i); r.setEnd(n, i + 1);
          const t = Math.round(r.getBoundingClientRect().top);
          if (!rows.has(t)) rows.set(t, "");
          rows.set(t, rows.get(t) + n.textContent[i]);
        }
      } else for (const c of n.childNodes) walk(c);
    };
    walk(h);
    const parts = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.trim()).filter(Boolean);
    if (parts.length < 1 || parts.join(" ").replace(/\s+/g, " ") !== text.replace(/\s+/g, " ").trim()) return;
    h.replaceChildren(...parts.map((t, i) => {
      const ln = document.createElement("span"); ln.className = "ln";
      const inner = document.createElement("span");
      inner.textContent = i < parts.length - 1 ? t + " " : t;
      ln.append(inner);
      return ln;
    }));
    [...h.querySelectorAll(".ln>span")].forEach((e, i) => { e.style.transitionDelay = (i * 110) + "ms"; });
  };
  secs.forEach((s) => { const h = s.querySelector("h2"); if (h) lines(h); });

  /* An orb of light behind each section, drifting against the scroll. */
  const TINT = ["167,139,250", "52,211,153", "251,191,36", "167,139,250", "96,165,250"];
  const arts = secs.map((s, i) => {
    const orb = document.createElement("div");
    orb.className = "orb";
    orb.setAttribute("aria-hidden", "true");
    const size = Math.round(420 + i * 90);
    orb.style.width = orb.style.height = size + "px";
    orb.style.background = `radial-gradient(circle,rgba(${TINT[i % TINT.length]},.20),transparent 66%)`;
    orb.style.left = i % 2 ? "58%" : "-8%";
    orb.style.top = "8%";
    s.prepend(orb);
    return { s, orb };
  });

  /* The satellite: the mark, crossing the page on a slow wave as it scrolls. */
  const sat = $(".sat");
  const home = $("#home");
  const fly = () => {
    if (!sat) return;
    const start = innerHeight * 1.2;
    const run = Math.max(1, document.documentElement.scrollHeight - innerHeight - start);
    const p = (scrollY - start) / run;
    const on = !home.hidden && p > 0 && p < 1;
    sat.classList.toggle("on", on);
    if (!on) return;
    const wave = Math.sin(p * Math.PI * 1.5);
    const x = innerWidth / 2 + wave * (innerWidth * 0.42) - 66;
    const y = innerHeight * (0.24 + 0.52 * (0.5 + 0.5 * Math.cos(p * Math.PI * 2.2)));
    sat.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0)";
  };
  let geo = [];
  const measure = () => { geo = arts.map((a) => { const b = a.s.getBoundingClientRect(); return { mid: b.top + scrollY + b.height / 2, h: b.height }; }); };
  const depth = () => {
    const mid = scrollY + innerHeight / 2;
    arts.forEach((a, i) => {
      const g = geo[i];
      if (!g || Math.abs(g.mid - mid) > innerHeight + g.h / 2 + 200) return;
      a.orb.style.transform = "translate3d(0," + Math.round(((g.mid - mid) / innerHeight) * -140) + "px,0)";
    });
  };
  let tick = false;
  addEventListener("scroll", () => {
    if (tick) return;
    tick = true;
    requestAnimationFrame(() => { tick = false; fly(); depth(); });
  }, { passive: true });
  addEventListener("resize", () => { measure(); fly(); depth(); });
  addEventListener("hashchange", () => setTimeout(() => { measure(); fly(); depth(); }, 50));
  setTimeout(() => { measure(); depth(); }, 1200);
  measure(); depth(); fly();
});

/* ── the entry: the lines an approval pins light up in turn ───────── */
const entry = $("#entry");
if (entry) {
  const keys = [...entry.querySelectorAll(".l.k")];
  if (calm.matches || !("IntersectionObserver" in window)) keys.forEach((k) => k.classList.add("lit"));
  else {
    new IntersectionObserver(([x], o) => {
      if (!x.isIntersecting) return;
      o.disconnect();
      keys.forEach((k, i) => setTimeout(() => k.classList.add("lit"), 450 + i * 650));
    }, { threshold: 0.5 }).observe(entry);
  }
}

/* ── the shelf's cards ────────────────────────────────────────────── */

/** Cards rise into place, a short stagger apart, as they come into view. */
export function reveal(nodes) {
  if (calm.matches || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((es) => {
    let n = 0;
    for (const e of es) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      e.target.classList.remove("pre");
      e.target.animate([{ opacity: 0, transform: "translateY(28px) scale(.985)" }, { opacity: 1, transform: "none" }],
        { duration: 800, delay: n++ * 90, easing: ease, fill: "backwards" });
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  for (const node of nodes) { node.classList.add("pre"); io.observe(node); }
}

/**
 * The shelf after a filter: every card that stays glides from where it was
 * to where it is, and a card that joins grows in from 96%.
 */
export function flip(grid, update) {
  if (calm.matches) { update(); return; }
  const before = new Map([...grid.children].map((c) => [c, c.getBoundingClientRect()]));
  update();
  for (const c of grid.children) {
    c.classList.remove("pre");
    const was = before.get(c);
    const now = c.getBoundingClientRect();
    if (!was) {
      c.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: ease });
      continue;
    }
    const dx = was.left - now.left, dy = was.top - now.top;
    if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 340, easing: ease });
  }
}

/** A light under the pointer, on the card it is over. */
export function spotlight(grid) {
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  let queued = null;
  grid.addEventListener("pointermove", (ev) => {
    if (calm.matches || !fine.matches) return;
    const c = ev.target.closest(".pl-card");
    if (!c) return;
    const had = queued;
    queued = { c, x: ev.clientX, y: ev.clientY };
    if (had) return;
    requestAnimationFrame(() => {
      const { c: card, x, y } = queued;
      queued = null;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", (x - r.left).toFixed(0) + "px");
      card.style.setProperty("--my", (y - r.top).toFixed(0) + "px");
    });
  });
}
