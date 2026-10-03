---
name: vylk landing page
description: A paper-light editorial surface for a personal, self-hosted notebook.
colors:
  paper: "#f4f5f3"
  ink: "#151719"
  muted: "#5c6265"
  line: "#cfd3d1"
  accent: "#ae2448"
  accent-hover: "#871d39"
  stage: "#dce2df"
  code: "#1b1d1e"
typography:
  display:
    fontFamily: "Rubik"
    fontWeight: 600
  body:
    fontFamily: "Rubik"
    fontSize: "1rem"
    lineHeight: 1.6
  code:
    fontFamily: "JetBrains Mono"
  notes:
    fontFamily: "Caveat"
---

# Design system: vylk lander

This documents the current static site, not the app's theme. The homepage and
docs use a light paper background, dark ink, and a restrained burgundy accent.
The older dark-lander's palette and layout are no longer the visual authority.
Use the shipped HTML/CSS and current screenshots for exact dimensions.

## Homepage

The homepage is a spacious editorial introduction. A large Rubik headline and
plain-language promise sit beside handwritten feature notes. Those notes also
support the existing playful paper-ball interaction. Keep Caveat confined to
that illustration; navigation, feature explanations, and setup use Rubik.

Real desktop/mobile app screenshots appear in a separate carousel below the
hero. The feature section pairs a large heading with ruled rows rather than
feature cards. The installation section uses a dark command surface, platform
and method tabs, processor-specific downloads, and copy buttons. The closing
statement uses a solid burgundy background and white text.

The shared demo opens through a notice describing its temporary, public nature.
It is not a place for private notes, and vault changes are disabled there.

## Documentation

The docs share the paper/ink palette and Rubik typography. Desktop has a sticky
section outline beside a reading column. On smaller screens the outline wraps
above the article. Installation commands use JetBrains Mono and copy buttons;
configuration tables scroll inside their own wrapper. Inline code must wrap
when needed rather than widening the page.

The `end-to-end-encryption` section is the stable destination for app help
links. Put secure-context requirements and sign-in troubleshooting first,
followed by setup, recovery, remembered browsers, devices, and security limits.
Preserve the `security` anchor for backup and upgrade guidance.

## Ownership and guardrails

- Preserve the incumbent layout and interactions when updating product copy.
- Keep feature and security claims consistent with the application source.
  E2EE is optional; do not imply it protects against a compromised live app,
  hides all metadata, or supports plain HTTP on remote devices.
- Do not invent benchmarks, customers, testimonials, collaboration, or releases.
- Preserve keyboard access, visible focus, readable contrast, responsive
  behavior, accessible headings, and reduced-motion support.
- Keep text links discoverable; controls and command copy buttons remain
  recognizably interactive. Check long feature text and inline code on mobile.
- Author visuals in `style.css`, `interactions.css`, `install.css`, `mobile.css`,
  and `docs/{style,setup}.css`; do not edit generated `dist` output.
- The site stays independent of a running VYLK server. Resolve release versions
  at build time, not through requests from each visitor's browser.
