# Landing-page interaction checks

The landing page is standalone: serve this directory as static files or open
`index.html`. The deployment build is optional for local testing and writes a
version-aware site to `dist/`.

To prepare Cloudflare Pages output, run `./build.sh`. It selects the latest stable
release, then fetches VERSION and API documentation from that release's tag.
`VYLK_VERSION` selects a release explicitly but still downloads its docs.
For an offline preview, also set `VYLK_API_SOURCE` to a local VYLK checkout with
the same VERSION. Generated documentation and `dist/version.js` remain untracked.

From the lander repository root:

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

Browser checks require Playwright available to the test runner and Chrome at
`/usr/bin/google-chrome`. They cover desktop mouse input, mobile touch with 4x
CPU throttling, arrow rest/hover states, accurate flight without a landing hint, misses,
keyboard cancellation, ball collisions, bin visibility, and a complete round
including confetti and automatic reset, floor/wall bank shots, and catches by
balls knocked loose by another ball. Screenshots are saved under `/tmp`.

## Implementation

- `physics.js`: fixed-step gravity, collision response, and trajectory prediction.
- `game.js`: pointer/keyboard input, note states, DOM rendering, and celebrations.
- `interactions.css`: game and CTA motion. Keep arrow rules here rather than
  adding overrides to `style.css`.
- `script.js`: installation choices and copy buttons.
- `install.css`: landing-page setup layout.

There is no visible trajectory or landing marker, just a pull-back tether.
The lid's internal lookahead clones the live physics state of every ball. Active
balls render in viewport coordinates outside the notes' scaling and rotation.
The bin hitbox is stable; its artwork animates independently. Resting paper
balls wake when hit and exchange momentum with the moving ball. Every moving
ball can score, including after rebounds or after the original shot has ended.

Animations use bounded transform/opacity effects. Reduced motion removes
decorative bursts and entrance movement while preserving the interactive
trajectory. Scroll, resize, pointer cancellation, and a hidden document return
active throws to their starting positions.

Installation content is based on the application repository's README.md,
build.py, Dockerfile.runtime, and release.toml. The published Docker example
uses the runtime image and persistent `/data` volume. Windows executable and
macOS ZIP links use the release naming conventions. Homebrew uses the published
Toxdes tap; macOS also documents binary, source, and Docker options.

`docs.cjs` verifies the E2EE anchor used by app help links, current configuration,
security/recovery guidance, and desktop/mobile document layout. No live app or
external deployment is required. Screenshots are written under `/tmp`.

`api.cjs` requires a successful build. It checks every API operation, shared
typography and colors, keyboard navigation, and desktop/mobile overflow.
Python tests cover rendering, escaping, release selection, and failed builds.
