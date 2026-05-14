// api/all.js — live + upcoming fixtures with per-team late-goal history
// Fetches last 10 games per team to compute late-minute scoring skill
// Vila window badge only shown if team has proven late-goal history

const BASE_URL = "https://v3.football.api-sports.io";

const FEATURED_LEAGUE_IDS = [
  39, 140, 78, 135, 61, 2, 3, 848, 45, 143, 137, 66,
  40, 88, 94, 179, 203, 253, 262, 307, 235,
];

function parseStat(stats, teamIdx, name, fallback = 0) {
  try {
    const s = stats[teamIdx]?.statistics?.find(s => s.type === name);
    if (!s || s.value === null) return fallback;
    if (typeof s.value === "string" && s.value.endsWith("%")) return parseFloat(s.value);
    return parseFloat(s.value) || fallback;
  } catch { return fallback; }
}

// ─── FETCH TEAM LATE-GOAL HISTORY ─────────────────────────────────────────────
// Analyzes last 10 fixtures for a team to compute:
// - lateGoalRate: % of games where team scored in 80-93'
// - htGoalRate: % of games where team scored in 35-45'
// - lateGoalAvg: avg goals scored in last 10 mins per game
async function fetchTeamLateHistory(teamId, headers) {
  try {
    const r = await fetch(
      `${BASE_URL}/fixtures?team=${teamId}&last=10&status=FT`,
      { headers }
    );
    const d = await r.json();
    const fixtures = d.response || [];
    if (fixtures.length === 0) return null;

    let lateGoals = 0;       // goals scored 80-93'
    let htGoals = 0;         // goals scored 35-45'
    let gamesWithLate = 0;   // games team scored in 80-93'
    let gamesWithHT = 0;     // games team scored in 35-45'
    let totalGames = fixtures.length;

    for (const fx of fixtures) {
      const events = fx.events || [];
      const isHome = fx.teams.home.id === teamId;

      let scoredLate = false;
      let scoredHT = false;

      for (const ev of events) {
        if (ev.type !== "Goal") continue;
        if (ev.team?.id !== teamId) continue;
        // skip own goals
        if (ev.detail === "Own Goal") continue;

        const min = ev.time?.elapsed || 0;
        const extra = ev.time?.extra || 0;
        const totalMin = min + (extra > 0 ? extra : 0);

        if (totalMin >= 80 || (min === 90 && extra > 0)) {
          lateGoals++;
          scoredLate = true;
        }
        if (totalMin >= 35 && totalMin <= 45) {
          htGoals++;
          scoredHT = true;
        }
      }

      if (scoredLate) gamesWithLate++;
      if (scoredHT) gamesWithHT++;
    }

    const lateGoalRate = gamesWithLate / totalGames;   // 0-1
    const htGoalRate = gamesWithHT / totalGames;       // 0-1
    const lateGoalAvg = lateGoals / totalGames;        // avg late goals/game
    const htGoalAvg = htGoals / totalGames;

    // Vila score: 0-10 rating of late-scoring ability
    // >50% games with late goal = strong Vila team
    const vilaScore80 = Math.round(lateGoalRate * 10 * 10) / 10;
    const vilaScore35 = Math.round(htGoalRate * 10 * 10) / 10;

    return {
      teamId,
      gamesAnalyzed: totalGames,
      lateGoalRate: Math.round(lateGoalRate * 100),   // as %
      htGoalRate: Math.round(htGoalRate * 100),
      lateGoalAvg: Math.round(lateGoalAvg * 100) / 100,
      htGoalAvg: Math.round(htGoalAvg * 100) / 100,
      vilaScore80,  // 0-10, how strong late scorer
      vilaScore35,  // 0-10, how strong HT push scorer
      // Thresholds: >5/10 = Vila capable, >7/10 = Vila strong
      isVilaTeam80: lateGoalRate >= 0.4,   // scored late in ≥40% of last 10
      isVilaTeam35: htGoalRate >= 0.4,
      isStrongVila80: lateGoalRate >= 0.6, // scored late in ≥60% of last 10
      isStrongVila35: htGoalRate >= 0.6,
    };
  } catch {
    return null;
  }
}

// ─── HEAT SCORE ────────────────────────────────────────────────────────────────
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
    else if (totalGoals >= 2) { score += 14; triggers.push(`⚽ ${totalGoals} goals scored`); }
    else if (totalGoals >= 1) { score += 7; }
    if (diff === 0 && minute > 60) { score += 18; triggers.push("⚡ Draw in 2nd half"); }
    else if (diff === 0 && minute > 30) { score += 10; triggers.push("⚡ Level game"); }
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
  if (red_card_multiplier > 0) { score += red_card_multiplier; triggers.push("🟥 Red Card Multiplier active"); }

  const in1H = minute >= 35 && minute <= 45;
  const in2H = minute >= 80 && minute <= 93;
  if (in1H || in2H) {
    const remaining = in1H ? 45 - minute : 90 - minute;
    vila_effect = Math.round(Math.min(35, Math.max(0, 10 - remaining) * 2.5 + Math.min(10, (home.corners + away.corners) * 0.8)));
    score += vila_effect;
    triggers.push(`⏱️ Vila Effect: ${remaining}′ remaining`);
  }

  if (home.yellow_cards + away.yellow_cards >= 4) triggers.push(`🟨 ${home.yellow_cards + away.yellow_cards} bookings`);

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) return res.status(500).json({ error: "APISPORTS_KEY not set" });

  const headers = { "x-apisports-key": apiKey };

  try {
    const today = new Date().toISOString().split("T")[0];

    // Step 1: Fetch live + upcoming in parallel
    const [liveRes, upcomingRes] = await Promise.all([
      fetch(`${BASE_URL}/fixtures?live=all`, { headers }),
      fetch(`${BASE_URL}/fixtures?date=${today}&status=NS`, { headers }),
    ]);
    const [liveData, upcomingData] = await Promise.all([liveRes.json(), upcomingRes.json()]);

    const liveFixtures = liveData.response || [];
    const upcomingFixtures = (upcomingData.response || [])
      .filter(fx => FEATURED_LEAGUE_IDS.includes(fx.league.id))
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

    // Step 2: Fetch stats for top 10 live fixtures in parallel
    const topLive = liveFixtures.slice(0, 10);
    const statsResults = await Promise.allSettled(
      topLive.map(fx => fetchStatsSafe(fx.fixture.id, headers).then(s => ({ id: fx.fixture.id, stats: s })))
    );
    const statsMap = {};
    statsResults.forEach(r => { if (r.status === "fulfilled") statsMap[r.value.id] = r.value.stats; });

    // Step 3: Fetch team history for Vila analysis
    // Only fetch for live matches in Vila window to save API quota
    const in1H = m => m.fixture.status.elapsed >= 35 && m.fixture.status.elapsed <= 45;
    const in2H = m => m.fixture.status.elapsed >= 75 && m.fixture.status.elapsed <= 93;
    const vilaFixtures = liveFixtures.filter(fx => in1H(fx) || in2H(fx));

    // Collect unique team IDs from Vila window fixtures
    const vilaTeamIds = new Set();
    vilaFixtures.forEach(fx => {
      vilaTeamIds.add(fx.teams.home.id);
      vilaTeamIds.add(fx.teams.away.id);
    });

    // Fetch history for each Vila team in parallel (max 8 teams to save quota)
    const vilaTeamArr = [...vilaTeamIds].slice(0, 8);
    const historyResults = await Promise.allSettled(
      vilaTeamArr.map(id => fetchTeamLateHistory(id, headers))
    );
    const teamHistoryMap = {};
    historyResults.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) {
        teamHistoryMap[vilaTeamArr[i]] = r.value;
      }
    });

    // Step 4: Build live match objects
    const liveMatches = liveFixtures.map(fx => {
      const fid = fx.fixture.id;
      const stats = statsMap[fid] || [];
      const minute = fx.fixture.status.elapsed || 0;
      const events = fx.events || [];
      const homeId = fx.teams.home.id;
      const awayId = fx.teams.away.id;

      let homeYellow = 0, awayYellow = 0, homeRed = 0, awayRed = 0;
      events.forEach(e => {
        const isHome = e.team?.id === homeId;
        if (e.type === "Card") {
          if (e.detail === "Yellow Card") isHome ? homeYellow++ : awayYellow++;
          if (e.detail === "Red Card" || e.detail === "Second Yellow card") isHome ? homeRed++ : awayRed++;
        }
      });

      const hasStats = stats.length > 0;

      const home = {
        name: fx.teams.home.name, logo: fx.teams.home.logo || "",
        id: homeId,
        goals: fx.goals.home ?? 0,
        possession: hasStats ? parseStat(stats, 0, "Ball Possession") : 0,
        shots_on_target: hasStats ? parseStat(stats, 0, "Shots on Goal") : 0,
        corners: hasStats ? parseStat(stats, 0, "Corner Kicks") : 0,
        dangerous_attacks: hasStats ? parseStat(stats, 0, "Dangerous Attacks") : 0,
        yellow_cards: hasStats ? parseStat(stats, 0, "Yellow Cards") : homeYellow,
        red_cards: hasStats ? parseStat(stats, 0, "Red Cards") : homeRed,
        favorite: fx.teams.home.winner,
      };
      const away = {
        name: fx.teams.away.name, logo: fx.teams.away.logo || "",
        id: awayId,
        goals: fx.goals.away ?? 0,
        possession: hasStats ? parseStat(stats, 1, "Ball Possession") : 0,
        shots_on_target: hasStats ? parseStat(stats, 1, "Shots on Goal") : 0,
        corners: hasStats ? parseStat(stats, 1, "Corner Kicks") : 0,
        dangerous_attacks: hasStats ? parseStat(stats, 1, "Dangerous Attacks") : 0,
        yellow_cards: hasStats ? parseStat(stats, 1, "Yellow Cards") : awayYellow,
        red_cards: hasStats ? parseStat(stats, 1, "Red Cards") : awayRed,
        favorite: fx.teams.away.winner,
      };

      // Attach team history to each team
      const homeHistory = teamHistoryMap[homeId] || null;
      const awayHistory = teamHistoryMap[awayId] || null;

      // Vila analysis: is each team a proven late scorer?
      const isVilaWindow1H = minute >= 35 && minute <= 45;
      const isVilaWindow2H = minute >= 75 && minute <= 93;

      home.vila = homeHistory ? {
        vilaScore: isVilaWindow2H ? homeHistory.vilaScore80 : homeHistory.vilaScore35,
        lateGoalRate: isVilaWindow2H ? homeHistory.lateGoalRate : homeHistory.htGoalRate,
        isVilaTeam: isVilaWindow2H ? homeHistory.isVilaTeam80 : homeHistory.isVilaTeam35,
        isStrongVila: isVilaWindow2H ? homeHistory.isStrongVila80 : homeHistory.isStrongVila35,
        gamesAnalyzed: homeHistory.gamesAnalyzed,
      } : null;

      away.vila = awayHistory ? {
        vilaScore: isVilaWindow2H ? awayHistory.vilaScore80 : awayHistory.vilaScore35,
        lateGoalRate: isVilaWindow2H ? awayHistory.lateGoalRate : awayHistory.htGoalRate,
        isVilaTeam: isVilaWindow2H ? awayHistory.isVilaTeam80 : awayHistory.isVilaTeam35,
        isStrongVila: isVilaWindow2H ? awayHistory.isStrongVila80 : awayHistory.isStrongVila35,
        gamesAnalyzed: awayHistory.gamesAnalyzed,
      } : null;

      const dapm = +((home.dangerous_attacks + away.dangerous_attacks) / Math.max(minute, 1)).toFixed(2);
      const heat = calcHeatScore(home, away, minute);

      return {
        fixture_id: fid,
        league: fx.league.name, country: fx.league.country,
        minute, status: fx.fixture.status.short,
        kickoff: fx.fixture.date, kickoff_display: null, time_until: null, mins_until: null,
        home, away,
        dangerous_attacks_per_min: dapm,
        odds: null,
        ...heat,
      };
    }).sort((a, b) => b.heat_score - a.heat_score);

    // Step 5: Build upcoming match objects
    const now = new Date();
    const upcomingMatches = upcomingFixtures.slice(0, 60).map(fx => {
      const kickoff = new Date(fx.fixture.date);
      const diffMs = kickoff - now;
      const diffMins = Math.round(diffMs / 60000);
      const diffHrs = Math.floor(diffMins / 60);
      const remMins = diffMins % 60;
      const timeLabel = diffMins <= 0 ? "Soon"
        : diffMins < 60 ? `${diffMins}m`
        : `${diffHrs}h ${remMins}m`;
      return {
        fixture_id: fx.fixture.id,
        league: fx.league.name, country: fx.league.country,
        minute: 0, status: "NS",
        kickoff: fx.fixture.date,
        kickoff_display: kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        time_until: timeLabel, mins_until: diffMins,
        heat_score: 0, alert_level: "⏰ UPCOMING",
        has_full_stats: false,
        breakdown: { high_pressure: 0, red_card_multiplier: 0, vila_effect: 0, triggers: [] },
        home: { name: fx.teams.home.name, logo: fx.teams.home.logo || "", id: fx.teams.home.id, goals: null, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: 0, red_cards: 0, favorite: fx.teams.home.winner, vila: null },
        away: { name: fx.teams.away.name, logo: fx.teams.away.logo || "", id: fx.teams.away.id, goals: null, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: 0, red_cards: 0, favorite: fx.teams.away.winner, vila: null },
        dangerous_attacks_per_min: 0, odds: null,
      };
    });

    const matches = [...liveMatches, ...upcomingMatches];

    return res.status(200).json({
      source: "api-sports-pro",
      count: matches.length,
      live_count: liveMatches.length,
      upcoming_count: upcomingMatches.length,
      vila_teams_analyzed: Object.keys(teamHistoryMap).length,
      generated_at: new Date().toISOString(),
      matches,
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
