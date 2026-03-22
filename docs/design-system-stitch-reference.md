# Design System Strategy: The Performance Engine

## 1. Overview & Creative North Star

The Creative North Star for this design system is **"The Technical Peloton."**

In elite cycling, performance is a marriage of raw human power and surgical engineering. This system must reflect that duality. We are moving away from the "generic SaaS dashboard" and toward a high-end, editorial sports-science interface. The aesthetic is characterized by **Kinetic Precision**: a layout that feels fast, data-dense, and authoritative.

We break the "template" look by using intentional asymmetry—placing heavy numeric data (the "Engine") against airy, sophisticated typography (the "Director"). We use overlapping depth and a "No-Line" philosophy to ensure the app feels like a singular, integrated piece of carbon-fiber machinery rather than a collection of disparate boxes.

---

## 2. Colors & Surface Philosophy

The palette is anchored in stability but punctuated by high-chroma performance signals.

### The "No-Line" Rule

To achieve a premium, custom feel, **1px solid borders are strictly prohibited** for sectioning. Structural definition must be achieved through:

- **Tonal Shifts:** Placing a `surface-container-high` element against a `surface-container-low` background.
- **Negative Space:** Using the Spacing Scale (specifically `spacing-8` or `spacing-10`) to create air between functional groups.
- **Soft Shadows:** Using the `on-surface` color at 4% opacity to lift a container subtly.

### Surface Hierarchy & Nesting

Treat the UI as a series of physical layers. Use the Material Design surface tokens to create a "nested" depth that guides the eye:

1.  **Base Layer:** `surface-dim` (#0b1326) – The asphalt.
2.  **Section Layer:** `surface-container-low` (#131b2e) – Large structural areas.
3.  **Action Layer:** `surface-container-high` (#222a3d) – Interactive cards or data groups.
4.  **Highlight Layer:** `surface-bright` (#31394d) – Modals or floating tooltips.

### The "Glass & Gradient" Rule

For top-level navigation and floating "Optimal" selection bars, use **Glassmorphism**. Apply `surface-container-highest` at 70% opacity with a `20px` backdrop-blur.
Main CTAs (like "Optimize Lineup") should not be flat; use a subtle linear gradient from `primary` (#bcc7de) to `primary-container` (#1e293b) at a 135-degree angle to provide a "metallic" finish consistent with professional cycling gear.

---

## 3. Typography: The Editorial Edge

The typography system balances the elegance of a sports broadsheet with the utility of a cockpit.

- **Display & Headlines:** Uses **Manrope**. This is our "Editorial" voice. It’s wide, modern, and high-end. Use `display-md` for major scores or titles to create a sense of scale.
- **UI & Labels:** Uses **Inter**. This is our "Functional" voice. It provides maximum readability at small sizes within dense tables.
- **Data & Numerics:** Uses **JetBrains Mono**. All scores (GC, Stage, Sprint), times, and budget numbers must use this monospace face. This ensures that columns of numbers align perfectly, allowing the user’s eye to scan vertical data sets without friction.

---

## 4. Elevation & Depth

Depth is a functional tool, not a decoration.

- **Tonal Layering:** Instead of a drop shadow, a "Locked" rider card should simply transition from `surface-container-low` to `surface-container-highest`.
- **Ambient Shadows:** For floating elements (e.g., a rider detail flyout), use a shadow with a 32px blur, 0px offset, and 6% opacity of `on-surface`. It should feel like an atmospheric glow rather than a harsh shadow.
- **The "Ghost Border" Fallback:** If a divider is mandatory for accessibility in high-density tables, use `outline-variant` (#45474c) at **15% opacity**. It should be barely perceptible—a "whisper" of a line.

---

## 5. Components

### High-Density Data Tables

- **The Rule:** No vertical lines. Horizontal lines use "Ghost Borders."
- **Typography:** Header cells use `label-sm` in all-caps with 0.05em letter spacing. Body cells use `body-md` (Inter) for names and `body-md` (JetBrains Mono) for stats.
- **Row States:** On hover, change the background to `surface-container-highest`.

### Status Badges & Scores

- **Construction:** Use `rounded-sm` (0.125rem) for a sharp, technical look.
- **Color Mapping:**
  - **GC Score:** Blue (#3B82F6) text on `secondary-container` background.
  - **Optimal/Gold:** #D4AF37 background with `on-primary-fixed` text.
- **Monospace Integration:** All numeric values within badges must be JetBrains Mono.

### Progress Bars (Budget)

- **Track:** `surface-container-highest`.
- **Indicator:** `primary` gradient. If over budget, the indicator must shift to `danger` (#EF4444) using a pulse animation (0.5s ease-in-out).

### Rider Cards

- **Structure:** Avoid "Border-Box" styling. Use a `surface-container-high` background.
- **Visual Soul:** Use a subtle background gradient (5% opacity) of the rider’s primary score color (e.g., a Sprint specialist gets a faint Red/Sprint Score glow in the top right corner of the card).

### Buttons

- **Primary:** `primary-fixed` background, `on-primary-fixed` text. Sharp corners (`rounded-sm`).
- **Tertiary/Ghost:** No background or border. Use `primary` text. On hover, apply `surface-container-low`.

---

## 6. Do's and Don'ts

### Do

- **DO** use Monospace for every single numeric value.
- **DO** use `spacing-1` and `spacing-2` for micro-adjustments in dense data views.
- **DO** use "surface-nesting" to separate the sidebar from the main optimization stage.
- **DO** use high-contrast type scales (e.g., a `display-lg` score next to a `label-sm` unit).

### Don't

- **DON'T** use 100% opaque borders to separate content.
- **DON'T** use standard rounded corners (`md` or `lg`) for buttons—keep them `sm` to maintain the "pro-sports" technical edge.
- **DON'T** use shadows on every card. Reserve elevation for elements that actually "float" (modals, dropdowns).
- **DON'T** use Inter for scores; it lacks the "instrument cluster" feel of JetBrains Mono.
