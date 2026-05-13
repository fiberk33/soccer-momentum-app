// api/live.js — uses api-sports.io directly (not RapidAPI)
// Set APISPORTS_KEY in Vercel → Settings → Environment Variables

const BASE_URL = "https://v3.football.api-sports.io";

function parseStat(stats, teamIdx, name, fallback = 0) {
  try {
    const s = stats[teamIdx]?.statistics?.find(s => s.type === name);
    if (!s || s.value === null) return fallback;
    if (typeof s.value === "string" && s.value.endsWith("%")) return parseFloat(s.value);
    return parseFloat(s.value) || fallback;
  } catch { return fallback; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "APISPORTS_KEY not set in Vercel environment variables" });
  }

  // API-Sports uses x-apisports-key header
  const headers = { "x-apisports-key": apiKey };

  try {
    // 1. Get all live fixtures
    const fixtRes = await fetch(`${BASE_URL}/fixtures?live=all`, { headers });
    if (!fixtRes.ok) {
      const text = await fixtRes.text();
      return res.status(502).json({ error: `API-Sports error: ${fixtRes.status}`, detail: text });
    }

    const fixtData = await fixtRes.json();

    // Check for API-level errors
    if (fixtData.errors && Object.keys(fixtData.errors).length > 0) {
      return res.status(401).json({ error: "API-Sports auth error", detail: fixtData.errors });
    }

    const fixtures = fixtData.response || [];

    if (fixtures.length === 0) {
      return res.status(200).json({ source: "api-sports", count: 0, matches: [] });
    }

    // 2. Fetch stats per fixture (cap at 12 to stay within daily quota)
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

        matches.push({
          fixture_id: fid,
          league: fx.league.name,
          country: fx.league.country,
          minute,
          status: fx.fixture.status.short,
          home,
          away,
          dangerous_attacks_per_min: dapm,
          odds: null,
        });

        await new Promise(r => setTimeout(r, 120));
      } catch (e) {
        console.error("Stat fetch failed:", e.message);
      }
    }

    return res.status(200).json({
      source: "api-sports",
      count: matches.length,
      generated_at: new Date().toISOString(),
      matches,
    });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
