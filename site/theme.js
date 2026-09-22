/* Runs in <head>, before first paint, so a visitor who picked a theme never
   sees the other one flash. The pick lives in this browser only. */
try {
  const t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) { m.media = ""; m.content = t === "dark" ? "#07060d" : "#f6f5fb"; }
  }
} catch { /* storage blocked: the system theme it is */ }
