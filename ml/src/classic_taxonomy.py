"""
Classic Type Taxonomy — static lookup table for one-day classic races.

Maps race slugs to type classifications and defines seasonal pipeline groups.
Types capture rider specialization patterns: Flemish cobble specialists,
Ardennes punchers, Italian hilly-race riders, etc.

A race can belong to multiple types (e.g., Ronde = monument + flemish + cobbled).
Unknown slugs get type ['other'] by default.
"""

from __future__ import annotations

# ── Type definitions ────────────────────────────────────────────────

ALL_CLASSIC_TYPES = [
    "ardennes",
    "cobbled",
    "flemish",
    "hilly",
    "italian",
    "monument",
    "puncheur",
    "special",
    "sprint_classic",
]

# ── Slug aliases (sponsor/name changes across years) ────────────────

SLUG_ALIASES: dict[str, str] = {
    "e3-harelbeke": "e3-saxo-classic",
    "san-sebastian": "clasica-san-sebastian",
}

# ── Classic Type Lookup ─────────────────────────────────────────────
# Verified against race_results DB (2019-2026 data).
# Only UWT + monument + world championship races get specific types.
# Lower-tier one-day races (Pro, .1) are in the DB but get 'other'.

CLASSIC_TYPES: dict[str, dict] = {
    # ── Monuments ────────────────────────────────────────────────────
    "milano-sanremo": {
        "name": "Milano-Sanremo",
        "types": ["monument", "sprint_classic", "italian"],
    },
    "ronde-van-vlaanderen": {
        "name": "Ronde van Vlaanderen",
        "types": ["monument", "flemish", "cobbled"],
    },
    "paris-roubaix": {
        "name": "Paris-Roubaix",
        "types": ["monument", "cobbled"],
    },
    "liege-bastogne-liege": {
        "name": "Liège-Bastogne-Liège",
        "types": ["monument", "ardennes"],
    },
    "il-lombardia": {
        "name": "Il Lombardia",
        "types": ["monument", "italian", "hilly"],
    },
    # ── Flemish classics ─────────────────────────────────────────────
    "omloop-het-nieuwsblad": {
        "name": "Omloop Het Nieuwsblad",
        "types": ["flemish", "cobbled"],
    },
    "kuurne-brussel-kuurne": {
        "name": "Kuurne-Brussel-Kuurne",
        "types": ["flemish", "sprint_classic"],
    },
    "e3-saxo-classic": {
        "name": "E3 Saxo Classic",
        "types": ["flemish", "cobbled"],
    },
    "gent-wevelgem": {
        "name": "Gent-Wevelgem",
        "types": ["flemish", "sprint_classic"],
    },
    "dwars-door-vlaanderen": {
        "name": "Dwars door Vlaanderen",
        "types": ["flemish", "cobbled"],
    },
    "nokere-koerse": {
        "name": "Nokere Koerse",
        "types": ["flemish", "cobbled"],
    },
    "bredene-koksijde-classic": {
        "name": "Bredene-Koksijde Classic",
        "types": ["flemish", "sprint_classic"],
    },
    "scheldeprijs": {
        "name": "Scheldeprijs",
        "types": ["flemish", "sprint_classic"],
    },
    "classic-brugge-de-panne": {
        "name": "Classic Brugge-De Panne",
        "types": ["flemish", "sprint_classic"],
    },
    # ── Ardennes classics ────────────────────────────────────────────
    "amstel-gold-race": {
        "name": "Amstel Gold Race",
        "types": ["ardennes"],
    },
    "la-fleche-wallonne": {
        "name": "La Flèche Wallonne",
        "types": ["ardennes", "puncheur"],
    },
    "brabantse-pijl": {
        "name": "Brabantse Pijl",
        "types": ["ardennes"],
    },
    "gp-de-wallonie": {
        "name": "GP de Wallonie",
        "types": ["ardennes"],
    },
    # ── Italian classics ─────────────────────────────────────────────
    "strade-bianche": {
        "name": "Strade Bianche",
        "types": ["italian", "hilly"],
    },
    "milano-torino": {
        "name": "Milano-Torino",
        "types": ["italian", "hilly"],
    },
    "gran-piemonte": {
        "name": "Gran Piemonte",
        "types": ["italian", "hilly"],
    },
    "giro-dell-emilia": {
        "name": "Giro dell'Emilia",
        "types": ["italian", "hilly"],
    },
    "tre-valli-varesine": {
        "name": "Tre Valli Varesine",
        "types": ["italian", "hilly"],
    },
    "coppa-bernocchi": {
        "name": "Coppa Bernocchi",
        "types": ["italian"],
    },
    "giro-del-veneto": {
        "name": "Giro del Veneto",
        "types": ["italian"],
    },
    "trofeo-laigueglia": {
        "name": "Trofeo Laigueglia",
        "types": ["italian", "hilly"],
    },
    # ── Hilly classics ───────────────────────────────────────────────
    "clasica-san-sebastian": {
        "name": "Clásica San Sebastián",
        "types": ["hilly"],
    },
    "gp-quebec": {
        "name": "GP Québec",
        "types": ["hilly"],
    },
    "gp-montreal": {
        "name": "GP Montréal",
        "types": ["hilly"],
    },
    "eschborn-frankfurt": {
        "name": "Eschborn-Frankfurt",
        "types": ["hilly"],
    },
    "cyclassics-hamburg": {
        "name": "Cyclassics Hamburg",
        "types": ["sprint_classic"],
    },
    "bretagne-classic": {
        "name": "Bretagne Classic",
        "types": ["hilly"],
    },
    # ── Other notable ────────────────────────────────────────────────
    "paris-tours": {
        "name": "Paris-Tours",
        "types": ["sprint_classic"],
    },
    # ── World Championship (if in DB as classic) ─────────────────────
    "world-championship": {
        "name": "World Championship RR",
        "types": ["special"],
    },
}


# ── Pipeline Groups ─────────────────────────────────────────────────
# Seasonal campaign sequences: feeder races predict target monuments.
# Order = typical calendar position within the campaign.

PIPELINE_GROUPS: dict[str, list[dict]] = {
    "flemish_spring": [
        {"slug": "omloop-het-nieuwsblad", "order": 1, "role": "feeder"},
        {"slug": "kuurne-brussel-kuurne", "order": 2, "role": "feeder"},
        {"slug": "e3-saxo-classic", "order": 3, "role": "feeder"},
        {"slug": "gent-wevelgem", "order": 4, "role": "feeder"},
        {"slug": "dwars-door-vlaanderen", "order": 5, "role": "feeder"},
        {"slug": "ronde-van-vlaanderen", "order": 6, "role": "target"},
    ],
    "cobbled_spring": [
        {"slug": "ronde-van-vlaanderen", "order": 1, "role": "feeder"},
        {"slug": "paris-roubaix", "order": 2, "role": "target"},
    ],
    "ardennes_spring": [
        {"slug": "amstel-gold-race", "order": 1, "role": "feeder"},
        {"slug": "la-fleche-wallonne", "order": 2, "role": "feeder"},
        {"slug": "liege-bastogne-liege", "order": 3, "role": "target"},
    ],
    "italian_spring": [
        {"slug": "strade-bianche", "order": 1, "role": "feeder"},
        {"slug": "milano-sanremo", "order": 2, "role": "target"},
    ],
    "italian_autumn": [
        {"slug": "giro-dell-emilia", "order": 1, "role": "feeder"},
        {"slug": "gran-piemonte", "order": 2, "role": "feeder"},
        {"slug": "il-lombardia", "order": 3, "role": "target"},
    ],
}


# ── Helper functions ────────────────────────────────────────────────


def resolve_slug(race_slug: str) -> str:
    """Resolve aliases to canonical slug."""
    return SLUG_ALIASES.get(race_slug, race_slug)


def get_classic_types(race_slug: str) -> list[str]:
    """Get type tags for a classic race. Returns ['other'] for unknown slugs."""
    slug = resolve_slug(race_slug)
    entry = CLASSIC_TYPES.get(slug)
    return list(entry["types"]) if entry else ["other"]


def is_monument(race_slug: str) -> bool:
    """Check if a race is one of the 5 monuments."""
    return "monument" in get_classic_types(race_slug)


def get_feeders_for_race(race_slug: str) -> list[str]:
    """Get feeder race slugs that precede this race in any pipeline group.

    Returns canonical slugs (aliases resolved).
    """
    slug = resolve_slug(race_slug)
    feeders: set[str] = set()
    for group in PIPELINE_GROUPS.values():
        slugs_in_group = [r["slug"] for r in group]
        if slug in slugs_in_group:
            my_order = next(r["order"] for r in group if r["slug"] == slug)
            feeders.update(r["slug"] for r in group if r["order"] < my_order)
    return sorted(feeders)


def get_all_types() -> list[str]:
    """Return all unique type strings (sorted)."""
    return list(ALL_CLASSIC_TYPES)


def get_races_by_type(classic_type: str) -> list[str]:
    """Return all race slugs that have the given type."""
    return [slug for slug, meta in CLASSIC_TYPES.items() if classic_type in meta["types"]]


def get_pipeline_group(race_slug: str) -> str | None:
    """Return the pipeline group name for a race, or None if not in any group."""
    slug = resolve_slug(race_slug)
    for group_name, races in PIPELINE_GROUPS.items():
        if slug in [r["slug"] for r in races]:
            return group_name
    return None


def get_pipeline_order(race_slug: str) -> dict[str, int]:
    """Return {group_name: order} for all pipeline groups this race belongs to."""
    slug = resolve_slug(race_slug)
    result = {}
    for group_name, races in PIPELINE_GROUPS.items():
        for r in races:
            if r["slug"] == slug:
                result[group_name] = r["order"]
    return result
