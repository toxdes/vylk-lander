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
bun tests/round.cjs
bun tests/rebounds.cjs
bun tests/install.cjs
bun tests/docs.cjs
python3 -B -m unittest discover -s tests -p 'test_*.py'
bun tests/api.cjs
```

The browser checks need Playwright available to the test runner, use the installed
Chrome binary, and save screenshots under `/tmp`. The documentation check covers
the E2EE help anchor, current configuration, and desktop/mobile overflow.

## Product documentation

The application source is the authority for feature and security claims. Keep
`docs/index.html` and the homepage aligned with it when releasing app changes.
The app's encryption help links target `/docs/#end-to-end-encryption`; keep that
anchor stable. E2EE covers note titles, tags, bodies, and offline edits, but does
not hide all metadata or protect against a compromised server replacing the
browser application. HTTPS is required on remote devices; localhost is the
local-development exception. Do not advertise the removed server-side file
encryption or its environment variables.
