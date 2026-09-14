# VYLK lander

The VYLK lander is an independent static website for the self-hosted Markdown
notes app. It contains the landing page, installation guidance, and detailed
documentation without requiring a running VYLK server.

## Local preview

Open `index.html` directly, or serve the repository with any static file
server. The local `version.js` fallback currently contains the checked-out
application version so the install links work during development.

## Cloudflare Pages

Use the repository root as the Pages project directory:

- Build command: `./build.sh`
- Output directory: `dist`

The build fetches the public application version from:

```text
https://raw.githubusercontent.com/toxdes/vylk/main/VERSION
```

It writes the result to `dist/version.js`. The generated site uses that value
for release links and Docker examples. The deployed site does not fetch the
version or release metadata when visitors open it.

Set `VYLK_VERSION_URL` when using another public version source. Set
`VYLK_VERSION` for an offline or reproducible local build.

## Checks

From this repository root:

```sh
node --test tests/physics.test.cjs
node tests/browser.cjs
node tests/round.cjs
node tests/rebounds.cjs
node tests/install.cjs
```

The browser checks use the installed Chrome binary and save screenshots under
`/tmp`.
