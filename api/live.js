// api/live.js — API-Sports PRO, filters to top leagues with confirmed stats coverage

const BASE_URL = "https://v3.football.api-sports.io";

// League IDs confirmed to have live statistics on API-Sports
// Check full list at: https://www.api-football.com/coverage
const SUPPORTED_LEAGUE_IDS = new Set([
  39,   // Premier League
  40,   // Championship
  41,   // League One
  45,   // FA Cup
  48,   // League Cup
  61,   // Ligue 1
  62,   // Ligue 2
  65,   // Coupe de France
  78,   // Bundesliga
  79,   // 2. Bundesliga
  81,   // DFB Pokal
  135,  // Serie A
  136,  // Serie B
  137,  // Coppa Italia
  140,  // La Liga
  141,  // La Liga 2
  143,  // Copa del Rey
  2,    // UEFA Champions League
  3,    // UEFA Europa League
  848,  // UEFA Conference League
  94,   // Primeira Liga (Portugal)
  88,   // Eredivisie
  89,   // Eerste Divisie
  144,  // Jupiler Pro League (Belgium)
  179,  // Scottish Premiership
  203,  // Super Lig (Turkey)
  307,  // Saudi Pro League
  253,  // MLS
  71,   // Serie A (Brazil)
  128,  // Liga Profesional (Argentina)
  262,  // Liga MX
  169,  // Eliteserien (Norway)
  113,  // Allsvenskan (Sweden)
  119,  // Superliga (Denmark)
  106,  // Veikkausliiga (Finland)
  235,  // Russian Premier League
  197,  // Super League (Greece)
  207,  // Super League (Switzerland)
]);

function parseStat(stats, teamIdx, name, fallback = 0) {
  try {
    const s = stats[teamIdx]?.statistics?.find(s => s.type === name);
    if (!s || s.value === null) return fallback;
    if (typeof s.value === "string" && s.value.endsWith("%")) return parseFloat(s.value);
    return parseFloat(s.value) || fallback;
  } catch { return fallback; }
}

function calcHeatScore(match) {
  const { home, away, minute, dangerous_attacks_per_min: dapm } = match;
  let score = 0;
  const triggers = [];
  let high_pressure = 0, red_card_multiplier = 0, vila_effect = 0;

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

  const in1H = minute >= 35 && minute <= 45;
  const in2H = minute >= 80 && minute <= 93;
  if (in1H || in2H) {
    const remaining = in1H ? 45 - minute : 90 - minute;
    vila_effect = Math.round(Math.min(35,
      Math.max(0, 10 - remaining) * 2.5 +
      Math.min(10, (home.corners + away.corners) * 0.8)
    ));
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
      return res.status(401).json({ error: "API-Sports auth error", detail: fixtData.errors });
    }

    const allFixtures = fixtData.response || [];

    // Filter to only leagues with confirmed stats coverage
    const fixtures = allFixtures.filter(fx => SUPPORTED_LEAGUE_IDS.has(fx.league.id));

    if (fixtures.length === 0) {
      // No top-league games live — return all with basic scoring
      return res.status(200).json({
        source: "api-sports-pro",
        count: 0,
        total_live: allFixtures.length,
        message: `${allFixtures.length} matches live but none in top leagues with stats. Try again when EPL/La Liga/Bundesliga etc are playing.`,
        matches: [],
      });
    }

    // 2. Fetch full stats for filtered fixtures (cap at 12)
    const matches = [];
    for (const fx of fixtures.slice(0, 12)) {
      try {
        const fid = fx.fixture.id;
        const statRes = await fetch(`${BASE_URL}/fixtures/statistics?fixture=${fid}`, { headers });
        const statData = await statRes.json();
        const stats = statData.response || [];

        const minute = fx.fixture.status.elapsed || 0;

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
          home, away,
          dangerous_attacks_per_min: dapm,
          odds: null,
        };

        const heat = calcHeatScore(base);
        matches.push({ ...base, ...heat });
        await new Promise(r => setTimeout(r, 120));
      } catch (e) {
        console.error("Stat fetch failed:", e.message);
      }
    }

    matches.sort((a, b) => b.heat_score - a.heat_score);

    return res.status(200).json({
      source: "api-sports-pro",
      count: matches.length,
      total_live: allFixtures.length,
      generated_at: new Date().toISOString(),
      matches,
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
