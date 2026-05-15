// api/all.js — MomentumTrack Urgency & Intent Engine v2.0
// Translates urgency_engine.py into JavaScript for Vercel serverless
//
// Scientific basis:
//   Pillar 1 — Motivation Multiplier       (Dixon & Robinson 1998, Caley 2025)
//   Pillar 2 — EWMA Sustained Pressure     (Exponential Weighted Moving Average)
//   Pillar 3 — Danger Zone Index           (Anzer & Bauer 2021 xG model)
//   Pillar 4 — Defensive Fatigue Proxy     (Lago-Peñas 2010)

const BASE_URL = "https://v3.football.api-sports.io";

const FEATURED_LEAGUE_IDS = [
  39, 140, 78, 135, 61, 2, 3, 848, 45, 143, 137, 66,
  40, 88, 94, 179, 203, 253, 262, 307, 235,
];

// ─── PREDICTIVE WEIGHTS (Anzer & Bauer 2021) ──────────────────────────────────
const W_SHOT_ON_TARGET   = 4.0;
const W_PASS_INTO_BOX    = 2.5;
const W_CORNER           = 2.0;
const W_FINAL_THIRD      = 1.2;
const W_DANGEROUS_ATTACK = 1.0;
const EWMA_LAMBDA        = 0.3;
const TRIGGER_THRESHOLD  = 72.0;

// ─── PILLAR 1: MOTIVATION MULTIPLIER ─────────────────────────────────────────
// Dixon & Robinson (1998): score-state Poisson — trailing teams attack harder
// Caley (2025): favourites trailing = maximum urgency signal

function calcMotivationMultiplier(attGoals, defGoals, minute, isFavorite, defRedCards) {
  const diff = attGoals - defGoals;
  const trailing = diff < 0;
  const leading  = diff > 0;
  const drawing  = diff === 0;
  const absDiff  = Math.abs(diff);
  const late      = minute >= 70;
  const veryLate  = minute >= 80;
  const critical  = minute >= 85;

  let multiplier = 1.0;
  const reasons = [];

  if (trailing) {
    if (absDiff >= 3) {
      multiplier = critical ? 1.20 : 1.10;
      reasons.push(`Trailing ${absDiff} — desperation push`);
    } else if (absDiff === 2) {
      multiplier = critical ? 1.50 : veryLate ? 1.40 : late ? 1.25 : 1.10;
      reasons.push(`Trailing 2 — urgent attack ×${multiplier}`);
    } else {
      // trailing by 1 — peak scenario
      multiplier = critical ? 1.80 : veryLate ? 1.65 : late ? 1.50 : minute >= 55 ? 1.30 : 1.15;
      reasons.push(`Trailing 1 goal at ${minute}′ — attacking hard ×${multiplier}`);
    }
    if (isFavorite) { multiplier *= 1.10; reasons.push("Favourite trailing — max urgency"); }
  } else if (drawing) {
    multiplier = critical ? 1.60 : veryLate ? 1.45 : late ? 1.25 : 1.05;
    if (late) reasons.push(`Draw at ${minute}′ — both pushing ×${multiplier}`);
  } else {
    // leading
    multiplier = absDiff >= 3 ? 0.60 : absDiff === 2 && veryLate ? 0.70 : absDiff === 1 && veryLate ? 0.85 : 0.90;
    if (multiplier < 0.90) reasons.push(`Leading ${absDiff} — conserving energy ×${multiplier}`);
  }

  if (defRedCards >= 1) {
    multiplier *= 1.30;
    reasons.push(`Opponent down to ${11 - defRedCards} men — +30%`);
  }

  return { multiplier: Math.round(multiplier * 1000) / 1000, reasons };
}

function calcMotivationScore(attGoals, defGoals, minute, isFavorite, defRedCards) {
  const { multiplier, reasons } = calcMotivationMultiplier(attGoals, defGoals, minute, isFavorite, defRedCards);
  // Scale multiplier 0.6→0 to 1.8→25
  const score = Math.max(0, Math.min(25, ((multiplier - 0.6) / (1.8 - 0.6)) * 25));
  return { score: Math.round(score * 100) / 100, multiplier, reasons };
}

// ─── PILLAR 2: EWMA SUSTAINED PRESSURE ───────────────────────────────────────
// EWMA_t = λ × x_t + (1-λ) × EWMA_{t-1}
// Only fires full score if 10-min rolling window stays elevated
// Filters random counter-attack spikes (Skripnikov 2024)

function calcEwmaPressure(history, currentAttacks, currentSOT) {
  const reasons = [];

  const intensity = snap =>
    (snap.dangerous_attacks || 0) * W_DANGEROUS_ATTACK +
    (snap.shots_on_target || 0) * W_SHOT_ON_TARGET * 2 +
    (snap.corners || 0) * W_CORNER;

  if (!history || history.length < 2) {
    const raw = (currentAttacks * 0.8 + currentSOT * 2.5) / 15;
    const score = Math.min(15, raw * 25 * 0.6);
    reasons.push("Limited history — current stats only");
    return { score: Math.round(score * 100) / 100, reasons };
  }

  // Compute EWMA over history
  let ewma = intensity(history[0]);
  for (let i = 1; i < history.length; i++) {
    ewma = EWMA_LAMBDA * intensity(history[i]) + (1 - EWMA_LAMBDA) * ewma;
  }
  // Add current reading
  const currentIntensity = currentAttacks * W_DANGEROUS_ATTACK + currentSOT * W_SHOT_ON_TARGET * 2;
  ewma = EWMA_LAMBDA * currentIntensity + (1 - EWMA_LAMBDA) * ewma;

  // 10-minute rolling window check
  const last10 = history.slice(-10);
  const avg10 = last10.reduce((s, h) => s + intensity(h), 0) / last10.length;
  const sustained = avg10 >= 4.0;
  const sustainMod = sustained ? 1.0 : 0.55;

  if (sustained) {
    reasons.push(`Sustained pressure: avg intensity ${avg10.toFixed(1)} over ${last10.length} mins`);
  } else {
    reasons.push("Pressure not sustained — spike filtered");
  }

  // Normalise: typical EWMA max ≈ 30
  const score = Math.min(25, Math.max(0, (ewma / 30) * 25 * sustainMod));
  return { score: Math.round(score * 100) / 100, reasons };
}

// ─── PILLAR 3: DANGER ZONE INDEX ─────────────────────────────────────────────
// Predictive weight hierarchy (Anzer & Bauer 2021 xG model)
// Shot on target > Pass into box > Corner > Final 3rd > Dangerous attack

function calcDangerZone(sot, passesIntoBox, corners, finalThird, dangerousAttacks, minute) {
  const reasons = [];
  const tf = Math.max(1, minute) / 90;

  // Per-90 rates
  const sotRate    = sot / tf;
  const boxRate    = passesIntoBox / tf;
  const cornerRate = corners / tf;
  const ftRate     = finalThird / tf;
  const daRate     = dangerousAttacks / tf;

  const dangerIndex =
    sotRate    * W_SHOT_ON_TARGET   +
    boxRate    * W_PASS_INTO_BOX    +
    cornerRate * W_CORNER           +
    ftRate     * W_FINAL_THIRD      +
    daRate     * W_DANGEROUS_ATTACK;

  if (sot >= 5)               reasons.push(`High SOT: ${sot} shots on target`);
  if (passesIntoBox >= 8)     reasons.push(`Box penetration: ${passesIntoBox} passes into box`);
  if (corners >= 4)           reasons.push(`Corner cluster: ${corners} corners`);
  if (dangerousAttacks >= 15) reasons.push(`Attack volume: ${dangerousAttacks} dangerous attacks`);

  // Normalise: typical high ≈ 40, extreme ≈ 80
  const score = Math.min(25, Math.max(0, (dangerIndex / 80) * 25));
  if (!reasons.length) reasons.push(`Danger index: ${dangerIndex.toFixed(1)}`);

  return { score: Math.round(score * 100) / 100, reasons };
}

// ─── PILLAR 4: DEFENSIVE FATIGUE PROXY ───────────────────────────────────────
// Lago-Peñas (2010): Defensive structures break under repeated pressure waves
// 3+ corners or 5+ attacks in 10-min window triggers fatigue bonus

function calcDefensiveFatigue(defYellows, defCorners, defDangerousAttacks, history) {
  const reasons = [];
  let score = 0;

  // Rolling 10-min window deltas from history
  const last10 = (history || []).slice(-10);
  let windowCorners = 0, windowAttacks = 0;
  if (last10.length >= 2) {
    windowCorners = Math.max(0,
      (last10[last10.length - 1].corners || 0) - (last10[0].corners || 0));
    windowAttacks = Math.max(0,
      (last10[last10.length - 1].dangerous_attacks || 0) - (last10[0].dangerous_attacks || 0));
  }

  // Corner fatigue (set pieces are exhausting to defend repeatedly)
  if (windowCorners >= 3) {
    const cf = Math.min(10, (windowCorners - 3 + 1) * 2.5);
    score += cf;
    reasons.push(`Corner fatigue: ${windowCorners} corners in last 10 mins`);
  }

  // Attack wave fatigue
  if (windowAttacks >= 5) {
    const af = Math.min(10, (windowAttacks - 5 + 1) * 1.5);
    score += af;
    reasons.push(`Attack wave fatigue: ${windowAttacks} attacks in 10 mins`);
  }

  // Yellow cards = defensive desperation
  if (defYellows >= 4) { score += 5; reasons.push(`Defensive desperation: ${defYellows} yellow cards`); }
  else if (defYellows >= 2) score += 2;

  // Cumulative pressure load
  const totalPressure = defCorners * 1.5 + defDangerousAttacks * 0.5;
  if (totalPressure >= 25) {
    const fb = Math.min(8, ((totalPressure - 25) / 10) * 4);
    score += fb;
    reasons.push(`Cumulative pressure load: ${totalPressure.toFixed(0)} units`);
  }

  if (!reasons.length) reasons.push("Defensive structure intact");
  return { score: Math.min(25, Math.max(0, Math.round(score * 100) / 100)), reasons };
}

// ─── MASTER URGENCY ENGINE ────────────────────────────────────────────────────
// Combines all 4 pillars into UrgencyScore (0-100) + ProbabilityTrigger

function computeUrgency(home, away, minute, history) {
  // Determine attacking team (higher pressure)
  const homePressure = home.shots_on_target * 3 + home.dangerous_attacks + home.corners * 2;
  const awayPressure = away.shots_on_target * 3 + away.dangerous_attacks + away.corners * 2;
  const isHomeDominant = homePressure >= awayPressure;

  const attacker = isHomeDominant ? home : away;
  const defender  = isHomeDominant ? away : home;
  const dominantSide = isHomeDominant ? "home" : "away";

  // Split history by team
  const attHistory = (history || []).map(h => isHomeDominant ? h.home : h.away).filter(Boolean);
  const defHistory = (history || []).map(h => isHomeDominant ? h.away : h.home).filter(Boolean);

  // ── PILLAR 1 ──────────────────────────────────────────────────────────
  const mot = calcMotivationScore(
    attacker.goals, defender.goals, minute,
    attacker.favorite || false, defender.red_cards || 0
  );

  // ── PILLAR 2 ──────────────────────────────────────────────────────────
  const pressure = calcEwmaPressure(
    attHistory, attacker.dangerous_attacks, attacker.shots_on_target
  );

  // ── PILLAR 3 ──────────────────────────────────────────────────────────
  const danger = calcDangerZone(
    attacker.shots_on_target,
    attacker.passes_into_box || 0,
    attacker.corners,
    attacker.passes_final_third || 0,
    attacker.dangerous_attacks,
    minute
  );

  // ── PILLAR 4 ──────────────────────────────────────────────────────────
  const fatigue = calcDefensiveFatigue(
    defender.yellow_cards || 0,
    defender.corners || 0,
    defender.dangerous_attacks || 0,
    defHistory
  );

  // ── COMBINE ───────────────────────────────────────────────────────────
  // Motivation multiplies the attacking pillars; fatigue is independent
  const attackingPillars = (pressure.score + danger.score) * mot.multiplier;
  const total = attackingPillars + fatigue.score + mot.score;

  // Max theoretical: (25+25)*1.8 + 25 + 25 = 140 → normalise to 100
  const urgencyScore = Math.round(Math.min(100, Math.max(0, (total / 140) * 100)) * 100) / 100;
  const trigger = urgencyScore >= TRIGGER_THRESHOLD;

  // Best bet
  let bestBet = "Over 0.5 Next Goal";
  if (attacker.goals < defender.goals) {
    bestBet = `${attacker.name} Next Goal`;
  } else if (attacker.goals === defender.goals && urgencyScore >= 60) {
    bestBet = "Over 0.5 Next Goal";
  }

  // Alert level
  const alertLevel = urgencyScore >= 80 ? "🔥 EXTREME"
    : urgencyScore >= 60 ? "🟠 HIGH"
    : urgencyScore >= 40 ? "🟡 MEDIUM"
    : "🟢 LOW";

  // All triggers
  const allTriggers = [
    ...mot.reasons,
    ...pressure.reasons,
    ...danger.reasons,
    ...fatigue.reasons,
  ];

  return {
    urgency_score: urgencyScore,
    heat_score: urgencyScore,          // alias for frontend compatibility
    probability_trigger: trigger,
    alert_level: alertLevel,
    dominant_team: dominantSide,
    best_bet: bestBet,
    breakdown: {
      motivation: mot.score,
      sustained_pressure: pressure.score,
      danger_zone: danger.score,
      defensive_fatigue: fatigue.score,
      motivation_multiplier: mot.multiplier,
      // Keep legacy fields for frontend
      high_pressure: Math.round(pressure.score + danger.score),
      red_card_multiplier: defender.red_cards >= 1 ? 20 : 0,
      vila_effect: (minute >= 35 && minute <= 45) || (minute >= 80 && minute <= 93)
        ? Math.round(fatigue.score * 0.5) : 0,
      triggers: allTriggers,
    },
  };
}

// ─── MOTIVATION INDEX (league standings) ──────────────────────────────────────
function computeMotivationIndex(standing, leagueSize) {
  if (!standing) return null;
  const { rank, points, points_to_leader } = standing;
  const clSpots = leagueSize >= 18 ? 4 : 2;
  const elSpots = leagueSize >= 18 ? 6 : 3;
  const relegationCutoff = leagueSize >= 18 ? leagueSize - 2 : leagueSize - 1;
  const playoffCutoff    = leagueSize >= 18 ? leagueSize - 3 : leagueSize - 2;

  let score = 5, label = "Mid-table", tag = null;

  if (rank === 1)                                 { score = 9;    label = "Title leader";      tag = { text: "🏆 Title",        color: "#f9a825" }; }
  else if (rank <= 3 && points_to_leader <= 6)   { score = 10;   label = "Title race";        tag = { text: "🏆 Title race",   color: "#f9a825" }; }
  else if (rank <= clSpots)                       { score = 9;    label = "CL spot";           tag = { text: "⭐ CL spot",      color: "#1565c0" }; }
  else if (rank <= clSpots + 2)                  { score = 8.5;  label = "Chasing CL";        tag = { text: "⭐ Chasing CL",   color: "#1976d2" }; }
  else if (rank <= elSpots)                      { score = 7.5;  label = "EL spot";           tag = { text: "🔵 EL spot",      color: "#0288d1" }; }
  else if (rank === elSpots + 1)                 { score = 7;    label = "Chasing EL";        tag = { text: "🔵 Chasing EL",   color: "#0288d1" }; }
  else if (rank < playoffCutoff)                 { score = 4;    label = "Mid-table";         tag = { text: "😴 Nothing at stake", color: "#aaa" }; }
  else if (rank === playoffCutoff)               { score = 8.5;  label = "Playoff battle";    tag = { text: "⚠️ Playoff",      color: "#e65100" }; }
  else if (rank >= relegationCutoff)             { score = 10;   label = "Relegation battle"; tag = { text: "🆘 Relegation",   color: "#c62828" }; }

  return { score: Math.min(10, Math.max(0, score)), label, tag, rank, points };
}

function computeMatchStateMot(teamGoals, oppGoals, minute) {
  const trailing = teamGoals < oppGoals, leading = teamGoals > oppGoals;
  const late = minute >= 70, veryLate = minute >= 80;
  let score = 5, label = "In play", tag = null;

  if (trailing) {
    score = veryLate ? 9.5 : late ? 8 : 7;
    label = "Chasing"; tag = { text: "⚡ Chasing", color: "#e53935" };
  } else if (leading) {
    score = veryLate ? 3 : late ? 4 : 5;
    label = veryLate ? "Managing" : "In control";
    tag = veryLate ? { text: "🛡️ Managing", color: "#2e7d32" } : null;
  } else {
    score = veryLate ? 8.5 : late ? 7 : 5.5;
    label = veryLate ? "Must score" : "Level";
    tag = veryLate ? { text: "🔥 Must score", color: "#7b1fa2" } : null;
  }
  return { score: Math.min(10, Math.max(1, score)), label, tag, rank: null, points: null };
}

// ─── PARSE STAT ───────────────────────────────────────────────────────────────
function parseStat(stats, teamIdx, name, fallback = 0) {
  try {
    const s = stats[teamIdx]?.statistics?.find(s => s.type === name);
    if (!s || s.value === null) return fallback;
    if (typeof s.value === "string" && s.value.endsWith("%")) return parseFloat(s.value);
    return parseFloat(s.value) || fallback;
  } catch { return fallback; }
}

async function fetchStatsSafe(fid, headers) {
  try {
    const r = await fetch(`${BASE_URL}/fixtures/statistics?fixture=${fid}`, { headers });
    const d = await r.json();
    return d.response || [];
  } catch { return []; }
}

async function fetchTeamLateHistory(teamId, headers) {
  try {
    const r = await fetch(`${BASE_URL}/fixtures?team=${teamId}&last=10&status=FT`, { headers });
    const d = await r.json();
    const fixtures = d.response || [];
    if (!fixtures.length) return null;
    let lateGoals = 0, htGoals = 0, gamesWithLate = 0, gamesWithHT = 0;
    for (const fx of fixtures) {
      let scoredLate = false, scoredHT = false;
      for (const ev of (fx.events || [])) {
        if (ev.type !== "Goal" || ev.team?.id !== teamId || ev.detail === "Own Goal") continue;
        const min = (ev.time?.elapsed || 0) + (ev.time?.extra || 0);
        if (min >= 80) { lateGoals++; scoredLate = true; }
        if (min >= 35 && min <= 45) { htGoals++; scoredHT = true; }
      }
      if (scoredLate) gamesWithLate++;
      if (scoredHT) gamesWithHT++;
    }
    const n = fixtures.length;
    return {
      teamId, gamesAnalyzed: n,
      lateGoalRate: Math.round((gamesWithLate / n) * 100),
      htGoalRate: Math.round((gamesWithHT / n) * 100),
      vilaScore80: Math.round((gamesWithLate / n) * 100) / 10,
      vilaScore35: Math.round((gamesWithHT / n) * 100) / 10,
      isVilaTeam80: gamesWithLate / n >= 0.4,
      isVilaTeam35: gamesWithHT / n >= 0.4,
      isStrongVila80: gamesWithLate / n >= 0.6,
      isStrongVila35: gamesWithHT / n >= 0.6,
    };
  } catch { return null; }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) return res.status(500).json({ error: "APISPORTS_KEY not set" });

  const headers = { "x-apisports-key": apiKey };
  const today = new Date().toISOString().split("T")[0];

  try {
    // Step 1: Fetch live + finished + upcoming in parallel
    const [liveRes, finishedRes, upcomingRes] = await Promise.all([
      fetch(`${BASE_URL}/fixtures?live=all`, { headers }),
      fetch(`${BASE_URL}/fixtures?date=${today}&status=FT`, { headers }),
      fetch(`${BASE_URL}/fixtures?date=${today}&status=NS`, { headers }),
    ]);
    const [liveData, finishedData, upcomingData] = await Promise.all([
      liveRes.json(), finishedRes.json(), upcomingRes.json()
    ]);

    const liveFixtures    = liveData.response || [];
    const finishedFixtures = (finishedData.response || []).filter(fx => FEATURED_LEAGUE_IDS.includes(fx.league.id));
    const upcomingFixtures = (upcomingData.response || [])
      .filter(fx => FEATURED_LEAGUE_IDS.includes(fx.league.id))
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

    // Step 2: Fetch standings for live leagues
    const liveLeagueIds = [...new Set(liveFixtures.map(fx => fx.league.id))];
    const standingsResults = await Promise.allSettled(
      liveLeagueIds.map(async lid => {
        try {
          const r25 = await fetch(`${BASE_URL}/standings?league=${lid}&season=2025`, { headers });
          const d25 = await r25.json();
          const s25 = d25.response?.[0]?.league?.standings?.[0] || [];
          if (s25.length > 0) return { lid, standings: s25 };
          const r24 = await fetch(`${BASE_URL}/standings?league=${lid}&season=2024`, { headers });
          const d24 = await r24.json();
          return { lid, standings: d24.response?.[0]?.league?.standings?.[0] || [] };
        } catch { return { lid, standings: [] }; }
      })
    );

    const teamStandingMap = {}, leagueSizeMap = {};
    standingsResults.forEach(r => {
      if (r.status !== "fulfilled") return;
      const { lid, standings } = r.value;
      leagueSizeMap[lid] = standings.length;
      standings.forEach(s => {
        teamStandingMap[s.team.id] = {
          rank: s.rank, points: s.points,
          points_to_leader: (standings[0]?.points || 0) - s.points,
          all: s.all, leagueId: lid,
        };
      });
    });

    // Step 3: Stats for top 10 live fixtures in parallel
    const topLive = liveFixtures.slice(0, 10);
    const statsResults = await Promise.allSettled(
      topLive.map(fx => fetchStatsSafe(fx.fixture.id, headers).then(s => ({ id: fx.fixture.id, stats: s })))
    );
    const statsMap = {};
    statsResults.forEach(r => { if (r.status === "fulfilled") statsMap[r.value.id] = r.value.stats; });

    // Step 4: Vila history for teams in Vila window
    const in1H = fx => { const m = fx.fixture.status.elapsed; return m >= 35 && m <= 45; };
    const in2H = fx => { const m = fx.fixture.status.elapsed; return m >= 75 && m <= 93; };
    const vilaTeamIds = [...new Set(
      liveFixtures.filter(fx => in1H(fx) || in2H(fx))
        .flatMap(fx => [fx.teams.home.id, fx.teams.away.id])
    )].slice(0, 8);
    const historyResults = await Promise.allSettled(
      vilaTeamIds.map(id => fetchTeamLateHistory(id, headers))
    );
    const teamHistoryMap = {};
    historyResults.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) teamHistoryMap[vilaTeamIds[i]] = r.value;
    });

    // Step 5: Build live matches with Urgency Engine
    const liveMatches = liveFixtures.map(fx => {
      const fid = fx.fixture.id;
      const stats = statsMap[fid] || [];
      const minute = fx.fixture.status.elapsed || 0;
      const events = fx.events || [];
      const homeId = fx.teams.home.id;
      const awayId = fx.teams.away.id;
      const lid = fx.league.id;
      const leagueSize = leagueSizeMap[lid] || 20;

      let homeYellow = 0, awayYellow = 0, homeRed = 0, awayRed = 0;
      events.forEach(e => {
        const isHome = e.team?.id === homeId;
        if (e.type === "Card") {
          if (e.detail === "Yellow Card") isHome ? homeYellow++ : awayYellow++;
          if (e.detail === "Red Card" || e.detail === "Second Yellow card") isHome ? homeRed++ : awayRed++;
        }
      });

      const hasStats = stats.length > 0;
      const isVilaWindow = in1H(fx) || in2H(fx);
      const homeHistory = teamHistoryMap[homeId] || null;
      const awayHistory = teamHistoryMap[awayId] || null;

      const homeMot = computeMotivationIndex(teamStandingMap[homeId], leagueSize)
        || computeMatchStateMot(fx.goals.home ?? 0, fx.goals.away ?? 0, minute);
      const awayMot = computeMotivationIndex(teamStandingMap[awayId], leagueSize)
        || computeMatchStateMot(fx.goals.away ?? 0, fx.goals.home ?? 0, minute);

      const home = {
        name: fx.teams.home.name, logo: fx.teams.home.logo || "", id: homeId,
        goals: fx.goals.home ?? 0,
        possession: hasStats ? parseStat(stats, 0, "Ball Possession") : 0,
        shots_on_target: hasStats ? parseStat(stats, 0, "Shots on Goal") : 0,
        corners: hasStats ? parseStat(stats, 0, "Corner Kicks") : 0,
        dangerous_attacks: hasStats ? parseStat(stats, 0, "Dangerous Attacks") : 0,
        passes_into_box: hasStats ? parseStat(stats, 0, "Shots insidebox") : 0,
        passes_final_third: hasStats ? parseStat(stats, 0, "Passes %") : 0,
        yellow_cards: hasStats ? parseStat(stats, 0, "Yellow Cards") : homeYellow,
        red_cards: hasStats ? parseStat(stats, 0, "Red Cards") : homeRed,
        favorite: fx.teams.home.winner || false,
        motivation: homeMot,
        vila: homeHistory && isVilaWindow ? {
          vilaScore: in2H(fx) ? homeHistory.vilaScore80 : homeHistory.vilaScore35,
          lateGoalRate: in2H(fx) ? homeHistory.lateGoalRate : homeHistory.htGoalRate,
          isVilaTeam: in2H(fx) ? homeHistory.isVilaTeam80 : homeHistory.isVilaTeam35,
          isStrongVila: in2H(fx) ? homeHistory.isStrongVila80 : homeHistory.isStrongVila35,
          gamesAnalyzed: homeHistory.gamesAnalyzed,
        } : null,
      };

      const away = {
        name: fx.teams.away.name, logo: fx.teams.away.logo || "", id: awayId,
        goals: fx.goals.away ?? 0,
        possession: hasStats ? parseStat(stats, 1, "Ball Possession") : 0,
        shots_on_target: hasStats ? parseStat(stats, 1, "Shots on Goal") : 0,
        corners: hasStats ? parseStat(stats, 1, "Corner Kicks") : 0,
        dangerous_attacks: hasStats ? parseStat(stats, 1, "Dangerous Attacks") : 0,
        passes_into_box: hasStats ? parseStat(stats, 1, "Shots insidebox") : 0,
        passes_final_third: hasStats ? parseStat(stats, 1, "Passes %") : 0,
        yellow_cards: hasStats ? parseStat(stats, 1, "Yellow Cards") : awayYellow,
        red_cards: hasStats ? parseStat(stats, 1, "Red Cards") : awayRed,
        favorite: fx.teams.away.winner || false,
        motivation: awayMot,
        vila: awayHistory && isVilaWindow ? {
          vilaScore: in2H(fx) ? awayHistory.vilaScore80 : awayHistory.vilaScore35,
          lateGoalRate: in2H(fx) ? awayHistory.lateGoalRate : awayHistory.htGoalRate,
          isVilaTeam: in2H(fx) ? awayHistory.isVilaTeam80 : awayHistory.isVilaTeam35,
          isStrongVila: in2H(fx) ? awayHistory.isStrongVila80 : awayHistory.isStrongVila35,
          gamesAnalyzed: awayHistory.gamesAnalyzed,
        } : null,
      };

      // ── RUN URGENCY ENGINE ───────────────────────────────────────────────
      const urgency = computeUrgency(home, away, minute, []);
      const dapm = +((home.dangerous_attacks + away.dangerous_attacks) / Math.max(minute, 1)).toFixed(2);

      return {
        fixture_id: fid, league: fx.league.name, country: fx.league.country,
        league_id: lid, minute, status: fx.fixture.status.short,
        kickoff: fx.fixture.date, kickoff_display: null, time_until: null, mins_until: null,
        home, away, dangerous_attacks_per_min: dapm, odds: null,
        heat_score: urgency.urgency_score,
        urgency_score: urgency.urgency_score,
        probability_trigger: urgency.probability_trigger,
        alert_level: urgency.alert_level,
        best_bet: urgency.best_bet,
        has_full_stats: hasStats,
        breakdown: urgency.breakdown,
      };
    }).sort((a, b) => b.heat_score - a.heat_score);

    // Step 6: Finished matches
    const finishedMatches = finishedFixtures.map(fx => {
      const events = fx.events || [];
      const homeId = fx.teams.home.id;
      let homeYellow = 0, awayYellow = 0, homeRed = 0, awayRed = 0;
      events.forEach(e => {
        const isHome = e.team?.id === homeId;
        if (e.type === "Card") {
          if (e.detail === "Yellow Card") isHome ? homeYellow++ : awayYellow++;
          if (e.detail === "Red Card" || e.detail === "Second Yellow card") isHome ? homeRed++ : awayRed++;
        }
      });
      const lid = fx.league.id, leagueSize = leagueSizeMap[lid] || 20;
      return {
        fixture_id: fx.fixture.id, league: fx.league.name, country: fx.league.country,
        minute: fx.fixture.status.elapsed || 90, status: "FT",
        kickoff: fx.fixture.date, kickoff_display: null, time_until: null, mins_until: null,
        heat_score: 0, urgency_score: 0, probability_trigger: false, alert_level: "✅ FT",
        has_full_stats: false,
        breakdown: { high_pressure: 0, red_card_multiplier: 0, vila_effect: 0, triggers: [] },
        home: { name: fx.teams.home.name, logo: fx.teams.home.logo || "", id: homeId, goals: fx.goals.home ?? 0, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: homeYellow, red_cards: homeRed, favorite: fx.teams.home.winner || false, motivation: computeMotivationIndex(teamStandingMap[homeId], leagueSize) || computeMatchStateMot(fx.goals.home ?? 0, fx.goals.away ?? 0, 90), vila: null },
        away: { name: fx.teams.away.name, logo: fx.teams.away.logo || "", id: fx.teams.away.id, goals: fx.goals.away ?? 0, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: awayYellow, red_cards: awayRed, favorite: fx.teams.away.winner || false, motivation: computeMotivationIndex(teamStandingMap[fx.teams.away.id], leagueSize) || computeMatchStateMot(fx.goals.away ?? 0, fx.goals.home ?? 0, 90), vila: null },
        dangerous_attacks_per_min: 0, odds: null,
      };
    }).sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));

    // Step 7: Upcoming matches
    const now = new Date();
    const upcomingMatches = upcomingFixtures.slice(0, 60).map(fx => {
      const kickoff = new Date(fx.fixture.date);
      const diffMs = kickoff - now;
      const diffMins = Math.round(diffMs / 60000);
      const diffHrs = Math.floor(diffMins / 60);
      const timeLabel = diffMins <= 0 ? "Soon" : diffMins < 60 ? `${diffMins}m` : `${diffHrs}h ${diffMins % 60}m`;
      const lid = fx.league.id, leagueSize = leagueSizeMap[lid] || 20;
      const homeMot = computeMotivationIndex(teamStandingMap[fx.teams.home.id], leagueSize) || { score: 5, label: "Pre-match", tag: null, rank: null, points: null };
      const awayMot = computeMotivationIndex(teamStandingMap[fx.teams.away.id], leagueSize) || { score: 5, label: "Pre-match", tag: null, rank: null, points: null };
      return {
        fixture_id: fx.fixture.id, league: fx.league.name, country: fx.league.country,
        league_id: lid, minute: 0, status: "NS",
        kickoff: fx.fixture.date,
        kickoff_display: kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        time_until: timeLabel, mins_until: diffMins,
        heat_score: 0, urgency_score: 0, probability_trigger: false, alert_level: "⏰ UPCOMING",
        has_full_stats: false,
        breakdown: { high_pressure: 0, red_card_multiplier: 0, vila_effect: 0, triggers: [] },
        home: { name: fx.teams.home.name, logo: fx.teams.home.logo || "", id: fx.teams.home.id, goals: null, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: 0, red_cards: 0, favorite: fx.teams.home.winner || false, motivation: homeMot, vila: null },
        away: { name: fx.teams.away.name, logo: fx.teams.away.logo || "", id: fx.teams.away.id, goals: null, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: 0, red_cards: 0, favorite: fx.teams.away.winner || false, motivation: awayMot, vila: null },
        dangerous_attacks_per_min: 0, odds: null,
      };
    });

    const matches = [...liveMatches, ...finishedMatches, ...upcomingMatches];

    return res.status(200).json({
      source: "api-sports-pro",
      engine: "urgency-v2",
      count: matches.length,
      live_count: liveMatches.length,
      finished_count: finishedMatches.length,
      upcoming_count: upcomingMatches.length,
      probability_triggers: liveMatches.filter(m => m.probability_trigger).length,
      generated_at: new Date().toISOString(),
      matches,
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
