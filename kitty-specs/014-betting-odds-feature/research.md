# Research: Betting Odds as ML Feature

> Phase 0 research for Feature 014 — betting odds integration
> Date: 2026-03-31

## Mission

Evaluate sources of cycling betting odds that can be consumed as ML features
for Grand Tour and major stage race predictions. The goal is to add an
`implied_prob` feature (or similar) to the existing source-by-source pipeline,
enriching the GC gate and sprint heuristic with market consensus data.

---

## Decision 1: Primary Data Source — Betfair Exchange API

**Decision**: Use the Betfair Exchange API as the primary source of cycling odds.

**Rationale**:

- Cycling is **event type 11** — confirmed available with active markets for
  all three Grand Tours (Tour de France, Giro d'Italia, Vuelta a España).
- **Free developer key** with delayed data (1–180s delay). For pre-race
  snapshot collection (days before race start), delay is irrelevant.
- Well-maintained **Python library**: `betfairlightweight` (pip installable).
- Returns **structured JSON** via REST API — no HTML parsing needed.
- **Exchange odds** (back/lay) are market-driven, not bookmaker-set. They
  reflect real money and tend to be sharper than bookmaker odds.
- Available markets per Grand Tour:
  - **Tour Winner** (GC outright) — market ID pattern: `1.231543034`
  - **Points Classification** (sprint/green jersey)
  - **King of the Mountains** (KOM/polka dot)
  - **Top 10 Finish**
  - **Stage Winner** (per-stage, opens ~1 week before)

**Alternatives considered**:

| Source             | Verdict       | Why                                                                                                 |
| ------------------ | ------------- | --------------------------------------------------------------------------------------------------- |
| The Odds API       | ❌ Not viable | Does not cover cycling at all                                                                       |
| OpticOdds          | ❌ Not viable | No cycling coverage confirmed                                                                       |
| OddsJam            | ❌ Not viable | Mainstream sports only                                                                              |
| Sportbex           | ⚠️ Unknown    | Claims cycling odds API but docs fail to load, likely commercial                                    |
| Oddschecker scrape | 🔄 Backup     | Aggregates 20+ bookmakers, but requires Selenium, TOS prohibits scraping, layout changes frequently |

**Evidence**: [E001], [E002], [E003], [E004], [E005]

---

## Decision 2: Oddschecker as Backup / Validation Source

**Decision**: Keep Oddschecker scraping as a backup option for validation and
for races where Betfair exchange liquidity is thin.

**Rationale**:

- Oddschecker aggregates odds from bet365, William Hill, Paddy Power, Betfair
  Sportsbook, Ladbrokes, Coral, Betway, and ~20 others.
- URL structure is predictable:
  `oddschecker.com/cycling/tour-de-france/winner`
- Existing open-source scrapers exist (ChamRoshi/Oddschecker-Scraper on GitHub).
- **However**: requires Selenium (JS-rendered), TOS prohibits automated access,
  site layout changes break scrapers regularly.
- Best used as a manual validation cross-check, not as an automated pipeline.

**Evidence**: [E006], [E007]

---

## Decision 3: Markets to Consume

**Decision**: Collect odds for these markets per Grand Tour:

| Market                    | ML Feature              | Used By               |
| ------------------------- | ----------------------- | --------------------- |
| GC Winner (outright)      | `implied_gc_prob`       | GC gate model         |
| Points Classification     | `implied_sprint_prob`   | Sprint heuristic      |
| Top 10 GC                 | `implied_gc_top10_prob` | GC gate enrichment    |
| Stage Winner (aggregated) | `implied_stage_prob`    | Stage source (future) |

**Rationale**:

- GC Winner odds directly encode the market's belief about GC finishing position.
  A rider at 3.0 odds (33% implied) vs 50.0 (2%) is massive signal for the
  GC gate which currently uses only Glicko + form.
- Points Classification odds capture sprint strength consensus — currently our
  weakest source (ρ=0.229).
- Top 10 odds are directly aligned with the GC gate's P(top-20) threshold.
- Stage winner odds can be aggregated (mean implied prob across stages) as a
  proxy for "expected stage scoring ability".

---

## Decision 4: Timing and Snapshot Strategy

**Decision**: Collect a single odds snapshot 2–3 days before race start.

**Rationale**:

- Too early (weeks before): odds are stale, don't reflect late team selections
  or injury news.
- Too late (day of): odds shift during the race, introduces temporal leakage.
- 2–3 days pre-race: startlists are confirmed, major news is priced in, but
  the race hasn't started.
- This aligns with our existing scraping cadence (startlists scraped days
  before race start).
- For training data: we'd need historical odds. Betfair doesn't provide
  historical snapshots for free. Options:
  - **Prospective collection**: start collecting now, build dataset over 2026 season.
  - **betfair.betdata.net**: third-party historical data (paid, ~£50/year).
  - **Fallback**: feature is NaN for historical races, model handles via fillna(0)
    or separate code path.

---

## Decision 5: Overround Removal

**Decision**: Normalize implied probabilities to remove the overround (bookmaker margin).

**Rationale**:

- Raw implied probabilities from odds sum to >100% (the overround/vig).
  Example: if all GC contenders' implied probs sum to 115%, each is inflated.
- Normalization: `normalized_prob = raw_prob / sum(all_raw_probs)`.
- For Betfair Exchange, the overround is typically 1–3% (much lower than
  bookmaker 10–15%), so this is a smaller correction.
- The normalized probability is what enters the model as a feature.

---

## Decision 6: Coverage Limitations

**Decision**: Feature is GT-only in v1. Mini tours will have NaN (handled by fillna).

**Rationale**:

- Betfair has deep liquidity for Tour de France, good liquidity for Giro/Vuelta.
- Mini tours (Dauphiné, Suisse, Tirreno): markets exist but are thin (few bets,
  wide spreads). Odds are less reliable.
- Smaller races (Burgos, Luxembourg): no markets at all.
- Our model already handles missing features via fillna(0). A missing odds
  feature won't break anything — the model just won't benefit from it for
  that race.
- v2 could add Oddschecker scraping for UWT mini tours where Betfair is thin.

---

## Decision 7: Betfair Account Requirements

**Decision**: Create a Betfair account with identity verification for API access.

**Requirements**:

- Betfair account (free to create)
- Identity verification (standard KYC — ID document)
- Developer App Key (free, via API-NG visualiser)
- SSL certificates for non-interactive login (generated locally)
- No betting required — delayed key is sufficient for data collection

**Costs**: €0 for delayed key. Live key is £499 (not needed).

**Risk**: Betfair may throttle or delay the key further if no bets are placed.
Mitigation: place occasional small bets, or accept the delay (irrelevant for
2-3 day pre-race snapshots).

---

## Open Questions

1. **Historical data**: Can we backfill 2023–2025 GT odds from any source?
   Without historical data, the feature only helps for 2026+ predictions,
   and we can't validate its impact in expanding window evaluation.

2. **Rider name matching**: Betfair uses display names ("T. Pogacar"),
   our DB uses full names or PCS slugs. Need a fuzzy matching layer.

3. **Market depth for Giro/Vuelta**: Is liquidity sufficient for meaningful
   implied probabilities, or are odds too wide?

4. **Mini tour expansion**: At what liquidity threshold do we trust the odds
   enough to use as a feature?

5. **Impact estimation**: Without historical data, how do we estimate the
   feature's value before committing to the pipeline integration?

---

## Risk Register

| Risk                              | Likelihood | Impact | Mitigation                                      |
| --------------------------------- | ---------- | ------ | ----------------------------------------------- |
| Betfair changes API terms         | Low        | High   | Oddschecker backup, data stored locally         |
| Rider name matching fails         | Medium     | Medium | Build fuzzy match + manual override table       |
| Thin liquidity on Giro/Vuelta     | Medium     | Low    | Use feature only when market volume > threshold |
| No historical data for evaluation | High       | Medium | Prospective collection + synthetic backtest     |
| Account verification rejected     | Low        | High   | Use alternative (Oddschecker scrape)            |
