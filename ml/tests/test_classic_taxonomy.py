"""Tests for classic_taxonomy.py — type lookups, pipeline groups, helpers."""

from src.domain.classic_taxonomy import (
    get_all_types,
    get_classic_types,
    get_feeders_for_race,
    get_pipeline_group,
    get_pipeline_order,
    get_races_by_type,
    is_monument,
    resolve_slug,
)


class TestMonuments:
    def test_all_five_monuments_are_monuments(self):
        for slug in ["milano-sanremo", "ronde-van-vlaanderen", "paris-roubaix",
                      "liege-bastogne-liege", "il-lombardia"]:
            assert is_monument(slug), f"{slug} should be a monument"

    def test_non_monument_is_not_monument(self):
        assert not is_monument("strade-bianche")
        assert not is_monument("amstel-gold-race")

    def test_monument_types_include_monument_tag(self):
        types = get_classic_types("paris-roubaix")
        assert "monument" in types
        assert "cobbled" in types


class TestTypeClassification:
    def test_ronde_types(self):
        types = get_classic_types("ronde-van-vlaanderen")
        assert set(types) == {"monument", "flemish", "cobbled"}

    def test_fleche_types(self):
        types = get_classic_types("la-fleche-wallonne")
        assert "ardennes" in types
        assert "puncheur" in types

    def test_unknown_slug_returns_other(self):
        assert get_classic_types("unknown-race") == ["other"]
        assert get_classic_types("tro-bro-leon") == ["other"]

    def test_all_types_returns_sorted_list(self):
        types = get_all_types()
        assert "flemish" in types
        assert "ardennes" in types
        assert "monument" in types
        assert types == sorted(types)


class TestSlugAliases:
    def test_e3_alias(self):
        assert resolve_slug("e3-harelbeke") == "e3-saxo-classic"
        assert get_classic_types("e3-harelbeke") == ["flemish", "cobbled"]

    def test_san_sebastian_alias(self):
        assert resolve_slug("san-sebastian") == "clasica-san-sebastian"

    def test_canonical_slug_unchanged(self):
        assert resolve_slug("paris-roubaix") == "paris-roubaix"


class TestFeeders:
    def test_ronde_feeders(self):
        feeders = get_feeders_for_race("ronde-van-vlaanderen")
        assert "omloop-het-nieuwsblad" in feeders
        assert "e3-saxo-classic" in feeders
        assert "gent-wevelgem" in feeders
        assert "dwars-door-vlaanderen" in feeders
        assert "kuurne-brussel-kuurne" in feeders
        assert "ronde-van-vlaanderen" not in feeders  # Not its own feeder

    def test_liege_feeders(self):
        feeders = get_feeders_for_race("liege-bastogne-liege")
        assert "amstel-gold-race" in feeders
        assert "la-fleche-wallonne" in feeders

    def test_roubaix_feeders(self):
        feeders = get_feeders_for_race("paris-roubaix")
        assert "ronde-van-vlaanderen" in feeders

    def test_standalone_classic_no_feeders(self):
        assert get_feeders_for_race("clasica-san-sebastian") == []

    def test_unknown_race_no_feeders(self):
        assert get_feeders_for_race("unknown-race") == []


class TestRacesByType:
    def test_flemish_races(self):
        races = get_races_by_type("flemish")
        assert "ronde-van-vlaanderen" in races
        assert len(races) >= 5  # At least 5 Flemish classics

    def test_ardennes_races(self):
        races = get_races_by_type("ardennes")
        assert "liege-bastogne-liege" in races
        assert "amstel-gold-race" in races

    def test_empty_type(self):
        assert get_races_by_type("nonexistent_type") == []


class TestPipelineGroups:
    def test_ronde_pipeline_order(self):
        order = get_pipeline_order("ronde-van-vlaanderen")
        assert "flemish_spring" in order
        assert order["flemish_spring"] == 6  # Last in Flemish spring

    def test_ronde_in_two_groups(self):
        order = get_pipeline_order("ronde-van-vlaanderen")
        assert "cobbled_spring" in order  # Also feeder for Roubaix

    def test_pipeline_group_name(self):
        assert get_pipeline_group("amstel-gold-race") == "ardennes_spring"

    def test_no_pipeline_group(self):
        assert get_pipeline_group("clasica-san-sebastian") is None
