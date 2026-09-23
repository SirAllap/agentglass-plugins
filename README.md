# agentglass plugins

The catalogue [agentglass](https://github.com/SirAllap/agentglass) installs
plugins from: one JSON file, `plugins.json`, published on this repository's
Pages site and read by the app's market and the project's plugins page.

It lives here rather than in the app's repository on purpose. Listing is
automatic — a label, a pull request, a check, a merge — and automatic needs a
bot that can push and a `main` it can merge to. Here, the worst a bad merge
does is change a list. In the app's repository the same `main` holds the
installers and the release tags.

## Being listed

Open the **List a plugin** issue. A check clones the repository you name,
validates its `plugin.json` with the app's own validator, scans the source for
a short list of patterns and writes what it found on the issue. Then a
maintainer decides.

**Listing is not auditing.** A listed plugin has a public repository, a
manifest the app accepts, a README and a licence. It still runs as a process
on the installer's machine, and it still asks them to approve its scope and
where it draws. Read the code.

## What an entry promises

An approved entry names bytes, not a branch:

- `source.ref` is the full commit the approval cloned;
- `sha256` is the content hash of the tree at that commit, by the walk the app
  does at install (`agentglass-plugin hash <folder>` prints it): every file's
  bytes and whether it may be run, read from git's index so Windows hashes it
  the same, and every link's text;
- `preview`, when there is one, is read at that commit.

The app fetches that commit and refuses an install whose files hash to
anything else. Pushing to your repository after you are listed changes nothing
for anybody who installs from here. A new version is a new submission: edit
your issue to name the new commit, or open another.

## The machinery

| Workflow | Runs on | Holds | Does |
|---|---|---|---|
| `plugin-submission.yml` → `read` | the issue opened or edited | `contents: read`, no credentials kept, no secrets | clones the named repository, validates, scans, writes a report |
| `plugin-submission.yml` → `say` | after `read` | `issues: write` | posts the report and sets `ready for listing` or `changes needed`; a run about the commit the last report names rewrites it, a run about another commit or repository posts a new one and is held: it takes `ready for listing` and `approved for listing` off before posting and never puts `ready for listing` back, so a maintainer reads it and applies it again; never looks at the submitted code |
| `plugin-approve.yml` | the `approved for listing` label | `contents: read`, `issues: write`, and an App token minted for the run | re-checks the labeller, requires `ready for listing` (for a held report, applied by a person after it was posted), lists only the commit the latest green report names, clones it again, validates, hashes and scans again, refuses an id already listed from another repository or the project's name as a stranger's publisher, and opens a pull request; it arms auto-merge only when `main` requires the `catalogue` check, and otherwise leaves the pull request for a maintainer |
| `check.yml` → `catalogue` | every pull request | `contents: read`, no secrets | re-derives the entry from the pull request: one entry, a full commit on a branch or tag of the named repository, the manifest's name, publisher, scope, draws, `minApp` and title at that commit, and a fresh fetch that hashes to `sha256` |
| `check.yml` → `site` | every pull request | `contents: read`, no secrets | runs the market site's tests: hostile entries, in a stub document and in headless Chrome, must render as text and run nothing |
| `pages.yml` | a push to `main` | Pages | runs the same tests, then publishes the market site with `plugins.json` at its root |

Nothing submitted is ever executed, and the scanner follows no link out of the
folder it was handed. The validator and the hash come from the app
repository's `bin/agentglass-plugin`, fetched at run time, so the catalogue
holds a manifest to exactly the rules the app installs by.

## The market site

`site/` is the page Pages serves next to `plugins.json`: search, filters, a
card per plugin and a page for each one, all drawn in the browser from the
same file the app reads. There is no build step and nothing from another
origin except a plugin's preview image and its `LICENSE`, both read from
`raw.githubusercontent.com` at the listed commit.

It wears the agentglass landing page's own design system: `site/landing.css`
is the landing's CSS copied verbatim (its tokens, the header lockup with the
orbiting mark, the section rhythm, the footer and the `pl-*` plugin parts),
and `site/styles.css` holds only what the market adds. Dark only, as the
landing is. To follow a change on the landing, copy the same rules again;
`site/test/design.test.mjs` holds the copy to the landing's token values.
Motion (`site/motion.js`) stops entirely under `prefers-reduced-motion`.
`?variant=noheader` shows the same page without its header bar.

Every field of an entry is text on that page. `site/render.js` is the only
file that turns an entry into elements and it never writes markup; the page's
Content Security Policy requires Trusted Types with no policy, so a string
assigned as markup throws instead of parsing. `node --test site/test/` feeds
it hostile entries and fails if anything runs, and drives headless Chrome to
check the motion, the reduced-motion page and the phone width.

    scripts/build-site.sh            # assembles _site/, as Pages does
    python3 -m http.server -d _site  # then open http://localhost:8000

## Settings this repository needs

These are GitHub settings, not files, and the workflows depend on them:

- **Pages**: source *GitHub Actions*.
- **A GitHub App** installed on this repository only, with *Contents: read and
  write* and *Pull requests: read and write* and nothing else; its id in the
  `CATALOGUE_APP_ID` secret and a private key in `CATALOGUE_APP_KEY`.
- **Actions**: workflow permissions read-only, and *Allow GitHub Actions to
  create and approve pull requests* off.
- **Allow auto-merge** on.
- **A ruleset on `main`**: no deletion, no force push, the `catalogue` status
  check required, and no bypass for the App.
