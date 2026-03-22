# Design System: The Technical Peloton

> Based on the [Stitch reference](design-system-stitch-reference.md), adapted for our implementation.
> Source of truth for token values: `apps/web/src/styles/app.css`

## Creative North Star

**"The Technical Peloton"** — a high-end, editorial sports-science interface. Data-dense, authoritative, fast. The aesthetic is **Kinetic Precision**: heavy numeric data against sophisticated typography, with overlapping depth and a "No-Line" philosophy.

## Theme: Dark Only (v1)

The current implementation is dark-theme only. Light theme is deferred to a future iteration. The `@custom-variant dark` mechanism is preserved in CSS for future use.

---

## Colors

### Surface Hierarchy

Treat the UI as physical layers. Depth guides the eye from base to interactive elements.

| Layer   | Token                       | Hex       | Usage                                  |
| ------- | --------------------------- | --------- | -------------------------------------- |
| Base    | `surface-dim`               | `#0b1326` | Page background — "the asphalt"        |
| Lowest  | `surface-container-lowest`  | `#060e20` | Deepest recessed areas                 |
| Low     | `surface-container-low`     | `#131b2e` | Cards, large structural sections       |
| Default | `surface-container`         | `#171f33` | Standard containers                    |
| High    | `surface-container-high`    | `#222a3d` | Interactive cards, inputs, data groups |
| Highest | `surface-container-highest` | `#2d3449` | Hover states, progress bar tracks      |
| Bright  | `surface-bright`            | `#31394d` | Modals, floating tooltips              |

### Text Colors

| Token                  | Hex       | Usage                                    |
| ---------------------- | --------- | ---------------------------------------- |
| `on-surface`           | `#dae2fd` | Primary text                             |
| `on-surface-variant`   | `#c5c6cd` | Secondary/muted text                     |
| `on-primary-container` | `#8590a6` | Tertiary/dimmed labels                   |
| `outline`              | `#8f9097` | Placeholder text, disabled states        |
| `outline-variant`      | `#45474c` | Ghost borders (always at 10-15% opacity) |

### Primary / Secondary / Tertiary

| Token                                 | Hex                   | Usage                                     |
| ------------------------------------- | --------------------- | ----------------------------------------- |
| `primary`                             | `#bcc7de`             | Primary buttons, active indicators        |
| `primary-foreground`                  | `#263143`             | Text on primary backgrounds               |
| `primary-container`                   | `#1e293b`             | CTA gradient end, containers              |
| `primary-fixed` / `primary-fixed-dim` | `#d8e3fb` / `#bcc7de` | CTA gradient start, focus rings           |
| `secondary`                           | `#adc6ff`             | Scores, matched counts, budget bar        |
| `secondary-container`                 | `#0566d9`             | Secondary badge backgrounds               |
| `tertiary`                            | `#eac34a`             | Gold/optimal highlights, projected scores |
| `tertiary-container`                  | `#cca830`             | Tertiary badge backgrounds                |

### Category Colors (Cycling Disciplines)

| Discipline | Token      | Hex       | Tailwind Class                                    |
| ---------- | ---------- | --------- | ------------------------------------------------- |
| GC         | `gc`       | `#3b82f6` | `text-gc`, `bg-gc`, `border-gc`                   |
| Stage      | `stage`    | `#22c55e` | `text-stage`, `bg-stage`, `border-stage`          |
| Mountain   | `mountain` | `#f97316` | `text-mountain`, `bg-mountain`, `border-mountain` |
| Sprint     | `sprint`   | `#ef4444` | `text-sprint`, `bg-sprint`, `border-sprint`       |

### Stage Profile Colors

| Profile                      | Color                      |
| ---------------------------- | -------------------------- |
| P1 (Flat)                    | Green (`green-500`)        |
| P2 (Hilly)                   | Lime (`lime-500`)          |
| P3 (Hilly, uphill finish)    | Amber (`amber-500`)        |
| P4 (Mountain)                | Orange (`orange-500`)      |
| P5 (Mountain, summit finish) | Red (`red-500`)            |
| ITT                          | Blue (`gc` token)          |
| TTT                          | Indigo (`secondary` token) |

### Functional Colors

| Token                   | Hex                           | Usage                           |
| ----------------------- | ----------------------------- | ------------------------------- |
| `destructive` / `error` | `#ffb4ab`                     | Error text, destructive actions |
| `error-container`       | `#93000a`                     | Error backgrounds               |
| Success                 | `green-500` at 10-20% opacity | Success states, analyzed status |

---

## Typography

Three font families, each with a distinct role:

| Family                             | Token             | Class           | Usage                                                            |
| ---------------------------------- | ----------------- | --------------- | ---------------------------------------------------------------- |
| **Manrope** (700, 800)             | `--font-headline` | `font-headline` | Headlines, section titles, CTAs. Bold, wide, editorial.          |
| **Inter** (400, 500, 600)          | `--font-body`     | `font-body`     | UI labels, body text, descriptions. Maximum readability.         |
| **JetBrains Mono** (400, 500, 700) | `--font-mono`     | `font-mono`     | All numeric data: scores, prices, budgets, stats, table headers. |

Loaded from Google Fonts CDN with `display=swap` and `preconnect`.

### Rules

- **Every numeric value** uses `font-mono` — no exceptions.
- **Section labels** use `font-mono text-[10px] uppercase tracking-widest` for the cockpit aesthetic.
- **Headlines** use `font-headline font-extrabold tracking-tight`.
- **Never use Inter for scores** — it lacks the instrument cluster feel.

---

## Border Radius

Sharp, technical corners. Base radius: `0.125rem` (2px).

| Token          | Value                                 | Usage                   |
| -------------- | ------------------------------------- | ----------------------- |
| `rounded-sm`   | ~0.0625rem                            | Buttons, badges, inputs |
| `rounded-md`   | 0.125rem                              | Default                 |
| `rounded-lg`   | 0.25rem                               | Larger containers       |
| `rounded-full` | For dots and circular indicators only |

**Never use `rounded-xl` or larger** for UI elements. Reserve `rounded-full` for status indicator dots and avatar circles only.

---

## The "No-Line" Philosophy

**1px solid borders are prohibited for section separation.** Structural definition uses:

1. **Tonal Shifts** — place `surface-container-high` against `surface-container-low`
2. **Spacing** — use `gap-6` or larger between functional groups
3. **Soft Shadows** — `shadow-sm shadow-black/20` for floating elements

### Ghost Border Fallback

When a divider is mandatory (e.g., table rows), use `outline-variant` at **10-15% opacity**:

```
border-outline-variant/10   /* table row separators */
border-outline-variant/15   /* card/panel borders */
```

---

## Key Components

### Navigation Bar

Glassmorphism: `bg-surface-dim/70 backdrop-blur-md`. Fixed top, `h-16`. Title in `font-headline font-black uppercase italic`.

### Inputs

`bg-surface-container-high border-none rounded-sm`. Focus: `ring-1 ring-primary-fixed`. Placeholder: `text-outline/40`.

### Buttons

- **Default**: `bg-primary text-primary-foreground rounded-sm`
- **CTA**: `bg-gradient-to-br from-primary-fixed-dim to-primary-container` (metallic finish)
- **Ghost**: `hover:bg-surface-container-high text-on-surface`

### Data Tables

- No vertical lines. Horizontal ghost borders (`divide-outline-variant/10`).
- Header: `bg-surface-container-high/50 text-[10px] font-mono uppercase tracking-wider`.
- Row hover: `bg-surface-container-high/50`.
- Excluded rows: `opacity-40 grayscale`.

### Badges

Sharp corners (`rounded-sm`), monospace font. Category variants: `gc`, `stage`, `mountain`, `sprint`. Score badges color-coded by ratio (top 25% green, middle 50% amber, bottom 25% red).

### Budget Indicator

Track: `bg-surface-container-highest rounded-full`. Bar: `bg-gradient-to-r from-secondary to-blue-400`. Over-budget: `bg-error animate-pulse`.

---

## Do's and Don'ts

### Do

- Use `font-mono` for every numeric value
- Use tonal shifts to separate sections
- Use `tracking-widest uppercase text-[10px] font-mono` for section labels
- Use high-contrast type scales (e.g., `text-5xl font-headline` score next to `text-[10px] font-mono` label)

### Don't

- Use 1px opaque borders to separate content
- Use `rounded-md` or `rounded-lg` for buttons — keep `rounded-sm`
- Use shadows on every card — reserve for floating elements
- Use Inter for scores — always JetBrains Mono
- Hardcode hex values in components — always reference design tokens
