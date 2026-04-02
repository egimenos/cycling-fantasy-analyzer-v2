"""
Experiment logbook — structured per-run artifacts for diagnosis.

Saves one JSON per benchmark run with full per-race, per-rider detail
so you can drill into *why* a specific race gave bad predictions.

Usage (from benchmark_canonical.py):
    from .logbook import build_run_metadata, build_race_detail, save_logbook_entry
"""

import json
import os
import subprocess
from datetime import datetime

import numpy as np

LOGBOOK_DIR = os.path.join(os.path.dirname(__file__), '..', 'logbook')


# ── JSON helpers ──────────────────────────────────────────────────────

def _json_default(obj):
    """Convert numpy types to native Python for json.dumps."""
    if isinstance(obj, (np.float32, np.float64)):
        return None if np.isnan(obj) else float(obj)
    if isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    raise TypeError(f"Not JSON serializable: {type(obj)}")


def _get_git_sha() -> str:
    try:
        return subprocess.check_output(
            ['git', 'rev-parse', '--short', 'HEAD'],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
    except Exception:
        return 'unknown'


# ── Metadata ──────────────────────────────────────────────────────────

def build_run_metadata(
    model_type: str,
    model_params: dict,
    feature_set_name: str,
    feature_cols: list[str],
    target_transform: str,
    cache_schema_hash: str,
) -> dict:
    """Build the metadata block for a logbook entry."""
    return {
        'model_type': model_type,
        'model_params': model_params,
        'feature_set': feature_set_name,
        'feature_count': len(feature_cols),
        'feature_list': list(feature_cols),
        'target_transform': target_transform,
        'git_sha': _get_git_sha(),
        'cache_schema_hash': cache_schema_hash,
        'timestamp': datetime.utcnow().isoformat() + 'Z',
    }


# ── Per-race detail ──────────────────────────────────────────────────

def build_race_detail(
    race_slug: str,
    year: int,
    race_type: str,
    riders_df,  # DataFrame slice for this race with 'predicted', 'actual_pts', 'rider_id'
    prices_df,  # full prices DataFrame (will be filtered)
    rider_names: dict[str, str],  # rider_id -> full_name
    predicted_team: list[str] | None,
    actual_team: list[str] | None,
    rho: float,
    p_at_15: float,
    ndcg_at_20: float,
    team_capture: float | None,
    team_overlap: float | None,
) -> dict:
    """Build a detailed per-race artifact including every rider."""
    race_prices = prices_df[
        (prices_df['race_slug'] == race_slug) & (prices_df['year'] == year)
    ]
    price_map = dict(zip(race_prices['rider_id'], race_prices['price_hillios'])) if len(race_prices) > 0 else {}

    pred_set = set(predicted_team) if predicted_team else set()
    actual_set = set(actual_team) if actual_team else set()

    df = riders_df.copy()
    df['rank_predicted'] = df['predicted'].rank(ascending=False, method='min').astype(int)
    df['rank_actual'] = df['actual_pts'].rank(ascending=False, method='min').astype(int)

    rider_rows = []
    for _, row in df.sort_values('rank_predicted').iterrows():
        rid = row['rider_id']
        rider_rows.append({
            'rider_id': rid,
            'rider_name': rider_names.get(rid, rid),
            'predicted_score': round(float(row['predicted']), 2),
            'actual_pts': round(float(row['actual_pts']), 2),
            'price': int(price_map[rid]) if rid in price_map else None,
            'rank_predicted': int(row['rank_predicted']),
            'rank_actual': int(row['rank_actual']),
            'in_predicted_team': rid in pred_set,
            'in_actual_team': rid in actual_set,
        })

    detail = {
        'race_slug': race_slug,
        'year': int(year),
        'race_type': race_type,
        'n_riders': len(rider_rows),
        'metrics': {
            'rho': _safe_round(rho),
            'p_at_15': _safe_round(p_at_15),
            'ndcg_at_20': _safe_round(ndcg_at_20),
        },
        'riders': rider_rows,
    }
    if team_capture is not None:
        detail['team_capture'] = _safe_round(team_capture)
    if team_overlap is not None:
        detail['team_overlap'] = _safe_round(team_overlap)

    return detail


def _safe_round(val, decimals=4):
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return round(float(val), decimals)


# ── Aggregate builder ─────────────────────────────────────────────────

def build_aggregate(fold_details: list[dict]) -> dict:
    """Build cross-fold aggregate metrics per race type."""
    from benchmarks.harness import bootstrap_ci

    agg: dict[str, dict] = {}

    for fold in fold_details:
        for rt, rt_data in fold.get('race_types', {}).items():
            if rt not in agg:
                agg[rt] = {
                    'rho_values': [], 'p15_values': [], 'ndcg_values': [],
                    'tc_values': [], 'to_values': [],
                }
            a = rt_data.get('aggregate', {})
            # Collect per-race rho values across folds for bootstrap CI
            for race in rt_data.get('races', []):
                m = race.get('metrics', {})
                if m.get('rho') is not None:
                    agg[rt]['rho_values'].append(m['rho'])
                if m.get('p_at_15') is not None:
                    agg[rt]['p15_values'].append(m['p_at_15'])
                if m.get('ndcg_at_20') is not None:
                    agg[rt]['ndcg_values'].append(m['ndcg_at_20'])
                if race.get('team_capture') is not None:
                    agg[rt]['tc_values'].append(race['team_capture'])
                if race.get('team_overlap') is not None:
                    agg[rt]['to_values'].append(race['team_overlap'])

    result = {}
    for rt, vals in agg.items():
        rhos = vals['rho_values']
        ci = bootstrap_ci(rhos) if len(rhos) >= 2 else (None, None)
        result[rt] = {
            'rho_mean': _safe_round(np.mean(rhos)) if rhos else None,
            'rho_ci': [_safe_round(ci[0]), _safe_round(ci[1])],
            'p15_mean': _safe_round(np.mean(vals['p15_values'])) if vals['p15_values'] else None,
            'ndcg_mean': _safe_round(np.mean(vals['ndcg_values'])) if vals['ndcg_values'] else None,
            'team_capture_mean': _safe_round(np.mean(vals['tc_values'])) if vals['tc_values'] else None,
            'team_overlap_mean': _safe_round(np.mean(vals['to_values'])) if vals['to_values'] else None,
            'n_races': len(rhos),
            'n_priced_races': len(vals['tc_values']),
        }
    return result


# ── Save / load ───────────────────────────────────────────────────────

def save_logbook_entry(
    metadata: dict,
    fold_details: list[dict],
    label: str | None = None,
) -> str:
    """Save a complete logbook entry and return the file path."""
    aggregate = build_aggregate(fold_details)

    entry = {
        'version': '1.0',
        'metadata': metadata,
        'folds': fold_details,
        'aggregate': aggregate,
    }

    os.makedirs(LOGBOOK_DIR, exist_ok=True)

    if label:
        filename = f"{label}.json"
    else:
        date_str = datetime.utcnow().strftime('%Y-%m-%d')
        model = metadata.get('model_type', 'unknown')
        features = metadata.get('feature_set', 'unknown')
        transform = metadata.get('target_transform', 'raw')
        filename = f"{date_str}_{model}_{features}_{transform}.json"

    path = os.path.join(LOGBOOK_DIR, filename)

    # Avoid overwriting
    if os.path.exists(path):
        base, ext = os.path.splitext(path)
        i = 2
        while os.path.exists(f"{base}_{i}{ext}"):
            i += 1
        path = f"{base}_{i}{ext}"

    with open(path, 'w') as f:
        json.dump(entry, f, indent=2, default=_json_default)

    return path


def load_logbook_entry(path: str) -> dict:
    """Load a logbook JSON file."""
    with open(path) as f:
        return json.load(f)


def list_logbook_entries() -> list[dict]:
    """Scan the logbook directory and return summary of each entry."""
    if not os.path.isdir(LOGBOOK_DIR):
        return []
    entries = []
    for name in sorted(os.listdir(LOGBOOK_DIR)):
        if not name.endswith('.json'):
            continue
        path = os.path.join(LOGBOOK_DIR, name)
        try:
            with open(path) as f:
                data = json.load(f)
            meta = data.get('metadata', {})
            entries.append({
                'path': path,
                'filename': name,
                'model': meta.get('model_type'),
                'features': meta.get('feature_set'),
                'transform': meta.get('target_transform'),
                'timestamp': meta.get('timestamp'),
            })
        except Exception:
            continue
    return entries
