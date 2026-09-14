---
name: vylk landing page
description: A quiet, editorial dark surface for keeping personal notes close.
colors:
  ink-bg: "#0e1124"
  ink-text: "#cfd1fc"
  muted-text: "#a1a4cb"
  line: "#1e293b"
  accent: "#f13c66"
  accent-hover: "#d42e55"
  accent-text: "#ff718f"
  surface: "#1a1d31"
  success: "#55d58a"
  warning: "#f5b84b"
typography:
  display:
    fontFamily: "Rubik"
    fontSize: "clamp(4.1rem, 8vw, 7.5rem)"
    fontWeight: 690
    lineHeight: 0.98
    letterSpacing: "-0.035em"
  italic-accent:
    fontFamily: "Rubik"
    fontSize: "inherit"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Rubik"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Rubik"
    fontSize: "0.72rem"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0.1em"
rounded:
  sm: "5px"
  md: "7px"
  lg: "15px"
spacing:
  sm: "0.5rem"
  md: "1rem"
  lg: "2rem"
  section: "clamp(8rem, 15vw, 13rem)"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-bg}"
    rounded: "{rounded.md}"
    padding: "0.78rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.ink-bg}"
    rounded: "{rounded.md}"
  surface-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.sm}"
    padding: "1.6rem"
---

# Design System: vylk landing page

## Overview

**Creative North Star: "The Private Desk."**

The lander treats vylk like a well-kept desk: dark, quiet, tactile, and made for returning to. Large Rubik headlines carry the confidence; a restrained Rubik italic marks the human part of the message. The app is shown doing its job in the first viewport, so the visual world stays connected to the product rather than becoming abstract SaaS decoration.

The palette is taken from vylk's Default Dark theme. The landing page adds only an accessible brighter accent tint for text-size pink labels; surfaces, borders, and primary pink remain faithful to the app.

**Key Characteristics:**

- Editorial scale with a quiet dark field and rare pink emphasis.
- Real app write/preview screenshot as the hero's proof object.
- Fine borders, restrained shadows, and clear command blocks for setup moments.
- Plain-language copy for non-technical visitors.

## Colors

Deep blue-purple surfaces make the page feel private and focused; pink is a deliberate signal for action and human emphasis, not a general wash.

### Primary

- **Vylk Pink** (#f13c66): Primary action background, marks, and focused highlights.
- **Readable Pink** (#ff718f): Pink type on dark surfaces where the Default Dark accent needs a contrast lift.

### Neutral

- **Night Ink** (#0e1124): Page background and primary button text.
- **Notebook Surface** (#1a1d31): Panels and elevated content blocks.
- **Paper Text** (#cfd1fc): Headings and primary content.
- **Quiet Ink** (#a1a4cb): Body copy and supporting details.
- **Notebook Line** (#1e293b): Borders, rules, and dividers.
- **Saved Green** (#55d58a): Saved/in-sync status in the product preview.

### Named Rules

**The Quiet Accent Rule.** Pink is rare enough to direct attention: action buttons, emphasis, and small status moments only.

## Typography

**Display Font:** Rubik from Google Fonts

**Body Font:** Rubik from Google Fonts

**Label Font:** Rubik from Google Fonts

**Code Font:** JetBrains Mono from Google Fonts, used only inside commands and code blocks.

**Character:** Rubik keeps the lander friendly, clear, and consistent. Italic Rubik provides the warmer voice for words such as "close," "home," and "useful."

The sticky-note game uses Caveat from Google Fonts for its handwritten note voice. It is limited to the note illustration and is not used for navigation, instructions, or body copy.

### Hierarchy

- **Display** (690, `clamp(4.1rem, 8vw, 7.5rem)`, `.98): Hero thesis and closing statement.
- **Headline** (670, `clamp(2.8rem, 5vw, 5.2rem)`, `.98): Section statements.
- **Title** (680, `1.45rem-2rem`, `.98): Workflow and setup titles.
- **Body** (400, `1rem`, `1.5-1.8`): Explanatory copy with a comfortable measure.
- **Label** (700, `.72rem`, `.1em`, uppercase): Navigation, setup state, and small UI context.

## Layout

The page uses a fluid `1180px` content cap and a generous vertical rhythm. The hero is a two-column composition with the promise on the left and the working product preview on the right. Later sections alternate between split reading layouts, a three-part workflow board, a privacy panel, and a two-column setup panel.

At `900px` the page becomes a single column; at `680px` navigation becomes a compact menu, cards stack, and the app preview remains readable inside the viewport. The first viewport is intentionally spacious; the scroll rule invites the visitor into the longer story.

## Elevation & Depth

Depth is mostly tonal: the page background, notebook surface, and inset app preview do most of the work. Shadows are neutral black and short, used to separate the hero preview, setup console, and closing mark from the background. Pink glow is not used as a structural shadow.

### Shadow Vocabulary

- **Preview lift** (`0 20px 24px rgba(0,0,0,.3)`): separates the hero app preview from the page.
- **Panel lift** (`0 18px 22px rgba(0,0,0,.24)`): gives the privacy console a little weight.
- **Action lift** (`0 12px 22px rgba(0,0,0,.25)`): separates the primary CTA without changing its color.

## Shapes

Small controls use 5-7px corners; larger app and mark silhouettes use 15-19px corners. Borders are 1px and quiet. The visual language favors framed panels and inset surfaces over rounded card stacks or floating glass.

## Components

### Buttons

- **Shape:** compact 7px corners.
- **Primary:** Vylk Pink background, Night Ink text, `.78rem 1rem` padding.
- **Hover / Focus:** darker pink hover state, short upward motion, and a visible high-contrast focus ring.
- **Secondary:** text links use Paper Text with an underline and a small directional arrow.

### Cards / Containers

- **Corner Style:** 5px for panels, 15px for the hero app frame.
- **Background:** Notebook Surface or the deeper `#101329` console surface.
- **Shadow Strategy:** short neutral shadows only; refer to Elevation & Depth.
- **Border:** 1px Notebook Line.
- **Internal Padding:** 1rem for compact UI and 1.4-1.6rem for section panels.

### Navigation

Desktop navigation is a quiet inline row with one outlined GitHub action. On mobile it becomes an anchored menu panel with full-width links and the GitHub action at the bottom.

### Product Preview

The hero preview is a framed write/preview split with a note list, lightweight toolbar, saved status, and small callouts. It is an authored proof object, not a generic dashboard card.

## Do's and Don'ts

### Do:

- **Do** show vylk doing the work within the first viewport.
- **Do** explain ownership, offline work, encryption, and setup in everyday language before introducing terminal commands.
- **Do** preserve the Default Dark palette and use the brighter pink tint only where text contrast needs it.
- **Do** keep the page light enough to deploy independently; the deployment build resolves the application version once and the published site has no release-metadata request.

### Don't:

- **Don't** invent testimonials, customer logos, usage numbers, pricing tiers, or performance benchmarks.
- **Don't** turn the page into a generic feature-card grid or an abstract "AI SaaS" hero.
- **Don't** use the pink accent as a background wash or colored shadow system.
- **Don't** rely on technical vocabulary without explaining it for a first-time visitor.
