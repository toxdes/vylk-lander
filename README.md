# VYLK lander

The VYLK lander is an independent static website for the self-hosted Markdown
notes app. It contains the landing page, installation guidance, and detailed
documentation without requiring a running VYLK server.

## Local preview

Open `index.html` directly, or serve the repository with any static file
server. The local `version.js` fallback lets install links render during
development; it is not a promise of the latest release. Build first and serve
`dist` to preview the generated API reference. Use a version-aware build before
deployment.

## Cloudflare Pages

Use the repository root as the Pages project directory:

- Build command: `./build.sh`
- Output directory: `dist`

The build selects the latest published stable GitHub release from:

```text
https://api.github.com/repos/toxdes/vylk/releases/latest
```

It writes the result to `dist/version.js`. The generated site uses that value
for release links and Docker examples. The deployed site does not fetch the
version or release metadata when visitors open it.

It fetches `VERSION`, `docs/api/openapi.json`, and
`docs/api/client-protocol.md` from that exact `vX.Y.Z` tag. The API reference at
`/docs/api/` and its protocol guide are generated at build time using the
existing docs typography, colors, header, and responsive layout. No runtime
documentation framework or live API console is shipped. The downloadable
OpenAPI specification is suitable for other viewers and SDK tooling.

Set `VYLK_VERSION_URL` when using another public version source, or
`VYLK_VERSION=X.Y.Z` to select an explicit release. Both still fetch documentation
from the corresponding release tag, never from `main`. Failed/missing downloads,
invalid contracts, and mismatched `VERSION` fail the build before replacing the
last successful `dist`. A tag predating the API documentation cannot build the
new site: publish a release containing the docs before deploying this generator.
The release webhook triggers the existing Pages build; it does not copy files.

For an offline preview of an unreleased application worktree:

```sh
VYLK_VERSION="$(cat /path/to/vylk/worktree/VERSION)" VYLK_API_SOURCE=/path/to/vylk/worktree ./build.sh
```

Use that worktree's actual `VERSION`. This local override is visibly labeled
as a preview and must not be set in production. Build dependencies are Python 3
(3.9 or newer); there are no additional generation packages. Guide Markdown
currently supports headings, paragraphs, flat lists, inline code, links, and fenced code.
Unsupported blocks fail explicitly; extend the renderer and tests together
rather than silently dropping new guide content. The canonical API docs live
in VYLK, not this repository; no generated HTML or copied source is committed.

## Checks

From this repository root:

```sh
bun test tests/physics.test.cjs
bun tests/browser.cjs
bun tests/media.cjs
bun tests/round.cjs
bun tests/rebounds.cjs
bun tests/performance.cjs
bun tests/install.cjs
bun tests/docs.cjs
python3 -B -m unittest discover -s tests -p 'test_*.py'
bun tests/api.cjs
```

The browser checks need Playwright available to the test runner, use the installed
Chrome binary, and save screenshots under `/tmp`. The documentation check covers
the E2EE help anchor, current configuration, and desktop/mobile overflow.

## Refresh product media

The carousel and walkthrough show real application screens with synthetic notes.
`assets/capture.json` records screenshot provenance; `assets/workflows.json` records
the single video's provenance, measured duration, chapter times, and capture checks.
Keep the app release source clean when capturing; never use a personal notes directory.

The capture scripts build the supplied app source, start a temporary server on a
free local port with a disposable database/notes directory, and stop it afterward.
They do not contact the public demo. Go, Chrome, FFmpeg, uv, and Python are required:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/vylk-capture-tools uv run --with playwright python3 -m playwright install ffmpeg
PLAYWRIGHT_BROWSERS_PATH=/tmp/vylk-capture-tools uv run --with playwright python3 scripts/capture_media.py --source ../vylk --output assets
PLAYWRIGHT_BROWSERS_PATH=/tmp/vylk-capture-tools uv run --with playwright python3 scripts/capture_workflows.py --source ../vylk --output .impeccable/media/walkthrough-originals
uv run --with playwright python3 scripts/frame_workflows.py --source .impeccable/media/walkthrough-originals --output assets
bun tests/media.cjs
```

The walkthrough is one continuous session in one instance with mixed planning,
fiction, reading, and personal notes. Real dashboard tag clicks find relevant notes.
It demonstrates preview tasks and dragging, the pencil edit, a linked groceries
note, Newsreader preferences, Zen writing, and Scratchpad sync to a separate phone
session. The phone view joins the framing during the sharing section.

Offline capture disconnects the desktop context while the phone stays online.
The recorder verifies the edit has not reached the server, reloads the desktop
through its real service worker, checks the retained local text, then reconnects
and waits for the phone to receive it. No offline state or sync response is mocked.

UI, preview, and Zen begin with Inter, and source editing uses JetBrains Mono.
During writing, preview changes to Google Newsreader Large (110%) and Zen to
Newsreader Larger (125%). Fonts are verified; capture needs Google's font servers.
The real font-size selects opt into Chrome's `appearance: base-select` only during
capture so their actual options render inside the recorded page. Selection uses
those real option elements and normal change events. This presentation workaround
and the cursor overlay do not change the application source or preference behavior.

Pointer movement follows timed curves with acceleration and deceleration, deliberate
vertical drags, visible presses, and varied typing/reading pauses. The cursor changes
from an arrow to an open/closed hand over drag handles and during dragging. Variation
is seeded. Sample note titles and content cannot contain em dashes.

Use `--pace 0.12` to rehearse; capture final originals at the default pace. Raw desktop
and phone WebM files and timeline metadata are preserved even if an action check
fails. The processor requires a successful capture, applies 1.5× speed equally to
both devices, and produces one roughly two-minute 1920×1080 H.264 movie with fast-start
metadata and no audio. It renders the approved gradient, macOS-style window and Dock
without a menu bar, plus a notchless phone aligned to the desktop window's height.
`scripts/media-frame.html` owns the frames; browser-rendered masks retain their corners.
Originals stay in the ignored `.impeccable/media` directory. Posters come from the final
movie. Keep separate source/output directories to preserve the recordings.

The homepage uses native video controls with preload disabled and requires an
action to play. Closing it or hiding the page pauses playback. The video remains
available without JavaScript.

## Product documentation

The application source is the authority for feature and security claims. Keep
`docs/index.html` and the homepage aligned with it when releasing app changes.
The app's encryption help links target `/docs/#end-to-end-encryption`; keep that
anchor stable. E2EE covers note titles, tags, bodies, and offline edits, but does
not hide all metadata or protect against a compromised server replacing the
browser application. HTTPS is required on remote devices; localhost is the
local-development exception. Do not advertise the removed server-side file
encryption or its environment variables.

## Releases

`./build.sh` also generates `/releases/` from the application's root
`releases.md`. Descriptions are copied verbatim from linked release PRs, with
GitHub Release descriptions used where explicitly recorded as the source.
Empty descriptions are omitted. Each entry has a version heading, a `Merged:`
or `Published:` ISO date, a `Source:` Markdown link, then the original body.
Keep entries unique; their display order is newest version first.

Production builds fetch this curated history from `main` at build time and
include only versions at or below the selected stable release. This lets older
release descriptions be added without changing their tags. API docs still come
from the exact release tag. For previews, `VYLK_API_SOURCE` supplies both the API
docs and `releases.md` from the local checkout. No GitHub requests run in visitors'
browsers. Publish `releases.md` on application `main` before deploying this build.

The renderer supports the source descriptions' headings, paragraphs, flat lists,
inline code, bold text, Markdown links, and bare HTTP(S) URLs. HTML is escaped.
Missing history, invalid metadata, duplicate versions, and unsupported Markdown
blocks fail the build before the previous output is replaced.

The Releases page hides PR dates/source metadata, generic Changes headings, and
previous-release introductions while preserving the original `releases.md`.
The homepage banner links to the newest included version, marked Latest.
