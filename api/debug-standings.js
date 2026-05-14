// api/debug-standings.js
// Visit /api/debug-standings to see what standings data is returned
// for the currently live leagues

const BASE_URL = "https://v3.football.api-sports.io";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) return res.status(500).json({ error: "APISPORTS_KEY not set" });

  const headers = { "x-apisports-key": apiKey };

  try {
    // Get live fixtures first
    const liveRes = await fetch(`${BASE_URL}/fixtures?live=all`, { headers });
    const liveData = await liveRes.json();
    const fixtures = liveData.response || [];

    if (fixtures.length === 0) {
      return res.status(200).json({ message: "No live fixtures right now" });
    }

    // Get unique league IDs from live fixtures
    const leagueIds = [...new Set(fixtures.map(fx => fx.league.id))].slice(0, 5);

    // Try standings for each
    const results = {};
    for (const lid of leagueIds) {
      const leagueName = fixtures.find(fx => fx.league.id === lid)?.league.name;

      // Try 2025
      const r25 = await fetch(`${BASE_URL}/standings?league=${lid}&season=2025`, { headers });
      const d25 = await r25.json();
      const s25 = d25.response?.[0]?.league?.standings?.[0] || [];

      // Try 2024
      const r24 = await fetch(`${BASE_URL}/standings?league=${lid}&season=2024`, { headers });
      const d24 = await r24.json();
      const s24 = d24.response?.[0]?.league?.standings?.[0] || [];

      results[lid] = {
        leagueName,
        season2025_count: s25.length,
        season2024_count: s24.length,
        season2025_errors: d25.errors,
        season2024_errors: d24.errors,
        sample_team_2025: s25[0] ? { name: s25[0].team.name, rank: s25[0].rank, points: s25[0].points } : null,
        sample_team_2024: s24[0] ? { name: s24[0].team.name, rank: s24[0].rank, points: s24[0].points } : null,
      };
    }

    // Also check account status
    const statusRes = await fetch(`${BASE_URL}/status`, { headers });
    const statusData = await statusRes.json();

    return res.status(200).json({
      account: statusData.response,
      live_fixture_count: fixtures.length,
      leagues_checked: leagueIds.length,
      standings_results: results,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

