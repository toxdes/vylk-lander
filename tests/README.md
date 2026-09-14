# Landing-page interaction checks

The landing page is standalone: serve this directory as static files or open
`index.html`. The deployment build is optional for local testing and writes a
version-aware site to `dist/`.

To prepare the Cloudflare Pages output locally, run `./build.sh`. It reads the
public application `VERSION` file during the build and writes `dist/version.js`.
Set `VYLK_VERSION` to use a local version without a network request.

From the lander repository root:

```sh
node --test tests/physics.test.cjs
node tests/browser.cjs
node tests/round.cjs
node tests/rebounds.cjs
node tests/install.cjs
```

Browser checks use the repository's Playwright dependency and Chrome at
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
uses the runtime image and persistent `/data` volume. Windows ZIP links are
generated using the release naming convention; macOS currently documents the
source build until the Homebrew tap is published.
