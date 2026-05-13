// api/live.js — API-Sports PRO plan
// Full stats: possession, shots, corners, dangerous attacks

const BASE_URL = "https://v3.football.api-sports.io";

function parseStat(stats, teamIdx, name, fallback = 0) {
  try {
    const team = stats[teamIdx];
    if (!team) return fallback;
    const s = team.statistics.find(s => s.type === name);
    if (!s || s.value === null || s.value === undefined) return fallback;
    if (typeof s.value === "string" && s.value.endsWith("%")) return parseFloat(s.value);
    return parseFloat(s.value) || fallback;
  } catch { return fallback; }
}

function calcHeatScore(match) {
  const { home, away, minute, dangerous_attacks_per_min: dapm } = match;
  let score = 0;
  const triggers = [];
  let high_pressure = 0, red_card_multiplier = 0, vila_effect = 0;

  // A) High Pressure (max 35pts)
  const dominant = home.possession >= away.possession ? home : away;
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

  // B) Red Card Multiplier (max 30pts)
  const checkRC = (atk, def, ag, dg) => {
    if (def.red_cards >= 1 && ag >= dg) return Math.min(30, 20 + def.red_cards * 10);
    return 0;
  };
  red_card_multiplier = Math.max(
    checkRC(home, away, home.goals, away.goals),
    checkRC(away, home, away.goals, home.goals)
  );
  if (red_card_multiplier > 0) {
    score += red_card_multiplier;
    triggers.push("🟥 Red Card Multiplier active");
  }

  // C) Vila Effect (max 35pts)
  const in1H = minute >= 35 && minute <= 45;
  const in2H = minute >= 80 && minute <= 93;
  if (in1H || in2H) {
    const remaining = in1H ? 45 - minute : 90 - minute;
    const urgency = Math.max(0, 10 - remaining);
    const cornerP = Math.min(10, (home.corners + away.corners) * 0.8);
    vila_effect = Math.round(Math.min(35, urgency * 2.5 + cornerP));
    score += vila_effect;
    triggers.push(`⏱️ Vila Effect: ${remaining}′ remaining`);
  }

  const final = Math.min(100, Math.max(0, Math.round(score)));
  return {
    heat_score: final,
    alert_level: final >= 80 ? "🔥 EXTREME" : final >= 60 ? "🟠 HIGH" : final >= 40 ? "🟡 MEDIUM" : "🟢 LOW",
    breakdown: { high_pressure, red_card_multiplier, vila_effect, triggers },
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "APISPORTS_KEY not set in Vercel environment variables" });
  }

  const headers = {
    "x-apisports-key": apiKey,
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": "v3.football.api-sports.io",
  };

  try {
    // 1. Get all live fixtures
    const fixtRes = await fetch(`${BASE_URL}/fixtures?live=all`, { headers });
    if (!fixtRes.ok) {
      return res.status(502).json({ error: `API error: ${fixtRes.status}`, detail: await fixtRes.text() });
    }

    const fixtData = await fixtRes.json();

    if (fixtData.errors && Object.keys(fixtData.errors).length > 0) {
      return res.status(401).json({ error: "Auth error", detail: fixtData.errors });
    }

    const fixtures = fixtData.response || [];
    if (fixtures.length === 0) {
      return res.status(200).json({ source: "api-sports", count: 0, matches: [], message: "No live matches right now" });
    }

    // Log how many fixtures we got
    console.log(`Got ${fixtures.length} live fixtures`);

    // 2. Fetch stats for each fixture
    const matches = [];
    for (const fx of fixtures.slice(0, 15)) {
      try {
        const fid = fx.fixture.id;
        const minute = fx.fixture.status.elapsed || 0;

        // Fetch statistics
        const statRes = await fetch(`${BASE_URL}/fixtures/statistics?fixture=${fid}`, { headers });
        const statData = await statRes.json();
        const stats = statData.response || [];

        console.log(`Fixture ${fid}: got ${stats.length} team stat objects`);

        // Log raw stat types available for debugging
        if (stats.length > 0) {
          const types = stats[0].statistics.map(s => `${s.type}:${s.value}`).join(", ");
          console.log(`Stat types for fixture ${fid}: ${types}`);
        }

        const home = {
          name: fx.teams.home.name,
          logo: fx.teams.home.logo || "",
          goals: fx.goals.home ?? 0,
          possession: parseStat(stats, 0, "Ball Possession"),
          shots_on_target: parseStat(stats, 0, "Shots on Goal"),
          corners: parseStat(stats, 0, "Corner Kicks"),
          dangerous_attacks: parseStat(stats, 0, "Dangerous Attacks"),
          yellow_cards: parseStat(stats, 0, "Yellow Cards"),
          red_cards: parseStat(stats, 0, "Red Cards"),
          favorite: fx.teams.home.winner,
        };

        const away = {
          name: fx.teams.away.name,
          logo: fx.teams.away.logo || "",
          goals: fx.goals.away ?? 0,
          possession: parseStat(stats, 1, "Ball Possession"),
          shots_on_target: parseStat(stats, 1, "Shots on Goal"),
          corners: parseStat(stats, 1, "Corner Kicks"),
          dangerous_attacks: parseStat(stats, 1, "Dangerous Attacks"),
          yellow_cards: parseStat(stats, 1, "Yellow Cards"),
          red_cards: parseStat(stats, 1, "Red Cards"),
          favorite: fx.teams.away.winner,
        };

        const dapm = +((home.dangerous_attacks + away.dangerous_attacks) / Math.max(minute, 1)).toFixed(2);

        const base = {
          fixture_id: fid,
          league: fx.league.name,
          country: fx.league.country,
          minute,
          status: fx.fixture.status.short,
          home,
          away,
          dangerous_attacks_per_min: dapm,
          odds: null,
          // Include raw stats for debugging
          _raw_stat_count: stats.length,
        };

        const heat = calcHeatScore(base);
        matches.push({ ...base, ...heat });

        // Rate limit buffer
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.error(`Failed fixture ${fx.fixture?.id}:`, e.message);
      }
    }

    matches.sort((a, b) => b.heat_score - a.heat_score);

    return res.status(200).json({
      source: "api-sports-pro",
      count: matches.length,
      generated_at: new Date().toISOString(),
      matches,
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
