# Contract: GET /api/gmv-match

## Purpose
Attempts to find and import a price list from GrandesMiniVueltas by fuzzy-matching the given race against cached GMV WordPress posts. If a match is found, returns the imported riders. If not, returns a "no match" indicator so the frontend can show manual fallback.

## Request

```
GET /api/gmv-match?raceSlug=volta-a-catalunya&year=2026
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| raceSlug | string | Yes | PCS race slug |
| year | number | Yes | Race year |

## Response (match found)

```json
{
  "matched": true,
  "postTitle": "Volta a Catalunya 2026",
  "postUrl": "https://grandesminivueltas.com/index.php/2026/03/21/volta-a-catalunya-2026/",
  "confidence": 0.92,
  "riders": [
    { "name": "Tadej Pogačar", "team": "UAE Team Emirates", "price": 75 },
    { "name": "Remco Evenepoel", "team": "Soudal Quick-Step", "price": 68 }
  ]
}
```

## Response (no match)

```json
{
  "matched": false,
  "postTitle": null,
  "postUrl": null,
  "confidence": null,
  "riders": null
}
```

## Response Type

```typescript
interface GmvMatchResponse {
  matched: boolean;
  postTitle: string | null;
  postUrl: string | null;
  confidence: number | null;
  riders: ParsedPriceEntry[] | null;
}
```

## Error Responses

| Status | Condition |
|--------|-----------|
| 400 | Missing raceSlug or year |
| 400 | Invalid year (not a number) |
| 502 | GMV WordPress API unreachable (after cache miss) |

## Notes

- GMV posts are cached in-memory (TTL: 4 hours). First request may be slower (~1-2s).
- Fuzzy matching uses normalized token overlap + static alias map for cross-language race names.
- Confidence threshold for auto-match: ≥ 0.7. Below that, treated as no match.
- The endpoint reuses the existing `ImportPriceListUseCase` (fetcher + parser) once a match URL is found.
- Only men's race posts are considered (WP categories 23 + 21).
