// api/live.js — single API call with statistics included inline
// API-Sports Pro supports ?statistics=true on the fixtures endpoint

const BASE_URL = "https://v3.football.api-sports.io";

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
  const hasStats = home.possession > 0 || home.shots_on_target > 0 || home.dangerous_attacks > 0;

  if (hasStats) {
    // Full Heat Score with real stats
    const dominant = home.possession > away.possession ? home : away;
    let posScore = 0, atkScore = 0;
    const dapm = (home.dangerous_attacks + away.dangerous_attacks) / Math.max(minute, 1);

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
    // Score-based heat when stats unavailable
    const totalGoals = home.goals + away.goals;
    const diff = Math.abs(home.goals - away.goals);
    if (totalGoals >= 3) { score += 20; triggers.push(`🔥 High scoring: ${totalGoals} goals`); }
    else if (totalGoals >= 1) { score += 8; }
    if (diff === 0 && minute > 60) { score += 15; triggers.push("⚡ Draw in 2nd half"); }
    else if (diff === 0) { score += 8; triggers.push("⚡ Level game"); }
    else if (diff === 1 && minute > 70) { score += 10; triggers.push("⚡ 1 goal game — late pressure"); }
  }

  // Red Card Multiplier (works with or without full stats)
  const checkRC = (atk, def, ag, dg) => {
    if (def.red_cards >= 1 && atk.favorite === false && ag >= dg)
      return Math.min(30, 20 + def.red_cards * 10);
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

  // Vila Effect (works with or without full stats)
  const in1H = minute >= 35 && minute <= 45;
  const in2H = minute >= 80 && minute <= 93;
  if (in1H || in2H) {
    const remaining = in1H ? 45 - minute : 90 - minute;
    const cornerBonus = hasStats ? Math.min(10, (home.corners + away.corners) * 0.8) : 5;
    vila_effect = Math.round(Math.min(35, Math.max(0, 10 - remaining) * 2.5 + cornerBonus));
    score += vila_effect;
    triggers.push(`⏱️ Vila Effect: ${remaining}′ remaining`);
  }

  const final = Math.min(100, Math.max(0, Math.round(score)));
  return {
    heat_score: final,
    alert_level: final >= 80 ? "🔥 EXTREME" : final >= 60 ? "🟠 HIGH" : final >= 40 ? "🟡 MEDIUM" : "🟢 LOW",
    has_full_stats: hasStats,
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

  const headers = { "x-apisports-key": apiKey };

  try {
    // Single call — statistics=true includes stats inline on Pro plan
    const fixtRes = await fetch(
      `${BASE_URL}/fixtures?live=all&statistics=true`,
      { headers }
    );

    if (!fixtRes.ok) {
      const text = await fixtRes.text();
      return res.status(502).json({ error: `API error: ${fixtRes.status}`, detail: text });
    }

    const fixtData = await fixtRes.json();

    if (fixtData.errors && Object.keys(fixtData.errors).length > 0) {
      return res.status(401).json({ error: "Auth error", detail: fixtData.errors });
    }

    const fixtures = fixtData.response || [];

    if (fixtures.length === 0) {
      return res.status(200).json({ source: "api-sports-pro", count: 0, total_live: 0, matches: [] });
    }

    const matches = fixtures.map(fx => {
      const minute = fx.fixture.status.elapsed || 0;

      // Stats may be inline or need separate fetch
      const stats = fx.statistics || [];

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
      const heat = calcHeatScore(home, away, minute);

      return {
        fixture_id: fx.fixture.id,
        league: fx.league.name,
        country: fx.league.country,
        minute,
        status: fx.fixture.status.short,
        home, away,
        dangerous_attacks_per_min: dapm,
        odds: null,
        ...heat,
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
