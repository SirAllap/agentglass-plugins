/* Runs in <head>, before first paint. `?variant=noheader` draws the page
   without its header bar: the lockup and the links sit at the top of the page
   and scroll away with it. A way to compare the two; nothing is stored. */
if (new URLSearchParams(location.search).get("variant") === "noheader") document.documentElement.classList.add("noheader");
