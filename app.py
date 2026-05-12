"""
Soccer Momentum Tracker - Flask Backend
Fetches live match data and computes Heat Scores for live betting signals.
"""

from flask import Flask, jsonify
from flask_cors import CORS
import requests
import os
import time
import random
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────
# CONFIG — swap in your real API key here
# ─────────────────────────────────────────────
API_FOOTBALL_KEY = os.getenv("API_FOOTBALL_KEY", "YOUR_RAPIDAPI_KEY")
API_FOOTBALL_HOST = "api-football-v1.p.rapidapi.com"

HEADERS = {
    "X-RapidAPI-Key": API_FOOTBALL_KEY,
    "X-RapidAPI-Host": API_FOOTBALL_HOST,
}

# ─────────────────────────────────────────────
# 1. DATA FETCHING LAYER
# ─────────────────────────────────────────────

def fetch_live_matches():
    """
    Fetches all currently live fixtures from API-Football.
    Returns a list of raw match objects.
    """
    url = "https://api-football-v1.p.rapidapi.com/v3/fixtures"
    params = {"live": "all"}
    try:
        resp = requests.get(url, headers=HEADERS, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", [])
    except Exception as e:
        print(f"[ERROR] fetch_live_matches: {e}")
        return []


def fetch_match_statistics(fixture_id: int):
    """
    Fetches real-time statistics for a specific fixture.
    Returns stats for both teams or empty list on failure.
    """
    url = "https://api-football-v1.p.rapidapi.com/v3/fixtures/statistics"
    params = {"fixture": fixture_id}
    try:
        resp = requests.get(url, headers=HEADERS, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return data.get("response", [])
    except Exception as e:
        print(f"[ERROR] fetch_match_statistics({fixture_id}): {e}")
        return []


def parse_stat(stats_list, team_index: int, stat_name: str, fallback=0):
    """
    Safely extracts a named stat value for a given team index from the
    statistics response array.
    """
    try:
        team_stats = stats_list[team_index]["statistics"]
        for s in team_stats:
            if s["type"] == stat_name:
                val = s["value"]
                if val is None:
                    return fallback
                # API returns e.g. "65%" or "12"
                if isinstance(val, str) and val.endswith("%"):
                    return float(val.replace("%", ""))
                return float(val)
    except (IndexError, KeyError, TypeError, ValueError):
        pass
    return fallback


def normalize_match(fixture: dict, stats: list) -> dict:
    """
    Transforms raw API-Football fixture + stats into a clean,
    flat structure used by the momentum engine.
    """
    fix = fixture.get("fixture", {})
    teams = fixture.get("teams", {})
    goals = fixture.get("goals", {})
    score = fixture.get("score", {})

    minute = fix.get("status", {}).get("elapsed") or 0
    home_goals = goals.get("home") or 0
    away_goals = goals.get("away") or 0

    # Possession
    home_pos = parse_stat(stats, 0, "Ball Possession")
    away_pos = parse_stat(stats, 1, "Ball Possession")

    # Shots on Target
    home_sot = parse_stat(stats, 0, "Shots on Goal")
    away_sot = parse_stat(stats, 1, "Shots on Goal")

    # Corners
    home_corners = parse_stat(stats, 0, "Corner Kicks")
    away_corners = parse_stat(stats, 1, "Corner Kicks")

    # Dangerous Attacks (total, we compute per-minute below)
    home_attacks = parse_stat(stats, 0, "Dangerous Attacks")
    away_attacks = parse_stat(stats, 1, "Dangerous Attacks")

    # Cards
    home_yellow = parse_stat(stats, 0, "Yellow Cards")
    away_yellow = parse_stat(stats, 1, "Yellow Cards")
    home_red = parse_stat(stats, 0, "Red Cards")
    away_red = parse_stat(stats, 1, "Red Cards")

    da_per_min = (home_attacks + away_attacks) / max(minute, 1)

    return {
        "fixture_id": fix.get("id"),
        "status": fix.get("status", {}).get("short", ""),
        "minute": minute,
        "home": {
            "name": teams.get("home", {}).get("name", "Home"),
            "logo": teams.get("home", {}).get("logo", ""),
            "goals": home_goals,
            "possession": home_pos,
            "shots_on_target": int(home_sot),
            "corners": int(home_corners),
            "dangerous_attacks": int(home_attacks),
            "yellow_cards": int(home_yellow),
            "red_cards": int(home_red),
            "favorite": teams.get("home", {}).get("winner"),
        },
        "away": {
            "name": teams.get("away", {}).get("name", "Away"),
            "logo": teams.get("away", {}).get("logo", ""),
            "goals": away_goals,
            "possession": away_pos,
            "shots_on_target": int(away_sot),
            "corners": int(away_corners),
            "dangerous_attacks": int(away_attacks),
            "yellow_cards": int(away_yellow),
            "red_cards": int(away_red),
            "favorite": teams.get("away", {}).get("winner"),
        },
        "dangerous_attacks_per_min": round(da_per_min, 2),
        "league": fixture.get("league", {}).get("name", "Unknown"),
        "league_logo": fixture.get("league", {}).get("logo", ""),
        "country": fixture.get("league", {}).get("country", ""),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


# ─────────────────────────────────────────────
# 2. MOMENTUM ENGINE — HEAT SCORE CALCULATOR
# ─────────────────────────────────────────────

def calculate_heat_score(match: dict) -> dict:
    """
    Computes the Heat Score (0–100) for a match using three signal layers:

      A) High Pressure Zone  (0–35 pts)
         Triggers when dominant possession + high dangerous attack rate
         create sustained goalscoring pressure.

      B) Red Card Multiplier (0–30 pts)
         Amplifies heat when an underdog has a numerical advantage
         because a favourite received a red card while drawing or losing.

      C) The 'Vila' Effect   (0–35 pts)
         Statistical pressure spikes in the final 10 minutes of each half
         (35'–45' and 80'–90') where goal probability historically peaks.

    Returns the score and a breakdown dict for UI transparency.
    """
    home = match["home"]
    away = match["away"]
    minute = match["minute"]
    da_per_min = match["dangerous_attacks_per_min"]

    score = 0
    breakdown = {
        "high_pressure": 0,
        "red_card_multiplier": 0,
        "vila_effect": 0,
        "triggers": [],
    }

    # ── A. HIGH PRESSURE (max 35 pts) ──────────────────────────────────────
    dominant = home if home["possession"] > away["possession"] else away
    recessive = away if dominant == home else home

    possession_score = 0
    if dominant["possession"] >= 65:
        # Scale from 65% → 80%: 0→20 pts
        possession_score = min(20, (dominant["possession"] - 65) / 15 * 20)
        breakdown["triggers"].append(
            f"Dominant possession: {dominant['name']} {dominant['possession']:.0f}%"
        )

    attack_score = 0
    if da_per_min >= 1.5:
        # Scale from 1.5 → 4.0 per min: 0→15 pts
        attack_score = min(15, (da_per_min - 1.5) / 2.5 * 15)
        breakdown["triggers"].append(
            f"High attack rate: {da_per_min:.2f} dangerous attacks/min"
        )

    # Bonus: combine both signals for compounding pressure
    if possession_score > 0 and attack_score > 0:
        breakdown["triggers"].append("⚡ High Pressure Zone activated")

    breakdown["high_pressure"] = round(possession_score + attack_score)
    score += breakdown["high_pressure"]

    # Also reward shots on target
    total_sot = home["shots_on_target"] + away["shots_on_target"]
    sot_bonus = min(10, total_sot * 1.2)
    score += sot_bonus

    # ── B. RED CARD MULTIPLIER (max 30 pts) ────────────────────────────────
    home_goals = home["goals"]
    away_goals = away["goals"]
    is_draw = home_goals == away_goals

    def underdog_red_card_scenario(attacker, defender, attacker_score, defender_score):
        """
        Returns pts if defender (favourite) has red card while
        attacker (underdog) is level or winning.
        """
        if defender["red_cards"] >= 1 and attacker["favorite"] is False:
            # Underdog has numerical advantage
            if attacker_score >= defender_score:  # drawing or leading
                pts = 20 + (defender["red_cards"] * 10)  # +10 per extra red
                return min(30, pts), True
        return 0, False

    rc_pts_h, h_triggered = underdog_red_card_scenario(home, away, home_goals, away_goals)
    rc_pts_a, a_triggered = underdog_red_card_scenario(away, home, away_goals, home_goals)
    rc_pts = max(rc_pts_h, rc_pts_a)

    if rc_pts > 0:
        breakdown["red_card_multiplier"] = rc_pts
        score += rc_pts
        if h_triggered:
            breakdown["triggers"].append(
                f"🟥 Red Card Multiplier: {away['name']} (favourite) down a man"
            )
        else:
            breakdown["triggers"].append(
                f"🟥 Red Card Multiplier: {home['name']} (favourite) down a man"
            )

    # ── C. VILA EFFECT — end-of-half pressure spike (max 35 pts) ──────────
    in_first_half_danger = 35 <= minute <= 45
    in_second_half_danger = 80 <= minute <= 93

    if in_first_half_danger or in_second_half_danger:
        half_label = "1st half" if in_first_half_danger else "2nd half"
        minutes_remaining = (45 - minute) if in_first_half_danger else (90 - minute)

        # Urgency ramps up as time runs out (inverse: less time = more heat)
        urgency = max(0, 10 - minutes_remaining)  # 0→10

        # Corners add congestion pressure in the box
        corner_pressure = min(10, (home["corners"] + away["corners"]) * 0.8)

        vila_pts = min(35, urgency * 2.5 + corner_pressure)
        breakdown["vila_effect"] = round(vila_pts)
        score += breakdown["vila_effect"]

        breakdown["triggers"].append(
            f"⏱️ Vila Effect ({half_label}): {minutes_remaining}′ remaining"
        )

    breakdown["vila_effect"] = breakdown.get("vila_effect", 0)

    # ── CLAMP & RETURN ─────────────────────────────────────────────────────
    final_score = min(100, max(0, round(score)))

    # Classify alert level
    if final_score >= 80:
        alert = "🔥 EXTREME"
    elif final_score >= 60:
        alert = "🟠 HIGH"
    elif final_score >= 40:
        alert = "🟡 MEDIUM"
    else:
        alert = "🟢 LOW"

    return {
        "heat_score": final_score,
        "alert_level": alert,
        "breakdown": breakdown,
    }


# ─────────────────────────────────────────────
# 3. DEMO DATA GENERATOR (no API key needed)
# ─────────────────────────────────────────────

def generate_demo_matches():
    """
    Generates realistic demo match data for UI development and testing
    without consuming API quota.
    """
    fixtures = [
        ("Manchester City", "Arsenal", "Premier League", "England", 67, 71),
        ("Real Madrid", "Barcelona", "La Liga", "Spain", 52, 38),
        ("Bayern Munich", "Dortmund", "Bundesliga", "Germany", 88, 14),
        ("PSG", "Lyon", "Ligue 1", "France", 34, 56),
        ("Inter Milan", "AC Milan", "Serie A", "Italy", 78, 81),
        ("Ajax", "PSV", "Eredivisie", "Netherlands", 12, 23),
        ("Benfica", "Porto", "Primeira Liga", "Portugal", 43, 61),
        ("Celtic", "Rangers", "Scottish Prem", "Scotland", 85, 87),
    ]

    matches = []
    for i, (home, away, league, country, min_range_lo, min_range_hi) in enumerate(fixtures):
        minute = random.randint(min_range_lo, min_range_hi)
        home_goals = random.randint(0, 2)
        away_goals = random.randint(0, 2)
        home_poss = random.randint(38, 72)
        away_poss = 100 - home_poss

        home_red = 1 if random.random() < 0.12 else 0
        away_red = 1 if random.random() < 0.12 else 0
        home_fav = random.choice([True, False, None])

        da_total = random.randint(15, 85)
        da_per_min = round(da_total / max(minute, 1), 2)

        match = {
            "fixture_id": 1000 + i,
            "status": "1H" if minute <= 45 else "2H",
            "minute": minute,
            "home": {
                "name": home,
                "logo": "",
                "goals": home_goals,
                "possession": home_poss,
                "shots_on_target": random.randint(1, 8),
                "corners": random.randint(0, 7),
                "dangerous_attacks": random.randint(8, 45),
                "yellow_cards": random.randint(0, 3),
                "red_cards": home_red,
                "favorite": home_fav,
            },
            "away": {
                "name": away,
                "logo": "",
                "goals": away_goals,
                "possession": away_poss,
                "shots_on_target": random.randint(1, 6),
                "corners": random.randint(0, 6),
                "dangerous_attacks": random.randint(5, 35),
                "yellow_cards": random.randint(0, 2),
                "red_cards": away_red,
                "favorite": not home_fav if home_fav is not None else None,
            },
            "dangerous_attacks_per_min": da_per_min,
            "league": league,
            "league_logo": "",
            "country": country,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

        heat = calculate_heat_score(match)
        match.update(heat)
        matches.append(match)

    matches.sort(key=lambda m: m["heat_score"], reverse=True)
    return matches


# ─────────────────────────────────────────────
# 4. API ROUTES
# ─────────────────────────────────────────────

@app.route("/api/live", methods=["GET"])
def live_matches():
    """
    Main endpoint. Returns all live matches with Heat Scores.
    Falls back to demo data if API key is not configured.
    """
    use_demo = (API_FOOTBALL_KEY == "YOUR_RAPIDAPI_KEY")

    if use_demo:
        matches = generate_demo_matches()
        return jsonify({
            "source": "demo",
            "count": len(matches),
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "matches": matches,
        })

    # Real API path
    raw_fixtures = fetch_live_matches()
    matches = []

    for fixture in raw_fixtures:
        fid = fixture.get("fixture", {}).get("id")
        stats = fetch_match_statistics(fid)
        time.sleep(0.15)  # respect rate limits (~6 req/sec)
        normalized = normalize_match(fixture, stats)
        heat = calculate_heat_score(normalized)
        normalized.update(heat)
        matches.append(normalized)

    matches.sort(key=lambda m: m["heat_score"], reverse=True)

    return jsonify({
        "source": "api-football",
        "count": len(matches),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "matches": matches,
    })


@app.route("/api/match/<int:fixture_id>", methods=["GET"])
def single_match(fixture_id):
    """
    Returns detailed heat breakdown for a single fixture.
    """
    # In demo mode, generate a single mock match
    demos = generate_demo_matches()
    for m in demos:
        if m["fixture_id"] == fixture_id:
            return jsonify(m)
    return jsonify({"error": "Match not found"}), 404


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "time": datetime.utcnow().isoformat()})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
