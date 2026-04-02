---
work_package_id: WP02
title: Classic Type Taxonomy
lane: 'for_review'
dependencies: []
base_branch: main
base_commit: e31e75682188089d1c08f905e5761d3d565d6ce5
created_at: '2026-04-02T19:10:40.685693+00:00'
subtasks:
  - T007
  - T008
  - T009
  - T010
phase: Phase 1 - Baseline & Research Infrastructure
assignee: ''
agent: 'claude-opus'
shell_pid: '90230'
review_status: ''
reviewed_by: ''
history:
  - timestamp: '2026-04-02T16:48:30Z'
    lane: planned
    agent: system
    shell_pid: ''
    action: Prompt generated via /spec-kitty.tasks
requirement_refs:
  - FR-006
---

# Work Package Prompt: WP02 – Classic Type Taxonomy

## IMPORTANT: Review Feedback Status

- **Has review feedback?**: Check the `review_status` field above.

---

## Review Feedback

_[Empty initially.]_

---

## Implementation Command

```bash
spec-kitty implement WP02
```

---

## Objectives & Success Criteria

- Create `ml/src/classic_taxonomy.py` with a complete lookup table of all UWT classics + monuments + World Championship
- Each race mapped to one or more types (flemish, cobbled, ardennes, puncheur, italian, sprint_classic, hilly, monument, special)
- Define seasonal pipeline groups (Flemish spring campaign, Ardennes spring campaign)
- Provide helper functions for downstream feature engineering
- All race slugs verified against the actual database

**Success**: `from classic_taxonomy import get_classic_types; get_classic_types('ronde-van-vlaanderen')` returns `['monument', 'flemish', 'cobbled']`.

## Context & Constraints

- **Research**: `kitty-specs/016-classics-ml-model/research.md` — R3 (taxonomy proposal)
- **Data model**: `kitty-specs/016-classics-ml-model/data-model.md` — Classic Type Taxonomy entity
- **AD-4**: Taxonomy as code (Python dict, not database table)
- Race slugs come from PCS scraping — must verify against `race_results` table
- Sponsor name changes may cause slug variations across years

## Subtasks & Detailed Guidance

### Subtask T007 – Create classic_taxonomy.py with CLASSIC_TYPES dict

**Purpose**: Define the authoritative mapping of classic race slugs to their type classifications.

**Steps**:

1. Create `ml/src/classic_taxonomy.py`
2. Define `CLASSIC_TYPES` dict:
   ```python
   CLASSIC_TYPES: dict[str, dict] = {
       'milano-sanremo': {
           'name': 'Milano-Sanremo',
           'types': ['monument', 'sprint_classic', 'italian'],
       },
       'ronde-van-vlaanderen': {
           'name': 'Ronde van Vlaanderen',
           'types': ['monument', 'flemish', 'cobbled'],
       },
       'paris-roubaix': {
           'name': 'Paris-Roubaix',
           'types': ['monument', 'cobbled'],
       },
       'liege-bastogne-liege': {
           'name': 'Liège-Bastogne-Liège',
           'types': ['monument', 'ardennes'],
       },
       'il-lombardia': {
           'name': 'Il Lombardia',
           'types': ['monument', 'italian', 'hilly'],
       },
       'strade-bianche': {
           'name': 'Strade Bianche',
           'types': ['italian', 'hilly'],
       },
       # ... complete list for all UWT classics
   }
   ```
3. Define `ALL_CLASSIC_TYPES` constant: list of all type strings
4. Handle slug aliases for sponsor name changes (e.g., `'e3-saxo-classic'` and `'e3-harelbeke'` → same race)

**Files**: `ml/src/classic_taxonomy.py` (new, ~80 lines)

**Notes**: The proposed taxonomy from research.md is a starting point — slugs MUST be verified against the DB (T008) before finalizing.

---

### Subtask T008 – Verify race slugs against database

**Purpose**: Query the database to find all actual classic race slugs and ensure the taxonomy covers them.

**Steps**:

1. Write a verification function or standalone script:

   ```python
   def verify_slugs(conn) -> dict:
       query = """
       SELECT DISTINCT race_slug, race_name, race_class, COUNT(*) as years
       FROM race_results
       WHERE race_type = 'classic' AND category = 'gc'
       GROUP BY race_slug, race_name, race_class
       ORDER BY years DESC, race_slug
       """
       db_classics = pd.read_sql(query, conn)

       known = set(CLASSIC_TYPES.keys())
       # Include aliases
       all_known = known | set(SLUG_ALIASES.keys())

       in_db = set(db_classics['race_slug'])

       missing_from_taxonomy = in_db - all_known
       missing_from_db = known - in_db

       return {
           'db_classics': db_classics,
           'missing_from_taxonomy': missing_from_taxonomy,
           'missing_from_db': missing_from_db,
           'coverage': len(in_db & all_known) / len(in_db) if in_db else 0,
       }
   ```

2. Run verification and update `CLASSIC_TYPES` with any missing races
3. Add `SLUG_ALIASES` dict for races whose slug changed across years:
   ```python
   SLUG_ALIASES: dict[str, str] = {
       'e3-harelbeke': 'e3-saxo-classic',
       # Add more as discovered from DB
   }
   ```
4. Log results: which races are covered, which are new/unknown

**Files**: `ml/src/classic_taxonomy.py` (~40 lines)

**Notes**: Some DB slugs may be for non-UWT classics (Pro or .1 category). Only include UWT + monument level races in the taxonomy. Lower-tier classics get a default `'other'` type.

---

### Subtask T009 – Define PIPELINE_GROUPS with feeder ordering

**Purpose**: Define the seasonal campaign sequences so that feeder-race results can be used as features for target race prediction.

**Steps**:

1. Define `PIPELINE_GROUPS` dict:
   ```python
   PIPELINE_GROUPS: dict[str, list[dict]] = {
       'flemish_spring': [
           {'slug': 'omloop-het-nieuwsblad', 'order': 1, 'role': 'feeder'},
           {'slug': 'kuurne-brussel-kuurne', 'order': 2, 'role': 'feeder'},
           {'slug': 'e3-saxo-classic', 'order': 3, 'role': 'feeder'},
           {'slug': 'gent-wevelgem', 'order': 4, 'role': 'feeder'},
           {'slug': 'dwars-door-vlaanderen', 'order': 5, 'role': 'feeder'},
           {'slug': 'ronde-van-vlaanderen', 'order': 6, 'role': 'target'},
       ],
       'cobbled_spring': [
           {'slug': 'ronde-van-vlaanderen', 'order': 1, 'role': 'feeder'},
           {'slug': 'paris-roubaix', 'order': 2, 'role': 'target'},
       ],
       'ardennes_spring': [
           {'slug': 'amstel-gold-race', 'order': 1, 'role': 'feeder'},
           {'slug': 'la-fleche-wallonne', 'order': 2, 'role': 'feeder'},
           {'slug': 'liege-bastogne-liege', 'order': 3, 'role': 'target'},
       ],
       'italian_autumn': [
           {'slug': 'il-lombardia', 'order': 1, 'role': 'target'},
           # Lombardia has fewer feeders — mostly preceded by small Italian races
       ],
   }
   ```
2. Add `CLASSIC_TYPES` metadata: `pipeline_group` and `pipeline_order` fields for each race
3. Note: A race can appear in multiple pipeline groups (e.g., Ronde is target of flemish_spring but feeder of cobbled_spring)

**Files**: `ml/src/classic_taxonomy.py` (~50 lines)

---

### Subtask T010 – Add taxonomy helper functions

**Purpose**: Provide a clean API for downstream feature engineering to query the taxonomy.

**Steps**:

1. Implement helper functions:

   ```python
   def get_classic_types(race_slug: str) -> list[str]:
       """Get type tags for a classic race. Returns ['other'] for unknown slugs."""
       slug = SLUG_ALIASES.get(race_slug, race_slug)
       entry = CLASSIC_TYPES.get(slug)
       return entry['types'] if entry else ['other']

   def is_monument(race_slug: str) -> bool:
       """Check if a race is one of the 5 monuments."""
       return 'monument' in get_classic_types(race_slug)

   def get_feeders_for_race(race_slug: str) -> list[str]:
       """Get feeder race slugs that precede this race in any pipeline group."""
       slug = SLUG_ALIASES.get(race_slug, race_slug)
       feeders = []
       for group in PIPELINE_GROUPS.values():
           slugs_in_group = [r['slug'] for r in group]
           if slug in slugs_in_group:
               my_order = next(r['order'] for r in group if r['slug'] == slug)
               feeders.extend(
                   r['slug'] for r in group if r['order'] < my_order
               )
       return list(set(feeders))

   def get_all_types() -> list[str]:
       """Return all unique type strings across the taxonomy."""
       return sorted(ALL_CLASSIC_TYPES)

   def get_races_by_type(classic_type: str) -> list[str]:
       """Return all race slugs that have the given type."""
       return [slug for slug, meta in CLASSIC_TYPES.items()
               if classic_type in meta['types']]

   def resolve_slug(race_slug: str) -> str:
       """Resolve aliases to canonical slug."""
       return SLUG_ALIASES.get(race_slug, race_slug)
   ```

**Files**: `ml/src/classic_taxonomy.py` (~50 lines)

**Validation**:

- [ ] `get_classic_types('ronde-van-vlaanderen')` returns `['monument', 'flemish', 'cobbled']`
- [ ] `is_monument('paris-roubaix')` returns `True`
- [ ] `is_monument('strade-bianche')` returns `False`
- [ ] `get_feeders_for_race('ronde-van-vlaanderen')` returns Omloop, Kuurne, E3, Gent-Wevelgem, Dwars
- [ ] `get_feeders_for_race('liege-bastogne-liege')` returns Amstel, Flèche
- [ ] Unknown slug returns `['other']` type

---

## Risks & Mitigations

- **Risk**: Race slugs in DB may differ from expected (sponsor name changes). **Mitigation**: T008 verification catches mismatches; SLUG_ALIASES handles known variations.
- **Risk**: New classics may enter the UWT calendar in future years. **Mitigation**: Unknown slugs get default `['other']` type; taxonomy is easy to update.
- **Risk**: Pipeline group ordering may be incorrect (race dates vary slightly). **Mitigation**: Order is by typical calendar position, not exact date; feeder lookup uses order, not date.

## Review Guidance

- Verify all 5 monuments are correctly tagged
- Check pipeline groups match the actual spring classic calendar
- Ensure SLUG_ALIASES are populated from actual DB verification
- Confirm helper functions handle edge cases (unknown slugs, empty pipeline groups)

## Activity Log

- 2026-04-02T16:48:30Z – system – lane=planned – Prompt created.
- 2026-04-02T19:10:41Z – claude-opus – shell_pid=90230 – lane=doing – Assigned agent via workflow command
- 2026-04-02T19:12:43Z – claude-opus – shell_pid=90230 – lane=for_review – Taxonomy complete: 35 classified races, 5 pipeline groups, 9 types, alias resolution. All verified against DB.
