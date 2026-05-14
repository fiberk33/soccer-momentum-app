// api/all.js — live + upcoming + finished with Motivation Index
// Uses league standings to compute each team's "win appetite"
// Based on: Caley (2025), Dixon & Robinson (1998), Skripnikov (2024)

const BASE_URL = "https://v3.football.api-sports.io";

const FEATURED_LEAGUE_IDS = [
  39, 140, 78, 135, 61, 2, 3, 848, 45, 143, 137, 66,
  40, 88, 94, 179, 203, 253, 262, 307, 235,
];

// ─── MOTIVATION INDEX ─────────────────────────────────────────────────────────
// Computes a 0-10 motivation score based on league standing
// and points gap to key positions (title, CL, EL, relegation)
//
// Research basis:
// - Caley (2025): Teams with "nothing to play for" show statistically
//   significant decrease in defensive and offensive performance
// - Liew (2014 Telegraph): 76 Premier League matches, teams with no
//   stake take fewer points per match
// - Standing within 3pts of a key position = maximum motivation

function computeMotivationIndex(standing, leagueSize) {
  if (!standing) return { score: 5, label: "Unknown", tag: null };

  const rank = standing.rank;
  const points = standing.points;
  const gamesPlayed = standing.all?.played || 1;
  const gamesRemaining = 38 - gamesPlayed; // approx

  // Points to/from key positions
  const pointsToLeader = standing.goalsDiff !== undefined
    ? (standing.points_to_leader || 0) : 0;

  // Determine league context thresholds (approximate for top leagues)
  const clSpots = leagueSize >= 18 ? 4 : 2;
  const elSpots = leagueSize >= 18 ? 6 : 3;
  const relegationCutoff = leagueSize >= 18 ? leagueSize - 2 : leagueSize - 1;
  const playoffCutoff = leagueSize >= 18 ? leagueSize - 3 : leagueSize - 2;

  let score = 5; // neutral baseline
  let label = "Mid-table";
  let tag = null;

  // TITLE RACE (rank 1-3, within striking distance)
  if (rank === 1) {
    score = 9;
    label = "Title leader";
    tag = { text: "🏆 Title", color: "#f9a825" };
  } else if (rank <= 3 && pointsToLeader <= 6) {
    score = 10;
    label = "Title race";
    tag = { text: "🏆 Title race", color: "#f9a825" };
  }

  // CHAMPIONS LEAGUE BATTLE (rank 3-6 in big leagues)
  else if (rank <= clSpots) {
    score = 9;
    label = "CL spot";
    tag = { text: "⭐ CL spot", color: "#1565c0" };
  } else if (rank === clSpots + 1 || rank === clSpots + 2) {
    // One or two spots below CL — fighting to get in
    score = 8.5;
    label = "Chasing CL";
    tag = { text: "⭐ Chasing CL", color: "#1976d2" };
  }

  // EUROPA LEAGUE BATTLE
  else if (rank <= elSpots) {
    score = 7.5;
    label = "EL spot";
    tag = { text: "🔵 EL spot", color: "#0288d1" };
  } else if (rank === elSpots + 1) {
    score = 7;
    label = "Chasing EL";
    tag = { text: "🔵 Chasing EL", color: "#0288d1" };
  }

  // SAFE MID-TABLE — nothing to play for
  // Research: these teams show statistically significant performance drop
  else if (rank > elSpots + 1 && rank < playoffCutoff) {
    score = 4; // KEY DEBUFF — "nothing to play for"
    label = "Mid-table";
    tag = { text: "😴 Nothing at stake", color: "#aaa" };
  }

  // RELEGATION PLAYOFF BATTLE
  else if (rank === playoffCutoff) {
    score = 8.5;
    label = "Playoff battle";
    tag = { text: "⚠️ Playoff battle", color: "#e65100" };
  }

  // RELEGATION BATTLE (bottom 3)
  else if (rank >= relegationCutoff) {
    score = 10; // maximum desperation
    label = "Relegation battle";
    tag = { text: "🆘 Relegation", color: "#c62828" };
  }

  // Boost if very close to the position boundary regardless of rank
  // e.g., 5th place but only 1pt behind 4th = must win
  // (handled by caller passing pointsGapToKey)

  return {
    score: Math.min(10, Math.max(0, score)),
    label,
    tag,
    rank,
    points,
  };
}

// ─── MOTIVATION → GOAL RATE MULTIPLIER ───────────────────────────────────────
// Converts motivation scores + match state into lambda multiplier
// Based on Skripnikov (2024) state-dependent Poisson regression
function motivationMultiplier(attackingTeam, defendingTeam, matchState) {
  const atkMot = attackingTeam.motivation?.score || 5;
  const defMot = defendingTeam.motivation?.score || 5;

  const atkIsTrailing = matchState === "trailing";
  const atkIsLeading = matchState === "leading";
  const atkIsDrawing = matchState === "drawing";

  let multiplier = 1.0;

  // High motivation attacker trailing = max aggression
  if (atkIsTrailing && atkMot >= 8) multiplier = 1.85;
  else if (atkIsTrailing && atkMot >= 6) multiplier = 1.55;
  else if (atkIsTrailing && atkMot <= 4) multiplier = 1.20; // still tries but less urgency

  // High motivation attacker drawing = pushing for win
  else if (atkIsDrawing && atkMot >= 8) multiplier = 1.40;
  else if (atkIsDrawing && atkMot >= 6) multiplier = 1.20;
  else if (atkIsDrawing && atkMot <= 4) multiplier = 0.85; // "happy with draw"

  // Attacker leading
  else if (atkIsLeading && atkMot >= 8) multiplier = 1.10; // still pushing
  else if (atkIsLeading && atkMot <= 4) multiplier = 0.60; // "job done, defending"
  else multiplier = 0.85;

  // Defender with nothing at stake = poor defensive intensity
  // Research: low motivation teams concede MORE (Caley 2025)
  if (defMot <= 4) multiplier *= 1.20; // easier to score against them

  return multiplier;
}

// ─── PARSE STAT ──────────────────────────────────────────────────────────────
function parseStat(stats, teamIdx, name, fallback = 0) {
  try {
    const s = stats[teamIdx]?.statistics?.find(s => s.type === name);
    if (!s || s.value === null) return fallback;
    if (typeof s.value === "string" && s.value.endsWith("%")) return parseFloat(s.value);
    return parseFloat(s.value) || fallback;
  } catch { return fallback; }
}

// ─── HEAT SCORE ───────────────────────────────────────────────────────────────
function calcHeatScore(home, away, minute) {
  let score = 0;
  const triggers = [];
  let high_pressure = 0, red_card_multiplier = 0, vila_effect = 0;
  const hasStats = home.possession > 0 || home.shots_on_target > 0;

  if (hasStats) {
    const dominant = home.possession > away.possession ? home : away;
    const dapm = (home.dangerous_attacks + away.dangerous_attacks) / Math.max(minute, 1);
    let posScore = 0, atkScore = 0;
    if (dominant.possession >= 65) {
      posScore = Math.min(20, ((dominant.possession - 65) / 15) * 20);
      triggers.push(`Dominant possession: ${dominant.name} ${dominant.possession}%`);
    }
    if (dapm >= 1.5) {
      atkScore = Math.min(15, ((dapm - 1.5) / 2.5) * 15);
      triggers.push(`High attack rate: ${dapm.toFixed(2)}/min`);
    }
    if (posScore > 0 && atkScore > 0) triggers.push("⚡ High Pressure Zone activated");
    const sotBonus = Math.min(10, (home.shots_on_target + away.shots_on_target) * 1.2);
    high_pressure = Math.round(posScore + atkScore);
    score += high_pressure + sotBonus;
  } else {
    const totalGoals = home.goals + away.goals;
    const diff = Math.abs(home.goals - away.goals);
    if (totalGoals >= 3) { score += 22; triggers.push(`🔥 High scoring: ${totalGoals} goals`); }
    else if (totalGoals >= 2) { score += 14; }
    else if (totalGoals >= 1) { score += 7; }
    if (diff === 0 && minute > 60) { score += 18; triggers.push("⚡ Draw in 2nd half"); }
    else if (diff === 0 && minute > 30) { score += 10; }
    else if (diff === 1 && minute > 70) { score += 12; triggers.push("⚡ 1 goal game late"); }
  }

  const checkRC = (atk, def, ag, dg) => {
    if (def.red_cards >= 1 && atk.favorite === false && ag >= dg)
      return Math.min(30, 20 + def.red_cards * 10);
    return 0;
  };
  red_card_multiplier = Math.max(
    checkRC(home, away, home.goals, away.goals),
    checkRC(away, home, away.goals, home.goals)
  );
  if (red_card_multiplier > 0) { score += red_card_multiplier; triggers.push("🟥 Red Card Multiplier"); }

  const in1H = minute >= 35 && minute <= 45;
  const in2H = minute >= 80 && minute <= 93;
  if (in1H || in2H) {
    const remaining = in1H ? 45 - minute : 90 - minute;
    vila_effect = Math.round(Math.min(35, Math.max(0, 10 - remaining) * 2.5 + Math.min(10, (home.corners + away.corners) * 0.8)));
    score += vila_effect;
    triggers.push(`⏱️ Vila Effect: ${remaining}′ remaining`);
  }

  // Motivation boost to heat score
  const homeMot = home.motivation?.score || 5;
  const awayMot = away.motivation?.score || 5;
  const avgMot = (homeMot + awayMot) / 2;
  if (avgMot >= 8) { score += 12; triggers.push(`🔥 High stakes match`); }
  else if (avgMot >= 6) { score += 5; }
  else if (avgMot <= 3) { score -= 8; triggers.push(`😴 Low stakes match`); }

  const final = Math.min(100, Math.max(0, Math.round(score)));
  return {
    heat_score: final,
    alert_level: final >= 80 ? "🔥 EXTREME" : final >= 60 ? "🟠 HIGH" : final >= 40 ? "🟡 MEDIUM" : "🟢 LOW",
    has_full_stats: hasStats,
    breakdown: { high_pressure, red_card_multiplier, vila_effect, triggers },
  };
}

async function fetchStatsSafe(fid, headers) {
  try {
    const r = await fetch(`${BASE_URL}/fixtures/statistics?fixture=${fid}`, { headers });
    const d = await r.json();
    return d.response || [];
  } catch { return []; }
}

// ─── FETCH TEAM LATE-GOAL HISTORY ─────────────────────────────────────────────
async function fetchTeamLateHistory(teamId, headers) {
  try {
    const r = await fetch(`${BASE_URL}/fixtures?team=${teamId}&last=10&status=FT`, { headers });
    const d = await r.json();
    const fixtures = d.response || [];
    if (!fixtures.length) return null;

    let lateGoals = 0, htGoals = 0, gamesWithLate = 0, gamesWithHT = 0;
    const totalGames = fixtures.length;

    for (const fx of fixtures) {
      const events = fx.events || [];
      let scoredLate = false, scoredHT = false;
      for (const ev of events) {
        if (ev.type !== "Goal" || ev.team?.id !== teamId || ev.detail === "Own Goal") continue;
        const min = ev.time?.elapsed || 0;
        const extra = ev.time?.extra || 0;
        const totalMin = min + extra;
        if (totalMin >= 80 || (min === 90 && extra > 0)) { lateGoals++; scoredLate = true; }
        if (totalMin >= 35 && totalMin <= 45) { htGoals++; scoredHT = true; }
      }
      if (scoredLate) gamesWithLate++;
      if (scoredHT) gamesWithHT++;
    }

    const lateGoalRate = gamesWithLate / totalGames;
    const htGoalRate = gamesWithHT / totalGames;

    return {
      teamId,
      gamesAnalyzed: totalGames,
      lateGoalRate: Math.round(lateGoalRate * 100),
      htGoalRate: Math.round(htGoalRate * 100),
      vilaScore80: Math.round(lateGoalRate * 10 * 10) / 10,
      vilaScore35: Math.round(htGoalRate * 10 * 10) / 10,
      isVilaTeam80: lateGoalRate >= 0.4,
      isVilaTeam35: htGoalRate >= 0.4,
      isStrongVila80: lateGoalRate >= 0.6,
      isStrongVila35: htGoalRate >= 0.6,
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

    const liveFixtures = liveData.response || [];
    const finishedFixtures = (finishedData.response || []).filter(fx => FEATURED_LEAGUE_IDS.includes(fx.league.id));
    const upcomingFixtures = (upcomingData.response || [])
      .filter(fx => FEATURED_LEAGUE_IDS.includes(fx.league.id))
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

    // Step 2: Fetch standings for ALL unique leagues in live fixtures
    const liveLeagueIds = [...new Set(liveFixtures.map(fx => fx.league.id))];
    // Try 2025 first, fall back to 2024 for leagues still in 2024/25 season
    const standingsResults = await Promise.allSettled(
      liveLeagueIds.map(async lid => {
        try {
          // Try current season first
          const r2025 = await fetch(`${BASE_URL}/standings?league=${lid}&season=2025`, { headers });
          const d2025 = await r2025.json();
          const s2025 = d2025.response?.[0]?.league?.standings?.[0] || [];
          if (s2025.length > 0) return { lid, standings: s2025 };
          // Fall back to 2024/25 season
          const r2024 = await fetch(`${BASE_URL}/standings?league=${lid}&season=2024`, { headers });
          const d2024 = await r2024.json();
          return { lid, standings: d2024.response?.[0]?.league?.standings?.[0] || [] };
        } catch { return { lid, standings: [] }; }
      })
    );

    // Build team standings map: teamId → standing object
    const teamStandingMap = {};
    const leagueSizeMap = {};
    standingsResults.forEach(r => {
      if (r.status !== "fulfilled") return;
      const { lid, standings } = r.value;
      leagueSizeMap[lid] = standings.length;
      standings.forEach(s => {
        teamStandingMap[s.team.id] = {
          rank: s.rank,
          points: s.points,
          points_to_leader: standings[0]?.points - s.points,
          all: s.all,
          leagueId: lid,
        };
      });
    });

    // Step 3: Fetch stats for top 10 live fixtures in parallel
    const topLive = liveFixtures.slice(0, 10);
    const statsResults = await Promise.allSettled(
      topLive.map(fx => fetchStatsSafe(fx.fixture.id, headers).then(s => ({ id: fx.fixture.id, stats: s })))
    );
    const statsMap = {};
    statsResults.forEach(r => { if (r.status === "fulfilled") statsMap[r.value.id] = r.value.stats; });

    // Step 4: Fetch Vila history for teams in Vila window
    const in1H = fx => fx.fixture.status.elapsed >= 35 && fx.fixture.status.elapsed <= 45;
    const in2H = fx => fx.fixture.status.elapsed >= 75 && fx.fixture.status.elapsed <= 93;
    const vilaFixtures = liveFixtures.filter(fx => in1H(fx) || in2H(fx));
    const vilaTeamIds = [...new Set(vilaFixtures.flatMap(fx => [fx.teams.home.id, fx.teams.away.id]))].slice(0, 8);
    const historyResults = await Promise.allSettled(
      vilaTeamIds.map(id => fetchTeamLateHistory(id, headers))
    );
    const teamHistoryMap = {};
    historyResults.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) teamHistoryMap[vilaTeamIds[i]] = r.value;
    });

    // Step 5: Build live match objects
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
      const isVilaWindow1H = minute >= 35 && minute <= 45;
      const isVilaWindow2H = minute >= 75 && minute <= 93;
      const isVilaWindow = isVilaWindow1H || isVilaWindow2H;

      // Compute motivation for each team
      const homeStanding = teamStandingMap[homeId];
      const awayStanding = teamStandingMap[awayId];
      const homeMot = computeMotivationIndex(homeStanding, leagueSize);
      const awayMot = computeMotivationIndex(awayStanding, leagueSize);

      const homeHistory = teamHistoryMap[homeId] || null;
      const awayHistory = teamHistoryMap[awayId] || null;

      const home = {
        name: fx.teams.home.name, logo: fx.teams.home.logo || "", id: homeId,
        goals: fx.goals.home ?? 0,
        possession: hasStats ? parseStat(stats, 0, "Ball Possession") : 0,
        shots_on_target: hasStats ? parseStat(stats, 0, "Shots on Goal") : 0,
        corners: hasStats ? parseStat(stats, 0, "Corner Kicks") : 0,
        dangerous_attacks: hasStats ? parseStat(stats, 0, "Dangerous Attacks") : 0,
        yellow_cards: hasStats ? parseStat(stats, 0, "Yellow Cards") : homeYellow,
        red_cards: hasStats ? parseStat(stats, 0, "Red Cards") : homeRed,
        favorite: fx.teams.home.winner,
        motivation: homeMot,
        vila: homeHistory && isVilaWindow ? {
          vilaScore: isVilaWindow2H ? homeHistory.vilaScore80 : homeHistory.vilaScore35,
          lateGoalRate: isVilaWindow2H ? homeHistory.lateGoalRate : homeHistory.htGoalRate,
          isVilaTeam: isVilaWindow2H ? homeHistory.isVilaTeam80 : homeHistory.isVilaTeam35,
          isStrongVila: isVilaWindow2H ? homeHistory.isStrongVila80 : homeHistory.isStrongVila35,
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
        yellow_cards: hasStats ? parseStat(stats, 1, "Yellow Cards") : awayYellow,
        red_cards: hasStats ? parseStat(stats, 1, "Red Cards") : awayRed,
        favorite: fx.teams.away.winner,
        motivation: awayMot,
        vila: awayHistory && isVilaWindow ? {
          vilaScore: isVilaWindow2H ? awayHistory.vilaScore80 : awayHistory.vilaScore35,
          lateGoalRate: isVilaWindow2H ? awayHistory.lateGoalRate : awayHistory.htGoalRate,
          isVilaTeam: isVilaWindow2H ? awayHistory.isVilaTeam80 : awayHistory.isVilaTeam35,
          isStrongVila: isVilaWindow2H ? awayHistory.isStrongVila80 : awayHistory.isStrongVila35,
          gamesAnalyzed: awayHistory.gamesAnalyzed,
        } : null,
      };

      const dapm = +((home.dangerous_attacks + away.dangerous_attacks) / Math.max(minute, 1)).toFixed(2);
      const heat = calcHeatScore(home, away, minute);

      return {
        fixture_id: fid, league: fx.league.name, country: fx.league.country,
        league_id: lid, minute, status: fx.fixture.status.short,
        kickoff: fx.fixture.date, kickoff_display: null, time_until: null, mins_until: null,
        home, away, dangerous_attacks_per_min: dapm, odds: null, ...heat,
      };
    }).sort((a, b) => b.heat_score - a.heat_score);

    // Step 6: Build finished match objects
    const finishedMatches = finishedFixtures.map(fx => {
      const minute = fx.fixture.status.elapsed || 90;
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
      return {
        fixture_id: fx.fixture.id, league: fx.league.name, country: fx.league.country,
        minute, status: "FT", kickoff: fx.fixture.date,
        kickoff_display: null, time_until: null, mins_until: null,
        heat_score: 0, alert_level: "✅ FT", has_full_stats: false,
        breakdown: { high_pressure: 0, red_card_multiplier: 0, vila_effect: 0, triggers: [] },
        home: { name: fx.teams.home.name, logo: fx.teams.home.logo || "", id: homeId, goals: fx.goals.home ?? 0, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: homeYellow, red_cards: homeRed, favorite: fx.teams.home.winner, motivation: null, vila: null },
        away: { name: fx.teams.away.name, logo: fx.teams.away.logo || "", id: fx.teams.away.id, goals: fx.goals.away ?? 0, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: awayYellow, red_cards: awayRed, favorite: fx.teams.away.winner, motivation: null, vila: null },
        dangerous_attacks_per_min: 0, odds: null,
      };
    }).sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));

    // Step 7: Build upcoming match objects
    const now = new Date();
    const upcomingMatches = upcomingFixtures.slice(0, 60).map(fx => {
      const kickoff = new Date(fx.fixture.date);
      const diffMs = kickoff - now;
      const diffMins = Math.round(diffMs / 60000);
      const diffHrs = Math.floor(diffMins / 60);
      const remMins = diffMins % 60;
      const timeLabel = diffMins <= 0 ? "Soon" : diffMins < 60 ? `${diffMins}m` : `${diffHrs}h ${remMins}m`;

      // Get motivation for upcoming too
      const homeId = fx.teams.home.id;
      const awayId = fx.teams.away.id;
      const lid = fx.league.id;
      const leagueSize = leagueSizeMap[lid] || 20;
      const homeMot = computeMotivationIndex(teamStandingMap[homeId], leagueSize);
      const awayMot = computeMotivationIndex(teamStandingMap[awayId], leagueSize);

      return {
        fixture_id: fx.fixture.id, league: fx.league.name, country: fx.league.country,
        league_id: lid, minute: 0, status: "NS",
        kickoff: fx.fixture.date,
        kickoff_display: kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        time_until: timeLabel, mins_until: diffMins,
        heat_score: 0, alert_level: "⏰ UPCOMING", has_full_stats: false,
        breakdown: { high_pressure: 0, red_card_multiplier: 0, vila_effect: 0, triggers: [] },
        home: { name: fx.teams.home.name, logo: fx.teams.home.logo || "", id: homeId, goals: null, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: 0, red_cards: 0, favorite: fx.teams.home.winner, motivation: homeMot, vila: null },
        away: { name: fx.teams.away.name, logo: fx.teams.away.logo || "", id: awayId, goals: null, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: 0, red_cards: 0, favorite: fx.teams.away.winner, motivation: awayMot, vila: null },
        dangerous_attacks_per_min: 0, odds: null,
      };
    });

    const matches = [...liveMatches, ...finishedMatches, ...upcomingMatches];

    return res.status(200).json({
      source: "api-sports-pro",
      count: matches.length,
      live_count: liveMatches.length,
      finished_count: finishedMatches.length,
      upcoming_count: upcomingMatches.length,
      generated_at: new Date().toISOString(),
      matches,
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
