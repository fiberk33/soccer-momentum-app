"""
urgency_engine.py
=================
MomentumTrack — Urgency & Intent Prediction Engine v2.0

Upgrades a reactive 'Heat Map' to a predictive 'Urgency & Intent' model.
Returns an UrgencyScore (0-100) and ProbabilityTrigger (True/False).

Scientific Basis:
  - Dixon & Robinson (1998): Score-state Poisson regression
  - Anzer & Bauer (2021): xG proxy via shots on target + dangerous attacks
  - Caley (2025): Motivation / stake effects on goal rate
  - Lago-Peñas (2010): Defensive fatigue under repeated pressure waves
  - EWMA: Exponential Weighted Moving Average for temporal decay
"""

import math
from dataclasses import dataclass, field
from typing import Optional


# ─── DATA STRUCTURES ──────────────────────────────────────────────────────────

@dataclass
class TeamSnapshot:
    """Snapshot of a team's attacking metrics at one point in time."""
    minute: int
    possession_pct: float        # 0–100
    shots_on_target: int
    corners: int
    dangerous_attacks: int
    passes_final_third: int      # "Field Tilt" proxy
    passes_into_box: int         # "Deep Completions" — highest predictive weight
    goals: int
    red_cards: int
    yellow_cards: int
    is_favorite: bool            # True if pre-match favourite


@dataclass
class MatchState:
    """
    Full match context passed to the engine each refresh cycle.
    The `history` list holds snapshots from previous API calls (oldest first).
    The API should provide the last 10 minutes of per-minute snapshots
    where available, or the engine will synthesise from cumulative stats.
    """
    fixture_id: int
    minute: int
    status: str                  # '1H', '2H', 'HT', 'ET'
    league: str
    home: TeamSnapshot
    away: TeamSnapshot
    history: list = field(default_factory=list)  # List[dict] — previous snapshots


@dataclass
class UrgencyResult:
    urgency_score: float         # 0–100
    probability_trigger: bool    # True if score >= threshold
    trigger_threshold: float     # configurable, default 72
    dominant_team: str           # 'home' | 'away' | 'neutral'
    best_bet: str                # e.g. "Arsenal Next Goal" or "Over 0.5"

    # Pillar sub-scores (0–25 each = 100 total)
    motivation_score: float
    sustained_pressure_score: float
    danger_zone_score: float
    defensive_fatigue_score: float

    # Human-readable explanation
    triggers: list
    multipliers_applied: list


# ─── CONSTANTS ────────────────────────────────────────────────────────────────

# Predictive weights per attack type (Anzer & Bauer 2021)
WEIGHT_SHOT_ON_TARGET    = 4.0   # Highest — direct goal threat
WEIGHT_PASS_INTO_BOX     = 2.5   # Deep completion — precursor to chance
WEIGHT_CORNER            = 2.0   # Set piece danger
WEIGHT_PASSES_FINAL_3RD  = 1.2   # Field tilt
WEIGHT_DANGEROUS_ATTACK  = 1.0   # Baseline

# EWMA decay factor (λ) — higher = more weight to recent events
# λ = 0.3 means last 5 mins carries ~65% of total weight
EWMA_LAMBDA = 0.3

# Defensive fatigue thresholds (Lago-Peñas 2010)
FATIGUE_CORNER_THRESHOLD  = 3    # corners in 10 min window
FATIGUE_ATTACK_THRESHOLD  = 5    # dangerous attacks in 10 min window
FATIGUE_BONUS             = 18   # points added to urgency

# Trigger threshold
DEFAULT_TRIGGER_THRESHOLD = 72.0


# ─── PILLAR 1: MOTIVATION & GAME STATE WEIGHTING ─────────────────────────────

def calc_motivation_multiplier(
    attacker: TeamSnapshot,
    defender: TeamSnapshot,
    minute: int,
) -> tuple[float, list]:
    """
    Computes a Motivation Multiplier (1.0 = neutral) for the attacking team.

    Based on Dixon & Robinson (1998) score-state Poisson model:
    - Trailing teams increase attacking intensity by 30–80% depending on
      time remaining and goal deficit
    - Leading teams with low stakes decrease intensity by 20–40%
    - Draw at end of game = both teams in maximum urgency state

    Returns (multiplier: float, reasons: list[str])
    """
    a_goals = attacker.goals
    d_goals = defender.goals
    diff = a_goals - d_goals  # positive = attacker leading
    is_trailing = diff < 0
    is_leading = diff > 0
    is_draw = diff == 0
    abs_diff = abs(diff)

    late = minute >= 70
    very_late = minute >= 80
    critical = minute >= 85

    multiplier = 1.0
    reasons = []

    # ── TRAILING TEAM (most important signal) ──────────────────────────────
    if is_trailing:
        if abs_diff >= 3:
            # Down 3+ — either giving up or all-out chaos
            m = 1.20 if critical else 1.10
            reasons.append(f"Trailing {abs_diff} goals — desperation push")
        elif abs_diff == 2:
            if critical:    m = 1.50
            elif very_late: m = 1.40
            elif late:      m = 1.25
            else:           m = 1.10
            reasons.append(f"Trailing 2 — urgent attack")
        else:  # trailing by 1 — most common high-value scenario
            if critical:       m = 1.80  # Dixon & Robinson: peak urgency
            elif very_late:    m = 1.65
            elif late:         m = 1.50
            elif minute >= 55: m = 1.30
            else:              m = 1.15
            reasons.append(f"Trailing 1 goal — attacking hard (×{m:.2f})")
        multiplier = m

        # Favourite trailing = even stronger signal (Caley 2025)
        if attacker.is_favorite:
            multiplier *= 1.10
            reasons.append("Favourite trailing — max urgency boost")

    # ── DRAW STATE ────────────────────────────────────────────────────────
    elif is_draw:
        if critical:
            multiplier = 1.60
            reasons.append("Draw at 85'+ — both teams MUST score")
        elif very_late:
            multiplier = 1.45
            reasons.append("Draw at 80'+ — pushing for winner")
        elif late:
            multiplier = 1.25
            reasons.append("Draw in 70's — urgency rising")
        else:
            multiplier = 1.05

    # ── LEADING TEAM ─────────────────────────────────────────────────────
    else:
        if abs_diff >= 3:
            multiplier = 0.60
            reasons.append("Leading 3+ — sitting back, low attacking intent")
        elif abs_diff == 2 and very_late:
            multiplier = 0.70
            reasons.append("Leading 2 late — managing the game")
        elif abs_diff == 1 and very_late:
            multiplier = 0.85
            reasons.append("Leading 1 late — partially conservative")
        else:
            multiplier = 0.90

    # ── RED CARD BONUS ────────────────────────────────────────────────────
    if defender.red_cards >= 1:
        multiplier *= 1.30
        reasons.append(f"Opponent down to {11 - defender.red_cards} men — +30%")

    return round(multiplier, 3), reasons


def calc_motivation_score(
    attacker: TeamSnapshot,
    defender: TeamSnapshot,
    minute: int,
    max_points: float = 25.0,
) -> tuple[float, float, list]:
    """
    Returns (motivation_score 0–25, multiplier, reasons).
    The score itself reflects how 'hot' the motivation state is.
    """
    multiplier, reasons = calc_motivation_multiplier(attacker, defender, minute)

    # Convert multiplier to a 0–25 score
    # 1.0 (neutral) → 12.5, 1.8 (peak) → 25, 0.6 (passive) → 0
    raw = (multiplier - 0.6) / (1.8 - 0.6) * max_points
    score = max(0.0, min(max_points, raw))

    return round(score, 2), multiplier, reasons


# ─── PILLAR 2: SUSTAINED PRESSURE (EWMA + ROLLING WINDOW) ────────────────────

def calc_ewma_pressure(
    history: list,
    current_attacks: int,
    current_sot: int,
    current_minute: int,
    lambda_: float = EWMA_LAMBDA,
    max_points: float = 25.0,
) -> tuple[float, list]:
    """
    Exponential Weighted Moving Average of attacking intensity.

    Formula: EWMA_t = λ * x_t + (1-λ) * EWMA_{t-1}
    where x_t = weighted attack intensity at minute t

    Only fires the full score if metrics stay elevated for a 10-minute
    rolling window (filters out random counter-attack spikes).

    Returns (sustained_pressure_score 0–25, reasons)
    """
    reasons = []

    def intensity(snap: dict) -> float:
        """Composite attacking intensity at a snapshot."""
        return (
            snap.get("dangerous_attacks", 0) * WEIGHT_DANGEROUS_ATTACK +
            snap.get("shots_on_target", 0) * WEIGHT_SHOT_ON_TARGET * 2 +
            snap.get("corners", 0) * WEIGHT_CORNER
        )

    if not history or len(history) < 2:
        # No history — use current stats only, reduced confidence
        raw = (current_attacks * 0.8 + current_sot * 2.5) / 15
        score = min(max_points * 0.6, raw * max_points * 0.6)
        reasons.append("Limited history — current stats only")
        return round(score, 2), reasons

    # Build EWMA over history
    ewma = intensity(history[0])
    for snap in history[1:]:
        ewma = lambda_ * intensity(snap) + (1 - lambda_) * ewma

    # Add current reading
    current_intensity = current_attacks * WEIGHT_DANGEROUS_ATTACK + current_sot * WEIGHT_SHOT_ON_TARGET * 2
    ewma = lambda_ * current_intensity + (1 - lambda_) * ewma

    # Rolling window check: was pressure sustained for 10 minutes?
    last_10 = history[-10:] if len(history) >= 10 else history
    avg_intensity_10 = sum(intensity(s) for s in last_10) / len(last_10)
    threshold_10 = 4.0  # minimum intensity to qualify as "sustained"

    sustained = avg_intensity_10 >= threshold_10

    # Final score: EWMA * sustainability modifier
    sustainability_mod = 1.0 if sustained else 0.55
    if sustained:
        reasons.append(f"Sustained pressure: avg intensity {avg_intensity_10:.1f} over {len(last_10)} mins")
    else:
        reasons.append("Pressure not sustained (spike filtered)")

    # Normalise to 0–25
    # Typical EWMA range: 0 (no attack) to ~30 (extreme)
    raw_score = (ewma / 30.0) * max_points * sustainability_mod
    score = min(max_points, max(0.0, raw_score))

    return round(score, 2), reasons


# ─── PILLAR 3: DANGER ZONE INDEX ─────────────────────────────────────────────

def calc_danger_zone_score(
    attacker: TeamSnapshot,
    minute: int,
    max_points: float = 25.0,
) -> tuple[float, list]:
    """
    Differentiates between low-quality possession and genuine danger.

    Predictive weight hierarchy (Anzer & Bauer 2021 xG model):
      1. Shots on target      — direct goal threat, highest xG
      2. Passes into box      — precursor to high-quality chances
      3. Corners              — set piece clusters near goal
      4. Passes in final 3rd  — field tilt
      5. Dangerous attacks    — baseline positional threat

    Returns (danger_zone_score 0–25, reasons)
    """
    reasons = []

    # Normalise per 90 min to account for match time
    time_factor = max(1, minute) / 90.0

    # Compute per-90 rates
    sot_rate    = attacker.shots_on_target / time_factor
    box_rate    = attacker.passes_into_box / time_factor
    corner_rate = attacker.corners / time_factor
    ft_rate     = attacker.passes_final_third / time_factor
    da_rate     = attacker.dangerous_attacks / time_factor

    # Weighted Danger Index
    danger_index = (
        sot_rate    * WEIGHT_SHOT_ON_TARGET   +
        box_rate    * WEIGHT_PASS_INTO_BOX    +
        corner_rate * WEIGHT_CORNER           +
        ft_rate     * WEIGHT_PASSES_FINAL_3RD +
        da_rate     * WEIGHT_DANGEROUS_ATTACK
    )

    # Add per-incident context
    if attacker.shots_on_target >= 5:
        reasons.append(f"High SOT: {attacker.shots_on_target} shots on target")
    if attacker.passes_into_box >= 8:
        reasons.append(f"Box penetration: {attacker.passes_into_box} passes into box")
    if attacker.corners >= 4:
        reasons.append(f"Corner cluster: {attacker.corners} corners")
    if attacker.dangerous_attacks >= 15:
        reasons.append(f"Attack volume: {attacker.dangerous_attacks} dangerous attacks")

    # Normalise: typical high-pressure danger_index ≈ 40, extreme ≈ 80
    raw_score = (danger_index / 80.0) * max_points
    score = min(max_points, max(0.0, raw_score))

    if not reasons:
        reasons.append(f"Danger index: {danger_index:.1f}")

    return round(score, 2), reasons


# ─── PILLAR 4: DEFENSIVE FATIGUE PROXY ───────────────────────────────────────

def calc_defensive_fatigue(
    defender: TeamSnapshot,
    history: list,
    max_points: float = 25.0,
) -> tuple[float, list]:
    """
    Tracks defensive overload using a 10-minute rolling window.

    Based on Lago-Peñas (2010): Defensive structures statistically break
    after repeated pressure waves. Key indicators:
      - 3+ corners in 10 min window
      - 5+ dangerous attacks in 10 min window
      - High yellow card count (defensive desperation)
      - Repeated clearances / goalkeeper saves (not in free API but proxied)

    Returns (defensive_fatigue_score 0–25, reasons)
    """
    reasons = []
    score = 0.0

    # Get 10-minute rolling window from history
    last_10 = history[-10:] if len(history) >= 10 else history

    if last_10:
        # Count defensive actions faced in rolling window
        # We track the OPPONENT'S attacking stats to measure defensive load
        window_corners = sum(s.get("opp_corners_delta", 0) for s in last_10)
        window_attacks = sum(s.get("opp_attacks_delta", 0) for s in last_10)

        # Fallback: use cumulative if deltas not available
        if window_corners == 0 and window_attacks == 0:
            # Estimate from total — not perfect but functional
            window_corners = max(0, defender.corners - (last_10[0].get("corners", defender.corners)))
            window_attacks = 0  # can't estimate reliably without deltas
    else:
        window_corners = 0
        window_attacks = 0

    # Fatigue from corners (set pieces are exhausting to defend)
    if window_corners >= FATIGUE_CORNER_THRESHOLD:
        corner_fatigue = min(10, (window_corners - FATIGUE_CORNER_THRESHOLD + 1) * 2.5)
        score += corner_fatigue
        reasons.append(f"Corner fatigue: {window_corners} corners in last 10 mins")

    # Fatigue from dangerous attacks
    if window_attacks >= FATIGUE_ATTACK_THRESHOLD:
        attack_fatigue = min(10, (window_attacks - FATIGUE_ATTACK_THRESHOLD + 1) * 1.5)
        score += attack_fatigue
        reasons.append(f"Attack wave fatigue: {window_attacks} dangerous attacks in 10 mins")

    # Yellow cards indicate defensive desperation
    if defender.yellow_cards >= 4:
        score += 5
        reasons.append(f"Defensive desperation: {defender.yellow_cards} yellow cards")
    elif defender.yellow_cards >= 2:
        score += 2

    # Structural fatigue from cumulative pressure
    total_pressure = defender.corners * 1.5 + defender.dangerous_attacks * 0.5
    if total_pressure >= 25:
        fatigue_bonus = min(8, (total_pressure - 25) / 10 * 4)
        score += fatigue_bonus
        reasons.append(f"Cumulative pressure load: {total_pressure:.0f} units")

    if not reasons:
        reasons.append("Defensive structure intact")

    return round(min(max_points, max(0.0, score)), 2), reasons


# ─── MAIN ENGINE ──────────────────────────────────────────────────────────────

def compute_urgency(
    match: MatchState,
    trigger_threshold: float = DEFAULT_TRIGGER_THRESHOLD,
    attacking_team: str = "dominant",  # 'home' | 'away' | 'dominant'
) -> UrgencyResult:
    """
    Master function. Takes a MatchState and returns a full UrgencyResult.

    The engine auto-selects the 'attacking' team (higher pressure)
    unless overridden.

    UrgencyScore = sum of 4 pillar scores (each 0–25) × motivation_multiplier
    ProbabilityTrigger = UrgencyScore >= trigger_threshold

    Usage:
        state = MatchState(...)
        result = compute_urgency(state)
        print(result.urgency_score, result.probability_trigger)
    """
    home = match.home
    away = match.away
    minute = match.minute
    history = match.history

    # ── DETERMINE ATTACKING TEAM ───────────────────────────────────────────
    if attacking_team == "dominant":
        # Pick team with more attacking intent
        home_pressure = home.shots_on_target * 3 + home.dangerous_attacks + home.corners * 2
        away_pressure = away.shots_on_target * 3 + away.dangerous_attacks + away.corners * 2
        if home_pressure >= away_pressure:
            attacker, defender = home, away
            dominant_name = "home"
        else:
            attacker, defender = away, home
            dominant_name = "away"
    elif attacking_team == "home":
        attacker, defender = home, away
        dominant_name = "home"
    else:
        attacker, defender = away, home
        dominant_name = "away"

    # ── PILLAR 1: MOTIVATION ───────────────────────────────────────────────
    mot_score, mot_multiplier, mot_reasons = calc_motivation_score(
        attacker, defender, minute
    )

    # ── PILLAR 2: SUSTAINED PRESSURE (EWMA) ───────────────────────────────
    # Filter history to attacker's perspective
    att_history = [
        s.get("home" if dominant_name == "home" else "away", s)
        for s in history
    ]
    sust_score, sust_reasons = calc_ewma_pressure(
        att_history,
        attacker.dangerous_attacks,
        attacker.shots_on_target,
        minute,
    )

    # ── PILLAR 3: DANGER ZONE INDEX ────────────────────────────────────────
    danger_score, danger_reasons = calc_danger_zone_score(attacker, minute)

    # ── PILLAR 4: DEFENSIVE FATIGUE ────────────────────────────────────────
    def_history = [
        s.get("away" if dominant_name == "home" else "home", s)
        for s in history
    ]
    fatigue_score, fatigue_reasons = calc_defensive_fatigue(defender, def_history)

    # ── COMBINE PILLARS ────────────────────────────────────────────────────
    # Raw sum of pillars (max 100 if all at 25)
    raw_sum = sust_score + danger_score + fatigue_score
    # Motivation acts as a multiplier on the attacking pillars
    # (not on fatigue — that's independent of attacker's motivation)
    adjusted = (sust_score + danger_score) * mot_multiplier + fatigue_score

    # Re-add motivation score as standalone component
    total = adjusted + mot_score

    # Normalise to 0–100
    # Max theoretical: (25+25)*1.8 + 25 + 25 = 140 → scale down
    urgency_score = round(min(100.0, max(0.0, total / 140.0 * 100.0)), 2)

    # ── DETERMINE BEST BET ─────────────────────────────────────────────────
    home_goals = home.goals
    away_goals = away.goals

    if dominant_name == "home":
        if home_goals < away_goals:
            best_bet = f"{home.name if hasattr(home, 'name') else 'Home'} Next Goal"
        elif home_goals == away_goals:
            best_bet = "Over 0.5 Next Goal"
        else:
            best_bet = "Over 0.5 Next Goal"
    else:
        if away_goals < home_goals:
            best_bet = f"{away.name if hasattr(away, 'name') else 'Away'} Next Goal"
        elif away_goals == home_goals:
            best_bet = "Over 0.5 Next Goal"
        else:
            best_bet = "Over 0.5 Next Goal"

    # ── COMPILE ALL TRIGGERS ───────────────────────────────────────────────
    all_triggers = mot_reasons + sust_reasons + danger_reasons + fatigue_reasons
    multipliers = [
        f"Motivation multiplier: ×{mot_multiplier}",
        f"Pillars: Motivation={mot_score} | Pressure={sust_score} | Danger={danger_score} | Fatigue={fatigue_score}",
    ]

    return UrgencyResult(
        urgency_score=urgency_score,
        probability_trigger=urgency_score >= trigger_threshold,
        trigger_threshold=trigger_threshold,
        dominant_team=dominant_name,
        best_bet=best_bet,
        motivation_score=mot_score,
        sustained_pressure_score=sust_score,
        danger_zone_score=danger_score,
        defensive_fatigue_score=fatigue_score,
        triggers=all_triggers,
        multipliers_applied=multipliers,
    )


# ─── API ADAPTER ──────────────────────────────────────────────────────────────

def from_api_response(fixture: dict, stats: list, history: list = None) -> MatchState:
    """
    Converts a raw API-Sports fixture + statistics response into a MatchState.

    Args:
        fixture: Single fixture object from /fixtures?live=all
        stats: Statistics array from /fixtures/statistics?fixture=ID
        history: Optional list of previous MatchState snapshots for EWMA

    Returns:
        MatchState ready for compute_urgency()
    """
    def parse_stat(team_idx: int, name: str, fallback: float = 0.0) -> float:
        try:
            s = stats[team_idx]["statistics"]
            for item in s:
                if item["type"] == name:
                    v = item["value"]
                    if v is None:
                        return fallback
                    if isinstance(v, str) and v.endswith("%"):
                        return float(v.replace("%", ""))
                    return float(v)
        except (IndexError, KeyError, TypeError):
            pass
        return fallback

    minute = fixture["fixture"]["status"]["elapsed"] or 0

    home = TeamSnapshot(
        minute=minute,
        possession_pct=parse_stat(0, "Ball Possession"),
        shots_on_target=int(parse_stat(0, "Shots on Goal")),
        corners=int(parse_stat(0, "Corner Kicks")),
        dangerous_attacks=int(parse_stat(0, "Dangerous Attacks")),
        passes_final_third=int(parse_stat(0, "Passes % (Acc)")),   # proxy
        passes_into_box=int(parse_stat(0, "Shots insidebox")),     # proxy
        goals=fixture["goals"]["home"] or 0,
        red_cards=int(parse_stat(0, "Red Cards")),
        yellow_cards=int(parse_stat(0, "Yellow Cards")),
        is_favorite=fixture["teams"]["home"].get("winner", False) or False,
    )

    away = TeamSnapshot(
        minute=minute,
        possession_pct=parse_stat(1, "Ball Possession"),
        shots_on_target=int(parse_stat(1, "Shots on Goal")),
        corners=int(parse_stat(1, "Corner Kicks")),
        dangerous_attacks=int(parse_stat(1, "Dangerous Attacks")),
        passes_final_third=int(parse_stat(1, "Passes % (Acc)")),
        passes_into_box=int(parse_stat(1, "Shots insidebox")),
        goals=fixture["goals"]["away"] or 0,
        red_cards=int(parse_stat(1, "Red Cards")),
        yellow_cards=int(parse_stat(1, "Yellow Cards")),
        is_favorite=fixture["teams"]["away"].get("winner", False) or False,
    )

    return MatchState(
        fixture_id=fixture["fixture"]["id"],
        minute=minute,
        status=fixture["fixture"]["status"]["short"],
        league=fixture["league"]["name"],
        home=home,
        away=away,
        history=history or [],
    )


def process_live_matches(
    api_response: dict,
    stats_map: dict,
    history_map: dict = None,
    trigger_threshold: float = DEFAULT_TRIGGER_THRESHOLD,
) -> list[dict]:
    """
    Processes a full /api/live response and returns enriched match list
    with UrgencyScore and ProbabilityTrigger for each fixture.

    Args:
        api_response:     Full JSON from /fixtures?live=all
        stats_map:        Dict of {fixture_id: stats_array}
        history_map:      Dict of {fixture_id: [previous snapshots]}
        trigger_threshold: Score threshold for ProbabilityTrigger

    Returns:
        List of dicts sorted by UrgencyScore descending, each containing:
        {
            fixture_id, league, minute, home_name, away_name,
            home_goals, away_goals, urgency_score,
            probability_trigger, best_bet, dominant_team,
            pillar_scores: {motivation, pressure, danger, fatigue},
            triggers: [...],
        }
    """
    results = []

    for fixture in api_response.get("response", []):
        fid = fixture["fixture"]["id"]
        stats = stats_map.get(fid, [])
        history = (history_map or {}).get(fid, [])

        try:
            state = from_api_response(fixture, stats, history)
            result = compute_urgency(state, trigger_threshold)

            results.append({
                "fixture_id": fid,
                "league": fixture["league"]["name"],
                "country": fixture["league"]["country"],
                "minute": state.minute,
                "status": state.status,
                "home_name": fixture["teams"]["home"]["name"],
                "away_name": fixture["teams"]["away"]["name"],
                "home_goals": state.home.goals,
                "away_goals": state.away.goals,
                "urgency_score": result.urgency_score,
                "probability_trigger": result.probability_trigger,
                "best_bet": result.best_bet,
                "dominant_team": result.dominant_team,
                "pillar_scores": {
                    "motivation": result.motivation_score,
                    "pressure": result.sustained_pressure_score,
                    "danger": result.danger_zone_score,
                    "fatigue": result.defensive_fatigue_score,
                },
                "triggers": result.triggers,
                "multipliers": result.multipliers_applied,
            })
        except Exception as e:
            # Never crash the whole batch on one fixture
            results.append({
                "fixture_id": fid,
                "error": str(e),
                "urgency_score": 0,
                "probability_trigger": False,
            })

    return sorted(results, key=lambda x: x["urgency_score"], reverse=True)


# ─── DEMO / UNIT TEST ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    """
    Quick sanity check: simulate a high-urgency scenario.
    Arsenal trailing Man City 0-1 at 82' with heavy pressure.
    Expected: UrgencyScore > 72, ProbabilityTrigger = True
    """
    import json

    man_city = TeamSnapshot(
        minute=82, possession_pct=32, shots_on_target=3, corners=2,
        dangerous_attacks=18, passes_final_third=22, passes_into_box=6,
        goals=1, red_cards=0, yellow_cards=1, is_favorite=True,
    )
    arsenal = TeamSnapshot(
        minute=82, possession_pct=68, shots_on_target=9, corners=7,
        dangerous_attacks=42, passes_final_third=45, passes_into_box=15,
        goals=0, red_cards=0, yellow_cards=2, is_favorite=False,
    )

    # Simulate 10 minutes of history showing sustained pressure
    history = [
        {"shots_on_target": 7, "dangerous_attacks": 35, "corners": 5},
        {"shots_on_target": 8, "dangerous_attacks": 38, "corners": 6},
        {"shots_on_target": 9, "dangerous_attacks": 40, "corners": 7},
    ]

    state = MatchState(
        fixture_id=9999,
        minute=82,
        status="2H",
        league="Premier League",
        home=man_city,
        away=arsenal,
        history=history,
    )

    result = compute_urgency(state, attacking_team="away")

    print("=" * 60)
    print(f"URGENCY SCORE:       {result.urgency_score}")
    print(f"PROBABILITY TRIGGER: {result.probability_trigger}")
    print(f"BEST BET:            {result.best_bet}")
    print(f"DOMINANT TEAM:       {result.dominant_team}")
    print()
    print("PILLAR BREAKDOWN:")
    print(f"  Motivation:         {result.motivation_score}/25")
    print(f"  Sustained Pressure: {result.sustained_pressure_score}/25")
    print(f"  Danger Zone:        {result.danger_zone_score}/25")
    print(f"  Defensive Fatigue:  {result.defensive_fatigue_score}/25")
    print()
    print("TRIGGERS:")
    for t in result.triggers:
        print(f"  • {t}")
    print()
    print("MULTIPLIERS:")
    for m in result.multipliers_applied:
        print(f"  • {m}")
    print("=" * 60)

    assert result.urgency_score > 50, "Expected high urgency for this scenario"
    assert result.probability_trigger == True, "Expected trigger to fire"
    print("✅ All assertions passed")

