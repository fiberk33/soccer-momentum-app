// api/live.js — fetches all live fixtures + stats in parallel batches
// Handles Vercel 10s timeout by batching stat requests

const BASE_URL = "https://v3.football.api-sports.io";

function parseStat(stats, teamIdx, name, fallback = 0) {
  try {
    const s = stats[teamIdx]?.statistics?.find(s => s.type === name);
    if (!s || s.value === null) return fallback;
    if (typeof s.value === "string" && s.value.endsWith("%")) return parseFloat(s.value);
    return parseFloat(s.value) || fallback;
  } catch { return fallback; }
}

function calcHeatScore(home, away, minute, dapm) {
  let score = 0;
  const triggers = [];
  let high_pressure = 0, red_card_multiplier = 0, vila_effect = 0;

  // A) High Pressure
  const dominant = home.possession > away.possession ? home : away;
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

  // B) Red Card Multiplier
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

  // C) Vila Effect
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
  if (!apiKey) {
    return res.status(500).json({ error: "APISPORTS_KEY not set in Vercel environment variables" });
  }

  const headers = { "x-apisports-key": apiKey };

  try {
    // 1. Get all live fixtures
    const fixtRes = await fetch(`${BASE_URL}/fixtures?live=all`, { headers });
    if (!fixtRes.ok) {
      const text = await fixtRes.text();
      return res.status(502).json({ error: `API error: ${fixtRes.status}`, detail: text });
    }

    const fixtData = await fixtRes.json();

    if (fixtData.errors && Object.keys(fixtData.errors).length > 0) {
      return res.status(401).json({ error: "Auth error", detail: fixtData.errors });
    }

    const fixtures = fixtData.response || [];
    const totalLive = fixtures.length;

    if (fixtures.length === 0) {
      return res.status(200).json({ source: "api-sports-pro", count: 0, total_live: 0, matches: [] });
    }

    // 2. Fetch stats in parallel batches of 5 (stay within timeout)
    // Prioritise matches in Vila window and late games first
    const sorted = [...fixtures].sort((a, b) => {
      const aMin = a.fixture.status.elapsed || 0;
      const bMin = b.fixture.status.elapsed || 0;
      const aVila = (aMin >= 35 && aMin <= 45) || (aMin >= 80 && aMin <= 93);
      const bVila = (bMin >= 35 && bMin <= 45) || (bMin >= 80 && bMin <= 93);
      if (aVila && !bVila) return -1;
      if (!aVila && bVila) return 1;
      return bMin - aMin; // later minute = higher priority
    });

    // Batch parallel fetches — 3 batches of 5 = 15 fixtures with stats
    const withStats = sorted.slice(0, 15);
    const withoutStats = sorted.slice(15); // rest get score-only heat score

    const BATCH_SIZE = 5;
    const statsMap = {};

    for (let i = 0; i < withStats.length; i += BATCH_SIZE) {
      const batch = withStats.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(fx => fetchStatsSafe(fx.fixture.id, headers))
      );
      batch.forEach((fx, idx) => {
        statsMap[fx.fixture.id] = results[idx];
      });
    }

    // 3. Build match objects
    const matches = [];

    for (const fx of fixtures) {
      const fid = fx.fixture.id;
      const stats = statsMap[fid] || [];
      const minute = fx.fixture.status.elapsed || 0;
      const hasStats = stats.length > 0;

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

      // For fixtures without stats, use score-based heat
      if (!hasStats) {
        const totalGoals = home.goals + away.goals;
        const diff = Math.abs(home.goals - away.goals);
        let quickHeat = 0;
        if (totalGoals >= 3) quickHeat += 20;
        else if (totalGoals >= 1) quickHeat += 8;
        if (diff === 0 && minute > 60) quickHeat += 15;
        else if (diff === 0) quickHeat += 8;
        if (diff === 1 && minute > 70) quickHeat += 10;
        const in2H = minute >= 80 && minute <= 93;
        if (in2H) quickHeat += Math.min(20, (10 - (90 - minute)) * 2);
        const hs = Math.min(100, Math.max(0, quickHeat));
        matches.push({
          fixture_id: fid,
          league: fx.league.name,
          country: fx.league.country,
          minute, status: fx.fixture.status.short,
          home, away,
          dangerous_attacks_per_min: 0,
          has_full_stats: false,
          odds: null,
          heat_score: hs,
          alert_level: hs >= 80 ? "🔥 EXTREME" : hs >= 60 ? "🟠 HIGH" : hs >= 40 ? "🟡 MEDIUM" : "🟢 LOW",
          breakdown: { high_pressure: 0, red_card_multiplier: 0, vila_effect: 0, triggers: ["Score-based estimate"] },
        });
        continue;
      }

      const dapm = +((home.dangerous_attacks + away.dangerous_attacks) / Math.max(minute, 1)).toFixed(2);
      const heat = calcHeatScore(home, away, minute, dapm);

      matches.push({
        fixture_id: fid,
        league: fx.league.name,
        country: fx.league.country,
        minute,
        status: fx.fixture.status.short,
        home, away,
        dangerous_attacks_per_min: dapm,
        has_full_stats: true,
        odds: null,
        ...heat,
      });
    }

    matches.sort((a, b) => b.heat_score - a.heat_score);

    return res.status(200).json({
      source: "api-sports-pro",
      count: matches.length,
      total_live: totalLive,
      generated_at: new Date().toISOString(),
      matches,
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
