"""
soccer-momentum-app — backend.

Pulls /fixtures?live=all from api-sports.io, computes the Heat Score for each
match (High Pressure + Red Card Multiplier + Vila Effect), and returns an
enriched payload that the React frontend can render directly.

API-Sports rate-limit notes:
- /fixtures?live=all is a single call no matter how many live games exist.
- /fixtures/statistics?fixture={id} is one call per fixture and provides the
  possession, dangerous-attacks, shots and xG numbers the algorithm needs.
- We cap the stats fetch at TOP_N matches per /api/live request, ranked by
  partial heat (the signals we can derive without stats — Vila window + red
  cards). Stats results are cached for STATS_TTL seconds, so repeated /api/live
  calls within that window cost zero extra requests.
"""

import os
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

API_KEY = os.getenv("API_FOOTBALL_KEY")
BASE = "https://v3.football.api-sports.io"
HEADERS = {
    "x-apisports-key": API_KEY or "",
    "x-rapidapi-host": "v3.football.api-sports.io",
}

# How many top-heat fixtures get a stats fetch per /api/live call.
TOP_N = 12
# Stats cache lifetime per fixture.
STATS_TTL = 90.0

# In-memory state. Resets on Render cold-start, which is fine.
_STATS_CACHE = {}          # { fixture_id: {"stats": [...], "fetched_at": ts} }
_HEAT_HISTORY = {}         # { fixture_id: [last_N_scores] }
_HEAT_HISTORY_MAX = 8      # last 8 readings — drives the momentum trend


# ──────────────────────────────────────────────────────────────────────────
# API-Sports helpers
# ──────────────────────────────────────────────────────────────────────────

def _fetch_live_fixtures():
    r = requests.get(
        f"{BASE}/fixtures",
        headers=HEADERS,
        params={"live": "all"},
        timeout=12,
    )
    r.raise_for_status()
    return r.json().get("response", []) or []


def _fetch_stats(fixture_id):
    """Cached per-fixture statistics fetch. Returns the array, or None on error."""
    now = time.time()
    cached = _STATS_CACHE.get(fixture_id)
    if cached and (now - cached["fetched_at"]) < STATS_TTL:
        return cached["stats"]
    try:
        r = requests.get(
            f"{BASE}/fixtures/statistics",
            headers=HEADERS,
            params={"fixture": fixture_id},
            timeout=10,
        )
        if r.status_code == 200:
            data = r.json().get("response", []) or []
            _STATS_CACHE[fixture_id] = {"stats": data, "fetched_at": now}
            return data
    except Exception as e:  # noqa: BLE001
        print(f"stats fetch failed for {fixture_id}: {e}")
    return None


# ──────────────────────────────────────────────────────────────────────────
# Data extraction
# ──────────────────────────────────────────────────────────────────────────

def _stat_value(stats_arr, team_id, stat_type):
    """Look up a stat by team id + type name inside the statistics array."""
    if not stats_arr:
        return None
    for team_stats in stats_arr:
        if team_stats.get("team", {}).get("id") == team_id:
            for s in team_stats.get("statistics", []) or []:
                if s.get("type") == stat_type:
                    return s.get("value")
    return None


def _as_pct(v):
    """Normalize '67%' / 67 / None into an int 0..100."""
    if v is None:
        return 0
    if isinstance(v, str):
        v = v.replace("%", "").strip()
        if not v:
            return 0
        try:
            return int(float(v))
        except ValueError:
            return 0
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _as_num(v, default=0):
    if v is None:
        return default
    try:
        return float(v) if isinstance(v, str) and "." in v else int(v)
    except (TypeError, ValueError):
        try:
            return float(v)
        except (TypeError, ValueError):
            return default


def _count_cards(events, home_id, away_id):
    """Walk events list and count yellows/reds per side. Second yellow counts as red."""
    counts = {"home_yellow": 0, "home_red": 0, "away_yellow": 0, "away_red": 0}
    for ev in events or []:
        if ev.get("type") != "Card":
            continue
        team_id = ev.get("team", {}).get("id")
        detail = (ev.get("detail") or "").lower()
        is_home = team_id == home_id
        is_away = team_id == away_id
        if "red" in detail or "second yellow" in detail:
            if is_home:
                counts["home_red"] += 1
            elif is_away:
                counts["away_red"] += 1
        elif "yellow" in detail:
            if is_home:
                counts["home_yellow"] += 1
            elif is_away:
                counts["away_yellow"] += 1
    return counts


# ──────────────────────────────────────────────────────────────────────────
# Heat-score algorithm
# ──────────────────────────────────────────────────────────────────────────

def _compute_heat(match, stats_arr):
    """
    Compute heat score + breakdown from the enriched match dict.
    `stats_arr` may be None (partial heat using only minute + events).
    Returns: dict with possession/shots/etc + heat_score + alert_level + breakdown.
    """
    minute = match["minute"] or 0
    home_id = match["_home_id"]
    away_id = match["_away_id"]
    home = match["home"]
    away = match["away"]

    poss_h = _as_pct(_stat_value(stats_arr, home_id, "Ball Possession"))
    poss_a = _as_pct(_stat_value(stats_arr, away_id, "Ball Possession"))
    da_h = _as_num(_stat_value(stats_arr, home_id, "Dangerous Attacks"))
    da_a = _as_num(_stat_value(stats_arr, away_id, "Dangerous Attacks"))
    sot_h = _as_num(_stat_value(stats_arr, home_id, "Shots on Goal"))
    sot_a = _as_num(_stat_value(stats_arr, away_id, "Shots on Goal"))
    cor_h = _as_num(_stat_value(stats_arr, home_id, "Corner Kicks"))
    cor_a = _as_num(_stat_value(stats_arr, away_id, "Corner Kicks"))
    xg_h = _stat_value(stats_arr, home_id, "expected_goals")
    xg_a = _stat_value(stats_arr, away_id, "expected_goals")
    # xG comes as string sometimes; preserve None if absent.
    try:
        xg_h = float(xg_h) if xg_h not in (None, "") else None
    except (TypeError, ValueError):
        xg_h = None
    try:
        xg_a = float(xg_a) if xg_a not in (None, "") else None
    except (TypeError, ValueError):
        xg_a = None

    da_per_min = round((da_h + da_a) / minute, 2) if minute > 0 else 0.0
    breakdown = {"high_pressure": 0, "red_card_multiplier": 0, "vila_effect": 0}
    triggers = []

    # ── HIGH PRESSURE (0-35) ──
    top_poss = max(poss_h, poss_a)
    if top_poss > 65:
        breakdown["high_pressure"] += 15
        leader = home["name"] if poss_h >= poss_a else away["name"]
        triggers.append(f"Dominant possession: {leader} {top_poss}%")
    if da_per_min > 1.5:
        breakdown["high_pressure"] += 20
        triggers.append("⚡ High Pressure Zone activated")
        triggers.append(f"High attack rate: {da_per_min}/min")

    # ── RED CARD MULTIPLIER (0-30) ── favourite down a man while drawing/losing
    if home["red_cards"] > 0 and home["favorite"] and home["goals"] <= away["goals"]:
        breakdown["red_card_multiplier"] = 30
        triggers.append(f"🟥 Red Card Multiplier: {home['name']} (fav) down a man")
    elif away["red_cards"] > 0 and away["favorite"] and away["goals"] <= home["goals"]:
        breakdown["red_card_multiplier"] = 30
        triggers.append(f"🟥 Red Card Multiplier: {away['name']} (fav) down a man")

    # ── VILA EFFECT (0-35) ── pressure-spike windows 35-45' and 80-93'
    if 35 <= minute <= 45:
        remaining = 45 - minute
        breakdown["vila_effect"] = max(20, 35 - remaining * 3)
        triggers.append(f"⏱️ Vila Effect (1st half): {remaining}′ remaining")
    elif 80 <= minute <= 93:
        remaining = max(0, 93 - minute)
        breakdown["vila_effect"] = max(20, 35 - remaining * 2)
        triggers.append(f"⏱️ Vila Effect (2nd half): {remaining}′ remaining")

    heat = min(100, breakdown["high_pressure"] + breakdown["red_card_multiplier"] + breakdown["vila_effect"])
    if heat >= 80:
        level = "🔥 EXTREME"
    elif heat >= 60:
        level = "🟠 HIGH"
    elif heat >= 40:
        level = "🟡 MEDIUM"
    else:
        level = "🟢 LOW"

    return {
        "poss_h": poss_h, "poss_a": poss_a,
        "sot_h": sot_h, "sot_a": sot_a,
        "cor_h": cor_h, "cor_a": cor_a,
        "da_h": da_h, "da_a": da_a,
        "xg_h": xg_h, "xg_a": xg_a,
        "da_per_min": da_per_min,
        "heat_score": heat,
        "alert_level": level,
        "breakdown": {**breakdown, "triggers": triggers},
    }


def _base_shape(fx):
    """Extract the base match shape from a raw api-sports fixture (no stats yet)."""
    home = fx["teams"]["home"]
    away = fx["teams"]["away"]
    home_id, away_id = home["id"], away["id"]
    cards = _count_cards(fx.get("events"), home_id, away_id)

    home_goals = fx["goals"]["home"] or 0
    away_goals = fx["goals"]["away"] or 0
    # Favourite heuristic: api-sports flags the current "winner" or use lead-as-fav.
    home_fav = bool(home.get("winner")) if home.get("winner") is not None else home_goals >= away_goals
    away_fav = not home_fav

    return {
        "fixture_id": fx["fixture"]["id"],
        "league": fx["league"]["name"],
        "country": fx["league"]["country"],
        "minute": fx["fixture"]["status"].get("elapsed") or 0,
        "status": fx["fixture"]["status"].get("short", ""),
        "_home_id": home_id,
        "_away_id": away_id,
        "home": {
            "name": home["name"],
            "goals": home_goals,
            "yellow_cards": cards["home_yellow"],
            "red_cards": cards["home_red"],
            "favorite": home_fav,
            "possession": None,
            "shots_on_target": None,
            "corners": None,
            "dangerous_attacks": None,
            "xg": None,
        },
        "away": {
            "name": away["name"],
            "goals": away_goals,
            "yellow_cards": cards["away_yellow"],
            "red_cards": cards["away_red"],
            "favorite": away_fav,
            "possession": None,
            "shots_on_target": None,
            "corners": None,
            "dangerous_attacks": None,
            "xg": None,
        },
    }


def _attach_heat(match, stats_arr):
    """Mutate `match` with the computed heat fields. Returns it for chaining."""
    h = _compute_heat(match, stats_arr)
    match["home"]["possession"] = h["poss_h"]
    match["away"]["possession"] = h["poss_a"]
    match["home"]["shots_on_target"] = h["sot_h"]
    match["away"]["shots_on_target"] = h["sot_a"]
    match["home"]["corners"] = h["cor_h"]
    match["away"]["corners"] = h["cor_a"]
    match["home"]["dangerous_attacks"] = h["da_h"]
    match["away"]["dangerous_attacks"] = h["da_a"]
    match["home"]["xg"] = h["xg_h"]
    match["away"]["xg"] = h["xg_a"]
    match["dangerous_attacks_per_min"] = h["da_per_min"]
    match["heat_score"] = h["heat_score"]
    match["alert_level"] = h["alert_level"]
    match["breakdown"] = h["breakdown"]
    match["stats_loaded"] = stats_arr is not None
    return match


def _track_history(match):
    """Append current heat to per-fixture history (used to render a momentum trend)."""
    fid = match["fixture_id"]
    hist = _HEAT_HISTORY.setdefault(fid, [])
    hist.append(match["heat_score"])
    if len(hist) > _HEAT_HISTORY_MAX:
        hist.pop(0)
    match["heat_trend"] = list(hist)
    # Direction: comparing current vs avg of prior readings.
    if len(hist) >= 2:
        prior_avg = sum(hist[:-1]) / max(1, len(hist) - 1)
        delta = hist[-1] - prior_avg
        match["heat_delta"] = round(delta, 1)
        match["heat_direction"] = "up" if delta > 3 else "down" if delta < -3 else "flat"
    else:
        match["heat_delta"] = 0
        match["heat_direction"] = "flat"


def _strip_internal(match):
    match.pop("_home_id", None)
    match.pop("_away_id", None)
    return match


# ──────────────────────────────────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────────────────────────────────

@app.route("/api/live")
def get_live():
    if not API_KEY:
        return jsonify({"error": "Missing API Key in Render Environment"}), 500
    try:
        raw = _fetch_live_fixtures()
    except Exception as e:  # noqa: BLE001
        return jsonify({"error": f"Upstream fetch failed: {e}"}), 502

    if not raw:
        return jsonify({"matches": [], "count": 0, "stats_loaded": 0})

    # Pass 1: base shape + partial heat (no stats).
    matches = [_attach_heat(_base_shape(fx), None) for fx in raw]
    # Decide top N by partial heat — these get the stats fetch.
    matches.sort(key=lambda m: m["heat_score"], reverse=True)
    top_ids = [m["fixture_id"] for m in matches[:TOP_N]]

    # Pass 2: fetch stats in parallel (each call returns immediately from cache when fresh).
    with ThreadPoolExecutor(max_workers=6) as pool:
        for fid in top_ids:
            pool.submit(_fetch_stats, fid)

    # Pass 3: re-attach heat using cached stats for the top N.
    raw_by_id = {fx["fixture"]["id"]: fx for fx in raw}
    enriched = []
    for m in matches:
        fid = m["fixture_id"]
        if fid in top_ids:
            stats_arr = _STATS_CACHE.get(fid, {}).get("stats")
            fresh = _attach_heat(_base_shape(raw_by_id[fid]), stats_arr)
            enriched.append(fresh)
        else:
            enriched.append(m)

    # Track history + strip internals + final sort.
    for m in enriched:
        _track_history(m)
        _strip_internal(m)
    enriched.sort(key=lambda m: m["heat_score"], reverse=True)

    stats_loaded_count = sum(1 for m in enriched if m.get("stats_loaded"))
    return jsonify({
        "matches": enriched,
        "count": len(enriched),
        "stats_loaded": stats_loaded_count,
        "stats_top_n": TOP_N,
    })


@app.route("/api/health")
def health():
    return jsonify({"ok": True, "cache_size": len(_STATS_CACHE), "tracked_fixtures": len(_HEAT_HISTORY)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
