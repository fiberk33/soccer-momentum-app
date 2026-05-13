// api/all.js — returns live games + today's upcoming fixtures combined
// Live games come first (sorted by heat score), then upcoming (sorted by kickoff)

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

    // Fetch live and upcoming in parallel
    const [liveRes, upcomingRes] = await Promise.all([
      fetch(`${BASE_URL}/fixtures?live=all`, { headers }),
      fetch(`${BASE_URL}/fixtures?date=${today}&status=NS`, { headers }),
    ]);

    const [liveData, upcomingData] = await Promise.all([
      liveRes.json(),
      upcomingRes.json(),
    ]);

    const liveFixtures = liveData.response || [];
    const upcomingFixtures = (upcomingData.response || [])
      .filter(fx => FEATURED_LEAGUE_IDS.includes(fx.league.id))
      .sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

    // Fetch stats for top live fixtures in parallel
    const PRIORITY_LIVE = liveFixtures.slice(0, 10);
    const statsResults = await Promise.allSettled(
      PRIORITY_LIVE.map(fx =>
        fetchStatsSafe(fx.fixture.id, headers).then(stats => ({ id: fx.fixture.id, stats }))
      )
    );
    const statsMap = {};
    statsResults.forEach(r => { if (r.status === "fulfilled") statsMap[r.value.id] = r.value.stats; });

    // Build live match objects
    const liveMatches = liveFixtures.map(fx => {
      const fid = fx.fixture.id;
      const stats = statsMap[fid] || [];
      const minute = fx.fixture.status.elapsed || 0;
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
      const hasStats = stats.length > 0;
      const home = {
        name: fx.teams.home.name, logo: fx.teams.home.logo || "",
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
        goals: fx.goals.away ?? 0,
        possession: hasStats ? parseStat(stats, 1, "Ball Possession") : 0,
        shots_on_target: hasStats ? parseStat(stats, 1, "Shots on Goal") : 0,
        corners: hasStats ? parseStat(stats, 1, "Corner Kicks") : 0,
        dangerous_attacks: hasStats ? parseStat(stats, 1, "Dangerous Attacks") : 0,
        yellow_cards: hasStats ? parseStat(stats, 1, "Yellow Cards") : awayYellow,
        red_cards: hasStats ? parseStat(stats, 1, "Red Cards") : awayRed,
        favorite: fx.teams.away.winner,
      };
      const dapm = +((home.dangerous_attacks + away.dangerous_attacks) / Math.max(minute, 1)).toFixed(2);
      const heat = calcHeatScore(home, away, minute);
      return { fixture_id: fid, league: fx.league.name, country: fx.league.country, minute, status: fx.fixture.status.short, kickoff: fx.fixture.date, kickoff_display: null, time_until: null, mins_until: null, home, away, dangerous_attacks_per_min: dapm, odds: null, ...heat };
    }).sort((a, b) => b.heat_score - a.heat_score);

    // Build upcoming match objects
    const now = new Date();
    const upcomingMatches = upcomingFixtures.slice(0, 60).map(fx => {
      const kickoff = new Date(fx.fixture.date);
      const diffMs = kickoff - now;
      const diffMins = Math.round(diffMs / 60000);
      const diffHrs = Math.floor(diffMins / 60);
      const remMins = diffMins % 60;
      const timeLabel = diffMins <= 0 ? "Soon" : diffMins < 60 ? `${diffMins}m` : `${diffHrs}h ${remMins}m`;
      const kickoffStr = kickoff.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return {
        fixture_id: fx.fixture.id,
        league: fx.league.name, country: fx.league.country,
        minute: 0, status: "NS",
        kickoff: fx.fixture.date, kickoff_display: kickoffStr,
        time_until: timeLabel, mins_until: diffMins,
        heat_score: 0, alert_level: "⏰ UPCOMING",
        has_full_stats: false,
        breakdown: { high_pressure: 0, red_card_multiplier: 0, vila_effect: 0, triggers: [] },
        home: { name: fx.teams.home.name, logo: fx.teams.home.logo || "", goals: null, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: 0, red_cards: 0, favorite: fx.teams.home.winner },
        away: { name: fx.teams.away.name, logo: fx.teams.away.logo || "", goals: null, possession: 0, shots_on_target: 0, corners: 0, dangerous_attacks: 0, yellow_cards: 0, red_cards: 0, favorite: fx.teams.away.winner },
        dangerous_attacks_per_min: 0, odds: null,
      };
    });

    // Combine: live first, then upcoming
    const matches = [...liveMatches, ...upcomingMatches];

    return res.status(200).json({
      source: "api-sports-pro",
      count: matches.length,
      live_count: liveMatches.length,
      upcoming_count: upcomingMatches.length,
      generated_at: new Date().toISOString(),
      matches,
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}

