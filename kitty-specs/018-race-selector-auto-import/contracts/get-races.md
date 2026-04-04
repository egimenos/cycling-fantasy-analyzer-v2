# Contract: GET /api/races

## Purpose
Returns the list of distinct races available in the database, filtered by year and optionally by race type. Powers the race selector combobox.

## Request

```
GET /api/races?minYear=2024&raceType=grand_tour
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| minYear | number | No | 2024 | Minimum year filter (inclusive) |
| raceType | string | No | — | Filter by race type: `grand_tour`, `classic`, `mini_tour` |

## Response

```json
{
  "races": [
    {
      "raceSlug": "volta-a-catalunya",
      "raceName": "Volta a Catalunya",
      "raceType": "mini_tour",
      "year": 2026
    },
    {
      "raceSlug": "tour-de-france",
      "raceName": "Tour De France",
      "raceType": "grand_tour",
      "year": 2025
    }
  ]
}
```

## Response Type

```typescript
interface RaceListResponse {
  races: RaceListItem[];
}

interface RaceListItem {
  raceSlug: string;
  raceName: string;
  raceType: RaceType;
  year: number;
}
```

## Error Responses

| Status | Condition |
|--------|-----------|
| 400 | Invalid minYear (not a number, < 2000) |
| 400 | Invalid raceType (not a valid enum value) |

## Notes

- Results ordered by year DESC, raceName ASC
- No pagination needed — expected ~100-200 entries max
- Response is deterministic (DB-backed, no external calls)
