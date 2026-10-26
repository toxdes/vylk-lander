# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

independent static HTML, CSS, and JavaScript in this repository, deployed separately from the Go application

## Users

People who want a private, self-hosted place to write and organize their own Markdown notes across desktop and mobile devices. Shared notes and team collaboration are not supported.

## Product Purpose

Inferred from the project brief and README: vylk is a lightweight Markdown files editor that lets people write, preview, search/filter, and sync notes from a self-owned deployment. Success means a visitor quickly understands that vylk is a small, capable, privacy-conscious alternative to hosted note-taking tools and can move to the repository or start a deployment.

## Positioning

The application repository's durable mechanism: a low-resource single Go binary, live and interactive Markdown preview, Zen writing, and offline-first PWA sync. Optional E2EE encrypts note titles, tags, bodies, and offline edits in the browser; server-side file encryption has been removed.

## Operating Context

Self-hosted on a user's machine, server, or container. Configuration is done through environment variables; the application README documents packages, direct binaries, source builds, and the published runtime Docker image. Without E2EE, notes live as Markdown files with SQLite metadata. With E2EE, files hold ciphertext and SQLite holds encrypted titles/tags, key wrappers, and non-secret sync metadata. The app supports browser installation and offline editing after an initial signed-in session.

## Capabilities and Constraints

- Live Markdown preview with cursor-position block highlighting.
- Formatting toolbar, resizable split view, interactive preview, Zen editor/reading views, tags, autosave, manual save, custom themes/fonts, and responsive mobile layout.
- Session authentication, browser-profile device management, and optional E2EE with a vault passphrase and 24-word recovery key. Refreshes and tabs reuse the remembered browser unlock; sign-out forgets that key and retains encrypted pending edits.
- E2EE requires HTTPS on remote devices or localhost on the host machine. The server password supports `VYLK_PASSWORD_FILE`; E2EE secrets are entered only in the browser.
- Back up the database and notes directory together. A replacement database pauses sync if pending or unresolved local edits exist; those edits are not silently uploaded or discarded.
- `VYLK_DISABLE_VAULT_CHANGES=true` rejects vault setup, credential changes, resets, and device revocation on shared demos without disabling normal notes or an already-encrypted vault.
- E2EE does not hide IDs, timestamps, pin state, preferences, or sync timing. A compromised server can replace the app to steal secrets; credential changes do not rotate the vault key, and ciphertext rollback detection is not provided.
- Installable PWA with offline note editing and synchronization on reconnection, including conflict resolution for ambiguous overlapping edits.
- Raw HTML is treated as text; links are limited to HTTP, HTTPS, and mailto; remote images are HTTP/HTTPS only.
- The lander version is fetched from the public application repository only during the Cloudflare Pages build and is baked into the generated site; visitors do not fetch release metadata.
- Claims about benchmarks, team collaboration, hosting, customers, pricing, and testimonials remain undecided and must not be fabricated.

## Brand Commitments

The product name is `vylk`. Preserve the supplied mark, served as `assets/vylk-logo.webp`. The current lander has its own paper-light palette: `#f4f5f3`, `#151719`, `#5c6265`, `#cfd3d1`, `#ae2448`, `#871d39`, and `#dce2df`. It does not inherit the app's dark theme. Preserve the existing visual world when updating features or docs.

## Evidence on Hand

- The application repository's `README.md` and implementation document features, security, offline behavior, builds, tests, and Docker usage; this repository's `README.md` documents the independent static site's build and checks.
- `assets/vylk-logo.webp` is the served product mark; `assets/vylk-*-{desktop,mobile}.webp` contains the app preview captures.
- The application repository's `internal/web/static/js/ui/themes.js` and `frontend/styles` define app themes and styling; lander visuals remain independently authored here.
- No testimonials, customer logos, usage metrics, or third-party endorsements are supplied.

## Product Principles

- Keep notes owned by the person running the software.
- Make the useful path small: one binary, a simple configuration surface, and Markdown files.
- Show capability through the editor workflow, not inflated claims.
- Treat offline work as a core workflow and E2EE as an explicit opt-in with understandable recovery and HTTPS requirements.

## Accessibility & Inclusion

The landing page should preserve keyboard access, visible focus, readable contrast, reduced-motion support, responsive layouts, semantic headings, and text alternatives for imagery. No product-specific accessibility standard was established.
