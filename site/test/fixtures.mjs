/*
 * Catalogue entries written by somebody hostile. Every string here is what a
 * pull request to plugins.json could carry; the tests prove each one reaches
 * the page as text and nothing else. The repositories are invented.
 */
export const REF = "3f2a9c0d41b7e8a6f5c2d19e0b4a7c63d8e1f205";
export const SHA = "5d0e7b9c2a41f3e8d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928170c4";

/* Each payload, if it ever became markup, would call home to /beacon on the
   same origin (which the page's CSP allows for images and fetches) or mark
   the root element. The browser test counts both; the answer must be zero. */
export const PAYLOADS = {
  title: `<img src="/beacon?title" onerror="document.documentElement.dataset.pwned='title'">Orbit`,
  publisher: `acme"><script>fetch('/beacon?publisher')</script>`,
  description: "Lints orbits.</p><script>fetch('/beacon?description')</script><svg onload=\"document.documentElement.dataset.pwned='svg'\"></svg>\n\nSecond `<iframe src=/beacon?code>` paragraph.",
  category: `<b onmouseover="fetch('/beacon?cat')">bold</b>`,
  id: `x"><img src=/beacon?id>`,
};

export const hostile = [
  {
    id: "orbit-lint",
    title: PAYLOADS.title,
    publisher: PAYLOADS.publisher,
    verified: false,
    scope: "read",
    draws: ["panel", "<script>alert(1)</script>"],
    source: { kind: "git", url: "https://github.com/acme/orbit-lint", ref: REF },
    sha256: SHA,
    description: PAYLOADS.description,
    categories: [PAYLOADS.category, "lint"],
    added: "2026-01-02",
    // Right repository, wrong commit: a picture that could change after approval.
    preview: "https://raw.githubusercontent.com/acme/orbit-lint/main/preview.png",
  },
  {
    id: PAYLOADS.id,
    title: "javascript links",
    publisher: "acme",
    verified: "yes",
    scope: "root",
    source: { kind: "git", url: "javascript:fetch('/beacon?source')", ref: REF },
    sha256: "not-a-hash",
    description: "A source URL that is a script.",
    categories: [],
    added: "<img src=/beacon?added>",
    preview: "javascript:fetch('/beacon?preview')",
  },
  {
    id: "elsewhere",
    title: "Picture from another host",
    publisher: "acme",
    verified: false,
    scope: "full",
    source: { kind: "git", url: "https://github.com/acme/elsewhere", ref: REF },
    sha256: SHA,
    description: "Its preview lives on a server that sees every visitor",
    categories: ["other"],
    added: "2026-01-01",
    preview: "https://tracker.example/pixel.png?who=you",
  },
];
