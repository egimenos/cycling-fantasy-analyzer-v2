# Research: Stage Profile Enrichment

**Feature**: 002-stage-profile-enrichment
**Date**: 2026-03-19
**Status**: Complete

---

## Research Questions

1. What PCS HTML structures contain stage profile data and how to extract it?
2. How are ITT/TTT stages identified in PCS pages?
3. Where is ProfileScore located and what is its format?
4. How do classic (one-day) races differ from stage races for profile extraction?
5. How to handle future classics that have no result page yet?

---

## Findings

### RQ1 — PCS Stage Profile Data Extraction

PCS uses exactly **5 parcours type icons** represented as CSS classes on `<span>` elements:

| CSS Class | Type                     | Description              |
| --------- | ------------------------ | ------------------------ |
| `p1`      | Flat                     | Flat stage               |
| `p2`      | Hills, flat finish       | Hilly with flat finish   |
| `p3`      | Hills, uphill finish     | Hilly with uphill finish |
| `p4`      | Mountains, flat finish   | Mountainous, flat finish |
| `p5`      | Mountains, uphill finish | Summit finish            |

**Extraction sources:**

1. **Race overview page** (`/race/{slug}/{year}`) — stage list table under `<h4>Stages</h4>`:
   - Profile icon in 3rd column: `<span class="icon profile p{N} mg_rp4 ">`
   - Regex to extract: `/\bp(\d)\b/` on span's class list
   - Also provides: date, day, stage link, distance in km

2. **Individual stage result page** (`/race/{slug}/{year}/stage-{n}`) — sidebar:
   - `Parcours type:` field contains `<span class="icon profile p{N} mg_rp4 ">`
   - Also provides: ProfileScore, distance, departure/arrival, gradient, vertical meters

**Key CSS selector**: `span.icon.profile` → extract `p1`-`p5` from class list.

---

### RQ2 — ITT/TTT Detection

ITT and TTT are identified **only in the stage name text**, not via CSS classes:

- **ITT**: `"Stage 7 (ITT) | Nuits-Saint-Georges - Gevrey-Chambertin"`
- **TTT**: `"Stage 3 (TTT) | Auxerre - Auxerre"`

Regex: `/\(ITT\)/i` and `/\(TTT\)/i` on the stage link text.

Important: The parcours type icon is independent of ITT/TTT. An ITT can have any terrain profile (e.g., TdF 2024 Stage 7 ITT was p1, Stage 21 ITT was p4).

---

### RQ3 — ProfileScore Location and Format

Found in individual stage/race result page sidebar as a key-value list item:

```html
<li>
  <div class="title ">ProfileScore:</div>
  <div class=" value">176</div>
</li>
```

- Selector: `.infolist li` containing title text "ProfileScore"
- Value: Integer (e.g., 176)
- Available on both stage result pages and classic result pages

---

### RQ4 — Classic Race Profile Extraction

One-day classics differ from stage races:

| Aspect                         | Stage Race                                     | Classic                  |
| ------------------------------ | ---------------------------------------------- | ------------------------ |
| Overview page stage list       | YES — table with profile icons                 | NO — no stage list       |
| Individual result page sidebar | YES — per-stage profile                        | YES — race-level profile |
| Data source for profile        | Overview page (bulk) or individual stage pages | Result page sidebar only |

For classics, the profile must be extracted from the result page (`/race/{slug}/{year}/result` or `/race/{slug}/{year}`), not the overview page.

---

### RQ5 — Future Classics Fallback

For a future classic whose result page does not yet exist (e.g., `/race/milano-sanremo/2026`), the system falls back to the most recent previous edition:

- Try `/race/{slug}/{year}/result` → if 404 or no profile data
- Try `/race/{slug}/{year-1}/result` → use this profile as approximation

Rationale: Classics maintain their parcours profile year over year (Milano-Sanremo is always p2 "hills, flat finish", Il Lombardia is always p4/p5, Paris-Roubaix is always p1/p2).

---

## Decisions

| #   | Decision                                                                                               | Rationale                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| D1  | Add 4 nullable columns to `race_results` table: `parcours_type`, `is_itt`, `is_ttt`, `profile_score`   | Follows existing pattern of `stageNumber` (nullable, only relevant for STAGE category). No new table/repository needed. |
| D2  | Extract parcours type from overview page for stage races (bulk), from result page sidebar for classics | Overview page gives all stages in one fetch; classics only have profile on result page                                  |
| D3  | Extract ProfileScore from individual stage/race result page sidebar                                    | Only available on individual pages, not on overview stage list table                                                    |
| D4  | ITT/TTT detected via stage name text regex, not profile icon                                           | Profile icon is terrain type (p1-p5), independent of time trial nature                                                  |
| D5  | New `parcoursTypeEnum` in Drizzle schema with values `p1`, `p2`, `p3`, `p4`, `p5`                      | Matches PCS naming, simple, extensible                                                                                  |
| D6  | New `race-overview.parser.ts` for stage list extraction                                                | Separate concern from existing parsers (which parse result tables, not stage lists)                                     |
| D7  | Shared `profile-extractor.ts` for sidebar profile/ProfileScore extraction                              | Reused by both stage-race parser and classic parser — avoids duplication                                                |
| D8  | New `GET /api/race-profile?url=<pcs-url>` endpoint for frontend                                        | Stateless, ephemeral — no persistence needed for target race profile                                                    |
| D9  | Frontend PCS URL input replaces manual race type selector                                              | Race type auto-detected from URL, one fewer manual step                                                                 |
| D10 | Future classics fall back to previous year's edition                                                   | Classics maintain parcours profile year-over-year                                                                       |

---

## Open Questions / Risks

- **R1 (MEDIUM)**: PCS may change sidebar HTML structure, breaking ProfileScore extraction. Mitigation: null fallback + health monitoring.
- **R2 (LOW)**: Some very new/minor races may not have ProfileScore in their sidebar. Mitigation: null fallback, non-blocking.
- **R3 (LOW)**: Prologue stages may use different naming conventions on PCS. Mitigation: treat as regular stage, ITT detection regex already handles `(ITT)` in any position.
