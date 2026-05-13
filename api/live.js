// api/live.js — reliable parallel stats fetch for top 10 priority fixtures
// All other live fixtures shown with score-based Heat Score

const BASE_URL = "https://v3.football.api-sports.io";

// Priority leagues get full stats
const PRIORITY_LEAGUES = [
  "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1",
  "Champions League", "Europa League", "Championship", "Eredivisie",
  "Primeira Liga", "Scottish Premiership", "Super Lig"
];

function parseStat(stats, teamIdx, name, fallback = 0) {
  try {
    const s = stats[teamIdx]?.statistics?.find(s => s.type === name);
    if (!s || s.value === null) return fallback;
    if (typeof s.value === "string" && s.value.endsWith("%")) return parseFloat(s.value);
    return parseFloat(s.value) || fallback;
  } catch { return fallback; }
}

function scoreBasedHeat(home, away, minute) {
  let score = 0;
  const triggers = [];
  const totalGoals = home.goals + away.goals;
  const diff = Math.abs(home.goals - away.goals);

  if (totalGoals >= 3) { score += 22; triggers.push(`🔥 High scoring: ${totalGoals} goals`); }
  else if (totalGoals >= 2) { score += 14; triggers.push(`⚽ ${totalGoals} goals scored`); }
  else if (totalGoals >= 1) { score += 7; }

  if (diff === 0 && minute > 60) { score += 18; triggers.push("⚡ Draw in 2nd half — both pushing"); }
  else if (diff === 0 && minute > 30) { score += 10; triggers.push("⚡ Level game"); }
  else if (diff === 1 && minute > 70) { score += 12; triggers.push("⚡ 1 goal game — late pressure"); }
  else if (diff === 1 && minute > 50) { score += 7; }

  if (home.red_cards > 0 || away.red_cards > 0) { score += 25; triggers.push("🟥 Red card — man advantage"); }
  const totalYellow = home.yellow_cards + away.yellow_cards;
  if (totalYellow >= 4) { score += 6; triggers.push(`🟨 ${totalYellow} bookings — heated game`); }

  const in1H = minute >= 35 && minute <= 45;
  const in2H = minute >= 80 && minute <= 93;
  if (in2H) {
    const remaining = 90 - minute;
    score += Math.min(20, Math.max(0, 10 - remaining) * 2.5);
    triggers.push(`⏱️ Vila Effect: ${remaining}′ remaining`);
  } else if (in1H) {
    score += 10;
    triggers.push("⏱️ Vila Effect: end of 1st half");
  }

  return {
    heat_score: Math.min(100, Math.max(0, Math.round(score))),
    has_full_stats: false,
    triggers,
  };
}

function fullStatsHeat(home, away, minute) {
  let score = 0;
  const triggers = [];
  let high_pressure = 0, red_card_multiplier = 0, vila_effect = 0;

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

  const final = Math.min(100, Math.max(0, Math.round(score)));
  return {
    heat_score: final,
    alert_level: final >= 80 ? "🔥 EXTREME" : final >= 60 ? "🟠 HIGH" : final >= 40 ? "🟡 MEDIUM" : "🟢 LOW",
    has_full_stats: true,
    breakdown: { high_pressure, red_card_multiplier, vila_effect, triggers },
    dangerous_attacks_per_min: +dapm.toFixed(2),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) return res.status(500).json({ error: "APISPORTS_KEY not set in Vercel environment variables" });

  const headers = { "x-apisports-key": apiKey };

  try {
    // Step 1: Get all live fixtures (1 API call)
    const fixtRes = await fetch(`${BASE_URL}/fixtures?live=all`, { headers });
    if (!fixtRes.ok) {
      const text = await fixtRes.text();
      return res.status(502).json({ error: `API error: ${fixtRes.status}`, detail: text });
    }
    const fixtData = await fixtRes.json();
    if (fixtData.errors && Object.keys(fixtData.errors).length > 0)
      return res.status(401).json({ error: "Auth error", detail: fixtData.errors });

    const fixtures = fixtData.response || [];
    if (fixtures.length === 0)
      return res.status(200).json({ source: "api-sports-pro", count: 0, total_live: 0, matches: [] });

    // Step 2: Pick top 10 for full stats — priority leagues + Vila window + late games
    const minute = fx => fx.fixture.status.elapsed || 0;
    const isVila = fx => { const m = minute(fx); return (m >= 35 && m <= 45) || (m >= 80 && m <= 93); };
    const isPriority = fx => PRIORITY_LEAGUES.includes(fx.league.name);

    const ranked = [...fixtures].sort((a, b) => {
      const aScore = (isPriority(a) ? 100 : 0) + (isVila(a) ? 50 : 0) + minute(a);
      const bScore = (isPriority(b) ? 100 : 0) + (isVila(b) ? 50 : 0) + minute(b);
      return bScore - aScore;
    });

    const topFixtures = ranked.slice(0, 10);
    const topIds = new Set(topFixtures.map(fx => fx.fixture.id));

    // Step 3: Fetch stats for top 10 in parallel (all at once — fast)
    const statsResults = await Promise.allSettled(
      topFixtures.map(fx =>
        fetch(`${BASE_URL}/fixtures/statistics?fixture=${fx.fixture.id}`, { headers })
          .then(r => r.json())
          .then(d => ({ id: fx.fixture.id, stats: d.response || [] }))
      )
    );

    const statsMap = {};
    statsResults.forEach(result => {
      if (result.status === "fulfilled") {
        statsMap[result.value.id] = result.value.stats;
      }
    });

    // Step 4: Build all match objects
    const matches = fixtures.map(fx => {
      const fid = fx.fixture.id;
      const min = minute(fx);
      const stats = statsMap[fid] || [];
      const hasStats = stats.length > 0;

      // Extract card data from events (available for all fixtures)
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

      const home = {
        name: fx.teams.home.name,
        logo: fx.teams.home.logo || "",
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
        name: fx.teams.away.name,
        logo: fx.teams.away.logo || "",
        goals: fx.goals.away ?? 0,
        possession: hasStats ? parseStat(stats, 1, "Ball Possession") : 0,
        shots_on_target: hasStats ? parseStat(stats, 1, "Shots on Goal") : 0,
        corners: hasStats ? parseStat(stats, 1, "Corner Kicks") : 0,
        dangerous_attacks: hasStats ? parseStat(stats, 1, "Dangerous Attacks") : 0,
        yellow_cards: hasStats ? parseStat(stats, 1, "Yellow Cards") : awayYellow,
        red_cards: hasStats ? parseStat(stats, 1, "Red Cards") : awayRed,
        favorite: fx.teams.away.winner,
      };

      let heatData;
      if (hasStats) {
        heatData = fullStatsHeat(home, away, min);
      } else {
        const sb = scoreBasedHeat(home, away, min);
        heatData = {
          heat_score: sb.heat_score,
          alert_level: sb.heat_score >= 80 ? "🔥 EXTREME" : sb.heat_score >= 60 ? "🟠 HIGH" : sb.heat_score >= 40 ? "🟡 MEDIUM" : "🟢 LOW",
          has_full_stats: false,
          dangerous_attacks_per_min: 0,
          breakdown: { high_pressure: 0, red_card_multiplier: 0, vila_effect: 0, triggers: sb.triggers },
        };
      }

      return {
        fixture_id: fid,
        league: fx.league.name,
        country: fx.league.country,
        minute: min,
        status: fx.fixture.status.short,
        home, away,
        odds: null,
        ...heatData,
      };
    });

    matches.sort((a, b) => b.heat_score - a.heat_score);

    return res.status(200).json({
      source: "api-sports-pro",
      count: matches.length,
      total_live: fixtures.length,
      generated_at: new Date().toISOString(),
      matches,
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
