# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

independent static HTML, CSS, and JavaScript in this repository, deployed separately from the Go application

## Users

Inferred from the project brief and README: people who want a private, self-hosted place to write and organize Markdown notes, including developers, homelab operators, and small teams managing their own server.

## Product Purpose

Inferred from the project brief and README: vylk is a lightweight Markdown files editor that lets people write, preview, search/filter, and sync notes from a self-owned deployment. Success means a visitor quickly understands that vylk is a small, capable, privacy-conscious alternative to hosted note-taking tools and can move to the repository or start a deployment.

## Positioning

The application repository's durable mechanism: a low-resource single binary with SQLite metadata, optional AES-256-GCM file encryption, a live Markdown preview, and offline-first PWA behavior with synchronization after reconnection.

## Operating Context

Self-hosted on a user's machine, server, or container. Configuration is done through environment variables; the application README documents packages, direct binaries, source builds, and the published runtime Docker image. Notes live as Markdown files, with SQLite used for metadata. The app supports browser installation and offline editing after an initial signed-in session.

## Capabilities and Constraints

- Live Markdown preview with cursor-position block highlighting.
- Formatting toolbar, fullscreen editor/preview, tags, autosave, manual save, and responsive mobile layout.
- Session authentication, optional versioned AES-256-GCM encryption at rest, and secrets via environment variables or `_FILE` variants.
- Installable PWA with offline note editing and synchronization on reconnection, including conflict resolution for ambiguous overlapping edits.
- Raw HTML is treated as text; links are limited to HTTP, HTTPS, and mailto; remote images are HTTP/HTTPS only.
- The lander version is fetched from the public application repository only during the Cloudflare Pages build and is baked into the generated site; visitors do not fetch release metadata.
- Claims about benchmarks, team collaboration, hosting, customers, pricing, and testimonials remain undecided and must not be fabricated.

## Brand Commitments

The product name is `vylk`. Preserve the supplied `logo.png`. Use the app's Default Dark palette as the landing page's color source: `#0e1124`, `#cfd1fc`, `#7c7fa8`, `#1e293b`, `#f13c66`, `#d42e55`, and `#1a1d31`.

## Evidence on Hand

- `README.md` documents the product description, feature list, security model, offline behavior, build workflow, tests, and Docker usage.
- `logo.png` is the supplied product mark.
- `static/themes.js` and `static/style.css` define the Default Dark theme values.
- `LICENSE` is present. No testimonials, customer logos, usage metrics, or third-party endorsements are supplied.

## Product Principles

- Keep notes owned by the person running the software.
- Make the useful path small: one binary, a simple configuration surface, and Markdown files.
- Show capability through the editor workflow, not inflated claims.
- Treat offline work and encryption as practical defaults for self-hosted use.

## Accessibility & Inclusion

The landing page should preserve keyboard access, visible focus, readable contrast, reduced-motion support, responsive layouts, semantic headings, and text alternatives for imagery. No product-specific accessibility standard was established.
